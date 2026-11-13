import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const status = searchParams.get('status');

    // Fetch calendar settings & overrides
    const [settingsRes, overridesRes, allTicketsRes] = await Promise.all([
      supabase
        .from('install_calendar_settings')
        .select('default_daily_limit')
        .eq('id', 'default')
        .maybeSingle(),
      supabase.from('install_day_overrides').select('*'),
      supabase
        .from('install_tickets')
        .select(
          `
          *,
          job:jobs (
            id,
            job_number,
            project_name,
            client_name,
            client_company,
            client_phone,
            client_email,
            address_street,
            address_city,
            address_state,
            address_zip,
            project_manager,
            estimator_name,
            quote_amount,
            scope_pdf_filename,
            scope_pdf_url
          )
        `
        )
        .order('is_priority', { ascending: false })
        .order('submitted_at', { ascending: false }),
    ]);

    if (allTicketsRes.error) {
      return NextResponse.json(
        { error: allTicketsRes.error.message },
        { status: 500 }
      );
    }

    const defaultDailyLimit = settingsRes.data?.default_daily_limit ?? 3;
    const dayOverrides: Record<string, { max_jobs: number; note: string | null }> = {};
    for (const row of overridesRes.data || []) {
      dayOverrides[row.override_date] = {
        max_jobs: row.max_jobs,
        note: row.note,
      };
    }

    const allTickets = allTicketsRes.data || [];

    // Build calendar summary across all non-cancelled tickets
    const calendarSummary: Record<
      string,
      {
        confirmedCount: number;
        pendingCount: number;
        limit: number;
        overrideNote: string | null;
        jobs: Array<{
          ticketId: string;
          jobId: string;
          jobNumber: string | null;
          projectName: string;
          status: string;
          workShift: string;
          isPriority: boolean;
        }>;
      }
    > = {};

    const ensureDay = (dateStr: string) => {
      if (!calendarSummary[dateStr]) {
        const ov = dayOverrides[dateStr];
        calendarSummary[dateStr] = {
          confirmedCount: 0,
          pendingCount: 0,
          limit: ov ? ov.max_jobs : defaultDailyLimit,
          overrideNote: ov?.note ?? null,
          jobs: [],
        };
      }
      return calendarSummary[dateStr];
    };

    // Ensure override dates with 0 tickets still appear in summary
    for (const dateStr of Object.keys(dayOverrides)) {
      ensureDay(dateStr);
    }

    for (const t of allTickets) {
      if (t.status === 'cancelled') continue;
      const activeDate =
        t.status === 'confirmed' || t.status === 'completed'
          ? t.confirmed_install_date || t.requested_install_date
          : t.requested_install_date;

      if (!activeDate) continue;

      const day = ensureDay(activeDate);
      if (t.status === 'confirmed' || t.status === 'completed') {
        day.confirmedCount += 1;
      } else {
        day.pendingCount += 1;
      }
      day.jobs.push({
        ticketId: t.id,
        jobId: t.job_id,
        jobNumber: t.job?.job_number || null,
        projectName: t.job?.project_name || 'Untitled Job',
        status: t.status,
        workShift: t.work_shift || 'Day',
        isPriority: Boolean(t.is_priority),
      });
    }

    let filteredTickets = allTickets;
    if (jobId) {
      filteredTickets = filteredTickets.filter((t) => t.job_id === jobId);
    }
    if (status && status !== 'all') {
      if (status === 'priority') {
        filteredTickets = filteredTickets.filter(
          (t) => t.is_priority && t.status === 'pending'
        );
      } else {
        filteredTickets = filteredTickets.filter((t) => t.status === status);
      }
    }

    return NextResponse.json({
      tickets: filteredTickets,
      defaultDailyLimit,
      dayOverrides,
      calendarSummary,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load install tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const {
      jobId,
      materialEta,
      siteAvailableRange,
      siteOpenDays,
      workShift,
      requestedInstallDate,
      isPriority,
      priorityReason,
      siteAccessNotes,
      estimatedDurationDays,
      crewSizeNeeded,
      submittedBy,
    } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }
    if (!requestedInstallDate) {
      return NextResponse.json(
        { error: 'Requested install date is required' },
        { status: 400 }
      );
    }

    // Check capacity for the requested date
    const [settingsRes, overrideRes, existingOnDayRes] = await Promise.all([
      supabase
        .from('install_calendar_settings')
        .select('default_daily_limit')
        .eq('id', 'default')
        .maybeSingle(),
      supabase
        .from('install_day_overrides')
        .select('max_jobs')
        .eq('override_date', requestedInstallDate)
        .maybeSingle(),
      supabase
        .from('install_tickets')
        .select('id, status, confirmed_install_date, requested_install_date')
        .in('status', ['confirmed', 'completed']),
    ]);

    const limit =
      overrideRes.data?.max_jobs ?? settingsRes.data?.default_daily_limit ?? 3;

    const confirmedOnDay = (existingOnDayRes.data || []).filter((t) => {
      const d = t.confirmed_install_date || t.requested_install_date;
      return d === requestedInstallDate;
    }).length;

    const isDayFull = confirmedOnDay >= limit;

    if ((isPriority || isDayFull) && !String(priorityReason || '').trim()) {
      return NextResponse.json(
        {
          error: isDayFull
            ? `That day is already at capacity (${confirmedOnDay}/${limit} confirmed). Please provide a priority reason explaining why this job must be scheduled on ${requestedInstallDate}.`
            : 'Please provide a reason when flagging an install ticket as Important / Priority.',
        },
        { status: 400 }
      );
    }

    const openDaysArray =
      Array.isArray(siteOpenDays) && siteOpenDays.length > 0
        ? siteOpenDays
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    const { data: ticket, error: insertError } = await supabase
      .from('install_tickets')
      .insert({
        job_id: jobId,
        status: 'pending',
        material_eta: materialEta || null,
        site_available_range: siteAvailableRange || null,
        site_open_days: openDaysArray,
        work_shift: workShift || 'Day',
        requested_install_date: requestedInstallDate,
        is_priority: Boolean(isPriority || isDayFull),
        priority_reason: priorityReason ? String(priorityReason).trim() : null,
        site_access_notes: siteAccessNotes ? String(siteAccessNotes).trim() : null,
        estimated_duration_days: Number(estimatedDurationDays) || 1,
        crew_size_needed: crewSizeNeeded ? Number(crewSizeNeeded) : null,
        submitted_by: submittedBy || null,
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Sync summary fields onto public.jobs
    await supabase
      .from('jobs')
      .update({
        material_eta: materialEta || null,
        site_available_range: siteAvailableRange || null,
        requested_install_date: requestedInstallDate,
        install_availability_notes: siteAccessNotes || null,
        install_request_status: 'requested',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return NextResponse.json({ ticket, isDayFull });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create install ticket' },
      { status: 500 }
    );
  }
}
