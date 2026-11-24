import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createOrSyncJobFromBid } from '@/lib/jobs/createJobFromBid';
import { getJobLineItemsOrderStatus } from '@/lib/jobs/lineItemOrderStatus';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'accounting',
    'warehouse',
    'install_coordinator',
  ]);
  if (errorResponse) return errorResponse;
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

    const [{ data, error }, { data: pos }, { data: cos }, { data: payApps }] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, bid_request_id, job_number, project_name, client_name, client_company, client_phone, client_email, address_street, address_city, address_state, address_zip, scope_of_work, estimator_name, project_manager, pm_assigned_at, quote_amount, status, notes, won_confirmed_by, won_confirmed_at, scope_pdf_filename, scope_pdf_url, material_eta, site_available_range, requested_install_date, install_request_status, line_items, submittals, created_at'
        )
        .order('created_at', { ascending: false }),
      supabase.from('job_purchase_orders').select('id, job_id, po_number, status, total_cost, items'),
      supabase.from('job_change_orders').select('id, job_id, type, amount, status'),
      supabase.from('job_pay_applications').select('id, job_id, status, current_payment_due'),
    ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const poMap: Record<string, { total: number; open: number; totalCost: number }> = {};
    const posByJob: Record<string, any[]> = {};
    (pos || []).forEach((p: any) => {
      if (!poMap[p.job_id]) poMap[p.job_id] = { total: 0, open: 0, totalCost: 0 };
      if (!posByJob[p.job_id]) posByJob[p.job_id] = [];
      posByJob[p.job_id].push(p);
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

    const payMap: Record<string, { billed: number; paid: number }> = {};
    (payApps || []).forEach((pa: any) => {
      if (!payMap[pa.job_id]) payMap[pa.job_id] = { billed: 0, paid: 0 };
      const amt = Number(pa.current_payment_due) || 0;
      if (pa.status === 'submitted' || pa.status === 'paid') payMap[pa.job_id].billed += amt;
      if (pa.status === 'paid') payMap[pa.job_id].paid += amt;
    });

    const enriched = (data || []).map((job: any) => ({
      ...job,
      po_summary: poMap[job.id] || { total: 0, open: 0, totalCost: 0 },
      co_summary: coMap[job.id] || { total: 0, pending: 0, netApproved: 0 },
      pay_summary: payMap[job.id] || { billed: 0, paid: 0 },
      line_item_order_status: getJobLineItemsOrderStatus(
        job.line_items,
        posByJob[job.id] || []
      ),
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
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
  ]);
  if (errorResponse) return errorResponse;
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
