import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createOrSyncJobFromBid } from '@/lib/jobs/createJobFromBid';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const bidId = request.nextUrl.searchParams.get('bidId');

    if (bidId) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('bid_request_id', bidId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ job: data });
    }

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load jobs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { bidRequestId, overrides } = body || {};

    if (!bidRequestId) {
      return NextResponse.json({ error: 'bidRequestId is required' }, { status: 400 });
    }

    const { data: bid, error: bidErr } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', bidRequestId)
      .single();

    if (bidErr || !bid) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    const result = await createOrSyncJobFromBid(supabase, bid, overrides || {});
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create job' },
      { status: 500 }
    );
  }
}
