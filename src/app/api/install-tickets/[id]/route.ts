import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const allowedFields: Record<string, string> = {
      status: 'status',
      materialEta: 'material_eta',
      siteAvailableRange: 'site_available_range',
      siteOpenDays: 'site_open_days',
      workShift: 'work_shift',
      requestedInstallDate: 'requested_install_date',
      confirmedInstallDate: 'confirmed_install_date',
      isPriority: 'is_priority',
      priorityReason: 'priority_reason',
      siteAccessNotes: 'site_access_notes',
      estimatedDurationDays: 'estimated_duration_days',
      crewSizeNeeded: 'crew_size_needed',
      confirmedBy: 'confirmed_by',
      installDeptNotes: 'install_dept_notes',
      assignedCrew: 'assigned_crew',
    };

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camel, snake] of Object.entries(allowedFields)) {
      if (body[camel] !== undefined) {
        updates[snake] = body[camel];
      }
    }

    if (body.status === 'confirmed') {
      updates.confirmed_at = new Date().toISOString();
    }

    const { data: ticket, error } = await supabase
      .from('install_tickets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !ticket) {
      return NextResponse.json(
        { error: error?.message || 'Install ticket not found' },
        { status: 500 }
      );
    }

    // Sync status & confirmed_install_date onto the parent job
    const jobUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (ticket.status === 'confirmed') {
      jobUpdates.install_request_status = 'confirmed';
      jobUpdates.confirmed_install_date =
        ticket.confirmed_install_date || ticket.requested_install_date;
      jobUpdates.status = 'scheduled';
    } else if (ticket.status === 'completed') {
      jobUpdates.install_request_status = 'completed';
      jobUpdates.status = 'completed';
    } else if (ticket.status === 'cancelled') {
      jobUpdates.install_request_status = 'not_requested';
      jobUpdates.confirmed_install_date = null;
    } else if (ticket.status === 'pending' || ticket.status === 'rescheduled') {
      jobUpdates.install_request_status = 'requested';
      jobUpdates.requested_install_date = ticket.requested_install_date;
    }

    await supabase.from('jobs').update(jobUpdates).eq('id', ticket.job_id);

    return NextResponse.json({ ticket });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update install ticket' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { data: existing } = await supabase
      .from('install_tickets')
      .select('job_id')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase.from('install_tickets').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existing?.job_id) {
      const { data: remaining } = await supabase
        .from('install_tickets')
        .select('id, status')
        .eq('job_id', existing.job_id)
        .neq('status', 'cancelled')
        .limit(1);

      if (!remaining || remaining.length === 0) {
        await supabase
          .from('jobs')
          .update({
            install_request_status: 'not_requested',
            confirmed_install_date: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.job_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete install ticket' },
      { status: 500 }
    );
  }
}
