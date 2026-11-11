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
      try {
        const scriptPath = path.join(process.cwd(), 'scripts', 'train_classifier.py');
        await execAsync(`python "${scriptPath}"`);
      } catch (trainErr: any) {
        console.warn('Could not run Python retrain (may be running on serverless):', trainErr.message);
      }
    }

    if (!fs.existsSync(metricsPath)) {
      return NextResponse.json(
        { error: 'Model metrics artifact not found.' },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(metricsPath, 'utf-8');
    const raw = JSON.parse(fileContent);

    // Transform raw JSON into the exact shape expected by the frontend
    const perClassArray = Object.entries(raw.per_class_metrics || {}).map(
      ([cls, data]: [string, any]) => ({
        label: cls,
        support: data.support ?? 0,
        precision: Math.round(((data.precision ?? 0) <= 1 ? (data.precision ?? 0) * 100 : (data.precision ?? 0)) * 10) / 10,
        recall: Math.round(((data.recall ?? 0) <= 1 ? (data.recall ?? 0) * 100 : (data.recall ?? 0)) * 10) / 10,
        f1: Math.round(((data.f1 ?? 0) <= 1 ? (data.f1 ?? 0) * 100 : (data.f1 ?? 0)) * 10) / 10,
      })
    ).sort((a, b) => b.support - a.support);

    const misclassifications = (raw.misclassified_samples || []).map((s: any) => ({
      id: String(s.id || ''),
      subject: s.subject || 'No Subject',
      sender: s.snippet || '',
      actual: s.true_label || s.actual || '',
      predicted: s.predicted_label || s.predicted || '',
      confidence: s.confidence || 0,
    }));

    const rawAccuracy = raw.test_accuracy ?? raw.accuracy ?? 0;
    const testAccuracy = rawAccuracy <= 1 ? Math.round(rawAccuracy * 1000) / 10 : rawAccuracy;

    const rawWeightedF1 = raw.weighted_f1 ?? 0;
    const weightedF1 = rawWeightedF1 <= 1 ? Math.round(rawWeightedF1 * 1000) / 10 : rawWeightedF1;

    const rawMacroF1 = raw.macro_f1 ?? 0;
    const macroF1 = rawMacroF1 <= 1 ? Math.round(rawMacroF1 * 1000) / 10 : rawMacroF1;

    const formattedMetrics = {
      trained_at: raw.trained_at || new Date().toISOString(),
      total_samples: raw.total_samples || 549,
      train_samples: raw.train_samples || 439,
      test_samples: raw.test_samples || 110,
      test_accuracy: testAccuracy,
      macro_f1: macroF1,
      weighted_f1: weightedF1,
      categories: raw.classes || raw.categories || [],
      per_class_metrics: perClassArray,
      confusion_matrix: raw.confusion_matrix || [],
      misclassifications: misclassifications,
    };

    return NextResponse.json({ success: true, metrics: formattedMetrics });
  } catch (error: any) {
    console.error('Error fetching ML metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ML metrics' },
      { status: 500 }
    );
  }
}
