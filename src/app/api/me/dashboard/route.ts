import { NextRequest, NextResponse } from 'next/server';
import { getDefaultWidgetsForRoles, requireApiAuth } from '@/lib/auth/rbac';

export async function GET() {
  const { ctx, errorResponse } = await requireApiAuth();
  if (errorResponse || !ctx) return errorResponse!;

  const { profile, ssr } = ctx;
  const roles = profile.roles;
  const isFullOffice =
    roles.includes('admin') ||
    roles.includes('calendar_manager') ||
    roles.includes('pm') ||
    roles.includes('accounting') ||
    roles.includes('warehouse') ||
    roles.includes('install_coordinator');

  const widgets =
    Array.isArray(profile.dashboard_config?.widgets) &&
    profile.dashboard_config!.widgets!.length > 0
      ? profile.dashboard_config!.widgets!
      : getDefaultWidgetsForRoles(roles);

  const today = new Date().toISOString().slice(0, 10);

  // Query via user-scoped SSR client so Postgres RLS also enforces row visibility
  const [bidsRes, jobsRes, payAppsRes, posRes, ticketsRes] = await Promise.all([
    roles.includes('admin') || roles.includes('calendar_manager') || roles.includes('estimator')
      ? ssr
          .from('bid_requests')
          .select('id, bid_number, project_name, client_company, bid_due_date, triage_status, estimator_status, raw_payload')
          .order('bid_due_date', { ascending: true, nullsFirst: false })
          .limit(30)
      : Promise.resolve({ data: [] as any[] }),
    ssr
      .from('jobs')
      .select('id, job_number, project_name, client_company, project_manager, estimator_name, assigned_accountant, status, warehouse_status, warehouse_location, quote_amount')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(30),
    roles.includes('admin') || roles.includes('accounting') || roles.includes('pm')
      ? ssr
          .from('job_pay_applications')
          .select('id, job_id, application_number, status, current_payment_due, assigned_accountant, requested_at')
          .in('status', ['requested', 'draft'])
          .order('requested_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
    roles.includes('admin') || roles.includes('warehouse') || roles.includes('pm')
      ? ssr
          .from('job_purchase_orders')
          .select('id, job_id, po_number, vendor, status, expected_delivery_date, has_damage_or_shortage')
          .in('status', ['ordered', 'shipped', 'partial'])
          .order('expected_delivery_date', { ascending: true, nullsFirst: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
    roles.includes('admin') ||
    roles.includes('install_coordinator') ||
    roles.includes('installer') ||
    roles.includes('pm')
      ? ssr
          .from('install_tickets')
          .select('id, job_id, status, requested_install_date, confirmed_install_date, assigned_crew, work_shift, job:jobs(job_number, project_name, warehouse_status, warehouse_location)')
          .gte('requested_install_date', today)
          .order('confirmed_install_date', { ascending: true, nullsFirst: false })
          .limit(20)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  return NextResponse.json({
    profile,
    widgets,
    isFullOffice,
    data: {
      bids: bidsRes.data || [],
      jobs: jobsRes.data || [],
      payApps: payAppsRes.data || [],
      incomingPOs: posRes.data || [],
      upcomingInstalls: ticketsRes.data || [],
    },
  });
}

export async function PATCH(request: NextRequest) {
  const { ctx, errorResponse } = await requireApiAuth();
  if (errorResponse || !ctx) return errorResponse!;

  const body = await request.json();
  const nextConfig = {
    ...(ctx.profile.dashboard_config || {}),
    ...(body.dashboardConfig || {}),
  };

  const { data, error } = await ctx.ssr
    .from('user_profiles')
    .update({
      dashboard_config: nextConfig,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.profile.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}
