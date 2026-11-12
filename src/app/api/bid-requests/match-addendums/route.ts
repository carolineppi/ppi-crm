import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { runBatchAddendumMatcher } from '@/lib/matching/match-addendums';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));

    const result = await runBatchAddendumMatcher(supabase, {
      singleId: body.id,
      forceAll: Boolean(body.forceAll),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully analyzed ${result.totalUnlinked} Addendums: matched ${result.matchedCount} to active projects (${result.autoDispatchedCount} routed to estimators).`,
      ...result,
    });
  } catch (err: any) {
    console.error('Error in match-addendums endpoint:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to match addendums' },
      { status: 500 }
    );
  }
}
