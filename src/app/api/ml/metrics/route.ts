import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: NextRequest) {
  try {
    const shouldRetrain = request.nextUrl.searchParams.get('retrain') === 'true';
    const artifactsDir = path.join(process.cwd(), 'ml_artifacts');
    const metricsPath = path.join(artifactsDir, 'model_metrics.json');

    if (shouldRetrain || !fs.existsSync(metricsPath)) {
      const scriptPath = path.join(process.cwd(), 'scripts', 'train_classifier.py');
      await execAsync(`python "${scriptPath}"`);
    }

    if (!fs.existsSync(metricsPath)) {
      return NextResponse.json(
        { error: 'Model metrics not found and training could not complete.' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(metricsPath, 'utf-8');
    const metrics = JSON.parse(fileContent);

    return NextResponse.json({ success: true, metrics });
  } catch (error: any) {
    console.error('Error fetching ML metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ML metrics' },
      { status: 500 }
    );
  }
}
