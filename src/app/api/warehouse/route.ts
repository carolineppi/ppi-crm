import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET() {
  const { errorResponse } = await requireApiAuth(['warehouse', 'pm', 'install_coordinator', 'accounting']);
  if (errorResponse) return errorResponse;
  try {
    const supabase = createServerSupabaseClient();
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    const [posRes, jobsRes, ticketsRes, receiptsRes] = await Promise.all([
      supabase
        .from('job_purchase_orders')
        .select('*')
        .order('expected_delivery_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('jobs')
        .select(
          'id, job_number, project_name, client_company, client_name, project_manager, status, address_street, address_city, address_state, address_zip, material_eta, requested_install_date, warehouse_status, warehouse_location, warehouse_notes, material_staged_at, material_loaded_at, material_loaded_by, line_items'
        )
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase
        .from('install_tickets')
        .select(
          'id, job_id, status, requested_install_date, confirmed_install_date, assigned_crew, work_shift, site_access_notes, estimated_duration_days, crew_size_needed'
        )
        .in('status', ['confirmed', 'pending'])
        .gte('requested_install_date', twoDaysAgo)
        .order('confirmed_install_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('warehouse_receipts')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50),
    ]);

    if (posRes.error) {
      return NextResponse.json({ error: posRes.error.message }, { status: 500 });
    }
    if (jobsRes.error) {
      return NextResponse.json({ error: jobsRes.error.message }, { status: 500 });
    }

    const jobsById = new Map<string, any>();
    for (const j of jobsRes.data || []) {
      jobsById.set(j.id, j);
    }

    const posByJob = new Map<string, any[]>();
    const incomingPOs = (posRes.data || []).map((po) => {
      const list = posByJob.get(po.job_id) || [];
      list.push(po);
      posByJob.set(po.job_id, list);
      return {
        ...po,
        job: jobsById.get(po.job_id) || null,
      };
    });

    const stagedJobs = (jobsRes.data || []).map((job) => {
      const jobPOs = posByJob.get(job.id) || [];
      const activePOs = jobPOs.filter((p) => p.status !== 'cancelled');
      const receivedPOs = activePOs.filter((p) => p.status === 'received');
      const hasDiscrepancy = activePOs.some((p) => p.has_damage_or_shortage);
      return {
        ...job,
        poCount: activePOs.length,
        receivedPoCount: receivedPOs.length,
        hasDiscrepancy,
        purchaseOrders: activePOs,
      };
    });

    const upcomingInstalls = (ticketsRes.data || []).map((t) => ({
      ...t,
      job: jobsById.get(t.job_id) || null,
      poCount: (posByJob.get(t.job_id) || []).filter((p) => p.status !== 'cancelled').length,
    }));

    const recentReceipts = (receiptsRes.data || []).map((r) => ({
      ...r,
      job: r.job_id ? jobsById.get(r.job_id) || null : null,
    }));

    return NextResponse.json({
      incomingPOs,
      stagedJobs,
      upcomingInstalls,
      recentReceipts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load warehouse data' },
      { status: 500 }
    );
  }
}
