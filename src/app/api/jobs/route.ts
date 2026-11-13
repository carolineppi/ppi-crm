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

    const [{ data, error }, { data: pos }, { data: cos }] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('job_purchase_orders').select('id, job_id, status, total_cost'),
      supabase.from('job_change_orders').select('id, job_id, type, amount, status'),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const poMap: Record<string, { total: number; open: number; totalCost: number }> = {};
    (pos || []).forEach((p: any) => {
      if (!poMap[p.job_id]) poMap[p.job_id] = { total: 0, open: 0, totalCost: 0 };
      poMap[p.job_id].total += 1;
      if (p.status !== 'received' && p.status !== 'cancelled') poMap[p.job_id].open += 1;
      if (p.status !== 'cancelled') poMap[p.job_id].totalCost += Number(p.total_cost) || 0;
    });

    const coMap: Record<string, { total: number; pending: number; netApproved: number }> = {};
    (cos || []).forEach((c: any) => {
      if (!coMap[c.job_id]) coMap[c.job_id] = { total: 0, pending: 0, netApproved: 0 };
      coMap[c.job_id].total += 1;
      if (c.status === 'pending') coMap[c.job_id].pending += 1;
      if (c.status === 'approved' || c.status === 'billed') {
        const amt = Number(c.amount) || 0;
        coMap[c.job_id].netApproved += c.type === 'deduction' ? -amt : amt;
      }
    });

    const enriched = (data || []).map((job: any) => ({
      ...job,
      po_summary: poMap[job.id] || { total: 0, open: 0, totalCost: 0 },
      co_summary: coMap[job.id] || { total: 0, pending: 0, netApproved: 0 },
    }));

    return NextResponse.json({ jobs: enriched });
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
