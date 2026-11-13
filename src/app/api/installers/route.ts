import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DEFAULT_WEEKLY_AVAILABILITY } from '@/lib/installers/availability';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const [installersRes, overridesRes, ticketsRes] = await Promise.all([
      supabase
        .from('installers')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true }),
      supabase.from('installer_date_overrides').select('*'),
      supabase
        .from('install_tickets')
        .select(
          `
          id,
          job_id,
          status,
          work_shift,
          requested_install_date,
          confirmed_install_date,
          assigned_installer_ids,
          job:jobs (
            job_number,
            project_name
          )
        `
        )
        .neq('status', 'cancelled'),
    ]);

    if (installersRes.error) {
      return NextResponse.json(
        { error: installersRes.error.message },
        { status: 500 }
      );
    }

    const overridesByInstaller: Record<string, any[]> = {};
    for (const ov of overridesRes.data || []) {
      if (!overridesByInstaller[ov.installer_id]) {
        overridesByInstaller[ov.installer_id] = [];
      }
      overridesByInstaller[ov.installer_id].push(ov);
    }

    const assignmentsByInstaller: Record<string, any[]> = {};
    for (const t of ticketsRes.data || []) {
      const ids: string[] = Array.isArray(t.assigned_installer_ids)
        ? t.assigned_installer_ids
        : [];
      const activeDate =
        t.status === 'confirmed' || t.status === 'completed'
          ? t.confirmed_install_date || t.requested_install_date
          : t.requested_install_date;

      if (!activeDate) continue;

      const jobInfo = Array.isArray(t.job) ? t.job[0] : t.job;

      for (const instId of ids) {
        if (!assignmentsByInstaller[instId]) {
          assignmentsByInstaller[instId] = [];
        }
        assignmentsByInstaller[instId].push({
          ticketId: t.id,
          jobId: t.job_id,
          jobNumber: jobInfo?.job_number || null,
          projectName: jobInfo?.project_name || 'Untitled Job',
          date: activeDate,
          status: t.status,
          workShift: t.work_shift || 'Day',
        });
      }
    }

    const enriched = (installersRes.data || []).map((inst) => ({
      ...inst,
      overrides: overridesByInstaller[inst.id] || [],
      assignments: assignmentsByInstaller[inst.id] || [],
    }));

    return NextResponse.json({ installers: enriched });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load installers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json(
        { error: 'Installer name is required' },
        { status: 400 }
      );
    }

    const { data: installer, error } = await supabase
      .from('installers')
      .insert({
        name: String(body.name).trim(),
        employment_type:
          body.employmentType === 'subcontractor' ? 'subcontractor' : 'employee',
        company_name: body.companyName ? String(body.companyName).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        email: body.email ? String(body.email).trim() : null,
        specialty: body.specialty ? String(body.specialty).trim() : null,
        default_weekly_availability:
          body.defaultWeeklyAvailability || DEFAULT_WEEKLY_AVAILABILITY,
        is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
        notes: body.notes ? String(body.notes).trim() : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ installer });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create installer' },
      { status: 500 }
    );
  }
}
