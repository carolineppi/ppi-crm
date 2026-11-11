import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { spawn } from 'child_process';

function fallbackTypeScriptClassifier(subject: string, bodyText: string, attachments: string) {
  const subj = (subject || '').toLowerCase();
  const top = (bodyText || '').slice(0, 400).toLowerCase();
  const full = `${subj} ${top} ${(bodyText || '').slice(0, 600).toLowerCase()}`;
  const att = (attachments || '').toLowerCase();

  const scores: Record<string, number> = {
    'ITB': 1.0,
    'Addendum': 0.8,
    'RFI/Forms': 0.8,
    'Date Reminder': 0.7,
    'Contractor Awarded': 0.1,
    'Lost': 0.1,
    'Spam': 0.1,
  };

  // 1. Addendum Rules
  if (/\b(addend(um|a)|amendment\s*\d+|amendments?\b)\b/.test(subj)) {
    scores['Addendum'] += 14.0;
  }
  if (/\b(bulletin\s*\d*|revision\s*\d*|rev\s*\d+|alternate(s)?|scopes? of work|site photos?|site pictures?|bid notice\s*\d+|clarification\s*(#|no\.?|\d+))\b/.test(subj)) {
    scores['Addendum'] += 9.0;
  }
  if (/\b(addend|bulletin|revised|amendment)\b/.test(att)) {
    scores['Addendum'] += 7.0;
  }

  // 2. Date Reminder Rules
  if (/\b(reminder|due today|closing soon|bids due|deadline|last call|due tomorrow|bid due date|submit your bid|proposal reminder|bidding status|follow-up|follow up|participation follow-up|due\s+\d{1,2}\/\d{1,2})\b/.test(subj)) {
    scores['Date Reminder'] += 14.0;
  }
  if (/\b(reminder|bids due|due today|due tomorrow|deadline|closing soon|submit your bid|extended to|are you able to provide pricing|please confirm)\b/.test(top)) {
    scores['Date Reminder'] += 9.0;
  }

  // 3. RFI / Forms Rules
  if (/\b(rfi\b|request for information|pre-bid|pre bid|bid form|workbook|key rates|wage rate|prevailing wage|site walk|sign-in sheet|tax exempt)\b/.test(subj) && !/\baddend\b/.test(subj)) {
    scores['RFI/Forms'] += 12.0;
  }
  if (/\b(rfi response|rfi responses|bid form|wage scale|pre-bid rfi|questions and answers|q&a)\b/.test(top)) {
    scores['RFI/Forms'] += 8.0;
  }

  // 4. ITB Rules
  if (/\b(invitation to bid|itb|request for proposal|rfp|bid invitation|seeking bids|bidding opportunity|bid request|new project for bid|request for budgeting|invite to bid|new bid opportunity|bid drawings)\b/.test(subj)) {
    scores['ITB'] += 12.0;
  }
  if (/\b(invitation to bid|pricing a new project|requesting subcontractor bids|seeking proposals)\b/.test(top)) {
    scores['ITB'] += 7.0;
  }
  if (/drawing|plan|spec/.test(full) || att) {
    scores['ITB'] += 2.0;
  }

  // 5. Award / Won Rules
  if (/\b(awarded|contractor awarded|intent to award|notice of award|winning bid|subcontract agreement|award update|bid result)\b/.test(`${subj} ${top}`)) {
    scores['Contractor Awarded'] += 16.0;
  }

  // 6. Lost Rules
  if (/\b(regret to inform|not selected|awarded to another|lost)\b/.test(`${subj} ${top}`)) {
    scores['Lost'] += 15.0;
  }

  // 7. Spam Rules
  if (/\b(seo|lead generation|website design|marketing agency|payroll|unsecured loan|merchant funding|backup code|reset your password)\b/.test(`${subj} ${top}`)) {
    scores['Spam'] += 18.0;
  }

  // Convert scores to softmax probabilities
  const maxScore = Math.max(...Object.values(scores));
  const expScores: Record<string, number> = {};
  let sumExp = 0;
  for (const [k, v] of Object.entries(scores)) {
    const exp = Math.exp((v - maxScore) * 0.5);
    expScores[k] = exp;
    sumExp += exp;
  }

  const probabilities: Record<string, number> = {};
  for (const [k, v] of Object.entries(expScores)) {
    probabilities[k] = Math.round((v / sumExp) * 1000) / 10;
  }

  const sortedProbs = Object.fromEntries(
    Object.entries(probabilities).sort((a, b) => b[1] - a[1])
  );
  const predictedClass = Object.keys(sortedProbs)[0];
  const confidence = Object.values(sortedProbs)[0];

  return {
    success: true,
    predictedClass,
    confidence,
    probabilities: sortedProbs,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scriptPath = path.join(process.cwd(), 'scripts', 'predict.py');

    // Attempt Python model inference first
    const pythonResult = await new Promise<any>((resolve) => {
      try {
        const child = spawn('python', [scriptPath]);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ error: err.message });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            return resolve({ error: stderr || 'Process exit code non-zero' });
          }
          try {
            return resolve(JSON.parse(stdout));
          } catch {
            return resolve({ error: 'JSON parse error from Python output' });
          }
        });

        child.stdin.write(JSON.stringify(body));
        child.stdin.end();
      } catch (e: any) {
        resolve({ error: e.message });
      }
    });

    if (pythonResult && pythonResult.success && !pythonResult.error) {
      return NextResponse.json(pythonResult);
    }

    // Fallback: If Python is unavailable (e.g., in Vercel Serverless container), use rule-weighted engine
    const fallback = fallbackTypeScriptClassifier(
      body.subject || '',
      body.bodyText || '',
      body.attachments || ''
    );
    return NextResponse.json(fallback);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
