import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const statusFilter = request.nextUrl.searchParams.get('status') || 'ALL';
    const accountantFilter = request.nextUrl.searchParams.get('accountant') || 'ALL';

    const [
      { data: jobs, error: jobsErr },
      { data: payApps, error: appsErr },
      { data: pendingCos },
      { data: sovItems },
    ] = await Promise.all([
      supabase
        .from('jobs')
        .select(
          'id, job_number, project_name, client_company, client_name, project_manager, status, quote_amount, contract_status, assigned_accountant, completed_retainage_percent, stored_retainage_percent, customer_id'
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('job_pay_applications')
        .select('*')
        .order('updated_at', { ascending: false }),
      supabase
        .from('job_change_orders')
        .select('id, job_id, co_number, title, type, amount, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase.from('job_sov_items').select('job_id, scheduled_value, source'),
    ]);

    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });
    if (appsErr) return NextResponse.json({ error: appsErr.message }, { status: 500 });

    const jobById = new Map<string, any>();
    for (const j of jobs || []) jobById.set(j.id, j);

    const sovSummaryByJob = new Map<string, { count: number; total: number }>();
    for (const s of sovItems || []) {
      const cur = sovSummaryByJob.get(s.job_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(s.scheduled_value) || 0;
      sovSummaryByJob.set(s.job_id, cur);
    }

    let queue = (payApps || []).map((app: any) => ({
      ...app,
      job: jobById.get(app.job_id) || null,
    }));

    if (statusFilter !== 'ALL') {
      queue = queue.filter((a: any) => a.status === statusFilter);
    }
    if (accountantFilter !== 'ALL') {
      if (accountantFilter === 'UNASSIGNED') {
        queue = queue.filter((a: any) => !a.assigned_accountant);
      } else {
        queue = queue.filter(
          (a: any) =>
            (a.assigned_accountant || '').toLowerCase() === accountantFilter.toLowerCase()
        );
      }
    }

    const enrichedJobs = (jobs || []).map((j: any) => ({
      ...j,
      sov_summary: sovSummaryByJob.get(j.id) || { count: 0, total: 0 },
    }));

    const openCoAlerts = (pendingCos || []).map((co: any) => ({
      ...co,
      job: jobById.get(co.job_id) || null,
    }));

    return NextResponse.json({
      queue,
      jobs: enrichedJobs,
      openCoAlerts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load accounting data' },
      { status: 500 }
    );
  }
}
