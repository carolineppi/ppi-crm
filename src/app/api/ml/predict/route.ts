import { NextRequest, NextResponse } from 'next/server';
import { classifyEmailWithML } from '@/lib/ml/classifier';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = classifyEmailWithML({
      subject: body.subject || '',
      bodyText: body.bodyText || '',
      attachments: body.attachments || '',
    });

    return NextResponse.json({
      success: true,
      predictedClass: result.predictedClass,
      confidence: result.confidence,
      probabilities: result.probabilities,
      intent: result.intent,
      sticker: result.sticker,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
