/**
 * Production-grade Machine Learning Classifier for Construction Bid Emails.
 * 
 * Powered by a trained Logistic Regression ensemble model with TF-IDF n-grams (1 to 3)
 * and 12 construction-specific domain rule features.
 * 
 * Target Categories:
 * - 'ITB'
 * - 'Addendum / RFI' (Combines Addendum, RFI, Bulletins, Wage Rates, Scopes of Work)
 * - 'Date Reminder'
 * - 'Contractor Awarded' / 'Won'
 * - 'Lost'
 * - 'Spam'
 */

import modelExport from './model_export.json';

export interface MLPredictionResult {
  predictedClass: string;
  confidence: number;
  probabilities: Record<string, number>;
  intent: 'invitation_to_bid' | 'addendum_update' | 'date_reminder' | 'bid_won' | 'bid_lost' | 'spam_noise';
  sticker: 'ITB' | 'Addendum / RFI' | 'Date Reminder' | 'Won' | 'Lost' | 'Spam';
}

interface ModelExportData {
  classes: string[];
  intercept: number[];
  coef: number[][];
  idf: number[];
  vocabulary: Record<string, number>;
  ngram_range: number[];
  sublinear_tf: boolean;
}

const model = modelExport as ModelExportData;

export function extractDenseDomainRules(
  subject: string,
  top: string,
  body: string,
  attachments: string
): number[] {
  const subj = (subject || '').toLowerCase();
  const topText = (top || '').toLowerCase();
  const bodyText = (body || '').toLowerCase();
  const fullTop = `${subj} ${topText}`;
  const attNames = (attachments || '').toLowerCase();

  // 1. ADDENDUM / RFI Combined Rules
  const r_addend_rfi_subj = /\b(addend(um|a)|amendment\s*\d+|amendments?\b|bulletin\s*\d*|revision\s*\d*|rev\s*\d+|alternate(s)?|scopes? of work|site photos?|site pictures?|bid notice\s*\d+|clarification\s*(#|no\.?|\d+)|rfi\b|request for information|pre-bid|pre bid|bid form|workbook|key rates|wage rate|prevailing wage|site walk|sign-in sheet|tax exempt)\b/i.test(
    subj
  )
    ? 1.0
    : 0.0;

  const r_addend_rfi_top = /\b(addend|rfi response|rfi responses|bid form|wage scale|pre-bid rfi|questions and answers|q&a|clarification)\b/i.test(
    topText
  )
    ? 1.0
    : 0.0;

  const r_addend_rfi_att = /\b(addend|bulletin|revised|amendment|rfi|bid form|wage)\b/i.test(
    attNames
  )
    ? 1.0
    : 0.0;

  // 2. DATE REMINDER RULES
  const r_remind_subj = /\b(reminder|due today|closing soon|bids due|deadline|last call|due tomorrow|bid due date|submit your bid|proposal reminder|bidding status|follow-up|follow up|participation follow-up|due\s+\d{1,2}\/\d{1,2})\b/i.test(
    subj
  )
    ? 1.0
    : 0.0;

  const r_remind_top = /\b(reminder|bids due|due today|due tomorrow|deadline|closing soon|submit your bid|extended to|are you able to provide pricing|please confirm)\b/i.test(
    topText
  )
    ? 1.0
    : 0.0;

  // 3. ITB RULES
  const r_itb_subj = /\b(invitation to bid|itb|request for proposal|rfp|bid invitation|seeking bids|bidding opportunity|bid request|new project for bid|request for budgeting|invite to bid|new bid opportunity|bid drawings)\b/i.test(
    subj
  )
    ? 1.0
    : 0.0;

  const r_itb_top = /\b(invitation to bid|pricing a new project|requesting subcontractor bids|seeking proposals)\b/i.test(
    topText
  )
    ? 1.0
    : 0.0;

  // 4. AWARD / WON RULES
  const r_award = /\b(awarded|contractor awarded|intent to award|notice of award|winning bid|subcontract agreement|award update|bid result)\b/i.test(
    fullTop
  )
    ? 1.0
    : 0.0;

  // 5. LOST RULES
  const r_lost = /\b(regret to inform|not selected|awarded to another|lost)\b/i.test(
    fullTop
  )
    ? 1.0
    : 0.0;

  // 6. SPAM RULES
  const r_spam = /\b(seo|lead generation|website design|marketing agency|payroll|unsecured loan|merchant funding|backup code|reset your password)\b/i.test(
    fullTop
  )
    ? 1.0
    : 0.0;

  const hasDrawings =
    fullTop.includes('drawing') || fullTop.includes('plan') ? 1.0 : 0.0;
  const attCount = attachments
    ? Math.min(attachments.split(',').length, 5) * 0.2
    : 0.0;

  return [
    r_addend_rfi_subj * 4.5,
    r_addend_rfi_top * 3.0,
    r_addend_rfi_att * 2.5,
    r_remind_subj * 4.0,
    r_remind_top * 3.0,
    r_itb_subj * 3.5,
    r_itb_top * 2.0,
    r_award * 5.0,
    r_lost * 5.0,
    r_spam * 5.0,
    hasDrawings,
    attCount,
  ];
}

export function classifyEmailWithML(input: {
  subject: string;
  bodyText?: string | null;
  attachments?: string | string[] | null;
}): MLPredictionResult {
  const subj = String(input.subject || '');
  const body = String(input.bodyText || '');
  const attStr = Array.isArray(input.attachments)
    ? input.attachments.join(',')
    : String(input.attachments || '');
  const top = body.slice(0, 400);

  const text = `${subj} ${subj} ${subj} ${subj} ${top} ${top} ${body.slice(
    0,
    500
  )}`.toLowerCase();

  // Extract scikit-learn standard word tokens (?u)\b\w\w+\b
  const words = text.match(/\b\w\w+\b/g) || [];

  // Collect 1-grams, 2-grams, 3-grams
  const termCounts: Record<string, number> = {};
  for (let i = 0; i < words.length; i++) {
    const w1 = words[i];
    termCounts[w1] = (termCounts[w1] || 0) + 1;

    if (i + 1 < words.length) {
      const w2 = `${w1} ${words[i + 1]}`;
      termCounts[w2] = (termCounts[w2] || 0) + 1;
    }

    if (i + 2 < words.length) {
      const w3 = `${w1} ${words[i + 1]} ${words[i + 2]}`;
      termCounts[w3] = (termCounts[w3] || 0) + 1;
    }
  }

  // Calculate TF-IDF
  const sparseFeatures: { idx: number; val: number }[] = [];
  let sumSq = 0;

  for (const [term, count] of Object.entries(termCounts)) {
    const idx = model.vocabulary[term];
    if (idx !== undefined) {
      const tf = 1.0 + Math.log(count);
      const idf = model.idf[idx];
      const val = tf * idf;
      sparseFeatures.push({ idx, val });
      sumSq += val * val;
    }
  }

  // L2 normalization of TF-IDF sparse vector
  const norm = sumSq > 0 ? Math.sqrt(sumSq) : 1.0;
  for (const f of sparseFeatures) {
    f.val /= norm;
  }

  // Dense domain rules
  const dense = extractDenseDomainRules(subj, top, body, attStr);

  // Compute logit z for each class
  const numClasses = model.classes.length;
  const logits = new Array<number>(numClasses).fill(0);

  for (let c = 0; c < numClasses; c++) {
    let z = model.intercept[c];
    const classCoef = model.coef[c];

    // Sparse TF-IDF contributions
    for (const f of sparseFeatures) {
      z += classCoef[f.idx] * f.val;
    }

    // Dense domain rule contributions (offset 6000)
    const denseOffset = 6000;
    for (let d = 0; d < 12; d++) {
      z += classCoef[denseOffset + d] * dense[d];
    }

    logits[c] = z;
  }

  // Softmax
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map((z) => Math.exp(z - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  const probs = expLogits.map((e) => Math.round((e / sumExp) * 1000) / 10);

  const probMap: Record<string, number> = {};
  model.classes.forEach((cls, i) => {
    probMap[cls] = probs[i];
  });

  const sorted = Object.entries(probMap).sort((a, b) => b[1] - a[1]);
  const predictedClass = sorted[0][0];
  const confidence = sorted[0][1];

  // Map to system email_intent and UI sticker
  let intent: MLPredictionResult['intent'] = 'invitation_to_bid';
  let sticker: MLPredictionResult['sticker'] = 'ITB';

  if (predictedClass === 'Addendum / RFI') {
    intent = 'addendum_update';
    sticker = 'Addendum / RFI';
  } else if (
    predictedClass === 'Contractor Awarded' ||
    predictedClass === 'Won'
  ) {
    intent = 'bid_won';
    sticker = 'Won';
  } else if (predictedClass === 'Date Reminder') {
    intent = 'date_reminder';
    sticker = 'Date Reminder';
  } else if (predictedClass === 'Lost') {
    intent = 'bid_lost';
    sticker = 'Lost';
  } else if (predictedClass === 'Spam') {
    intent = 'spam_noise';
    sticker = 'Spam';
  } else {
    intent = 'invitation_to_bid';
    sticker = 'ITB';
  }

  return {
    predictedClass,
    confidence,
    probabilities: Object.fromEntries(sorted),
    intent,
    sticker,
  };
}
