import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { spawn } from 'child_process';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scriptPath = path.join(process.cwd(), 'scripts', 'predict.py');

    return new Promise<NextResponse>((resolve) => {
      const child = spawn('python', [scriptPath]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          console.error('Python prediction error:', stderr);
          return resolve(
            NextResponse.json(
              { error: stderr || 'Prediction process failed' },
              { status: 500 }
            )
          );
        }

        try {
          const parsed = JSON.parse(stdout);
          return resolve(NextResponse.json(parsed));
        } catch {
          return resolve(
            NextResponse.json(
              { error: 'Invalid JSON response from classifier' },
              { status: 500 }
            )
          );
        }
      });

      child.stdin.write(JSON.stringify(body));
      child.stdin.end();
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
