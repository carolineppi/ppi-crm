import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const { ctx, errorResponse } = await requireApiAuth();
  if (errorResponse || !ctx) return errorResponse!;

  try {
    const sp = request.nextUrl.searchParams;
    const isSummary = sp.get('summary') === '1';
    const scope = sp.get('scope') || 'all'; // 'calendar' | 'estimator' | 'all'
    const estimatorFilter = (sp.get('estimator') || '').trim();
    const q = (sp.get('q') || '').trim();
    const limit = Math.min(1000, Math.max(25, Number(sp.get('limit')) || 300));
    const offset = Math.max(0, Number(sp.get('offset')) || 0);

    // Use user-scoped SSR client so Postgres RLS automatically scopes estimators to their assigned bids
    const supabase = ctx.ssr;

    const selectQuery = `
      id,
      bid_number,
      email_subject,
      sender_email,
      sender_name,
      email_received_at,
      job_code,
      project_name,
      client_company,
      duplicate_group_id,
      is_flagged_duplicate,
      duplicate_reasons,
      duplicate_resolution,
      triage_status,
      priority,
      assigned_estimator_id,
      assigned_estimator_name:raw_payload->>assigned_estimator_name,
      bid_due_date,
      bid_due_time:raw_payload->>bid_due_time,
      attachments,
      ${isSummary ? '' : 'email_body_text,'}
      email_intent,
      filter_status,
      is_forwarded,
      forwarded_by,
      original_sender_email,
      original_sender_name,
      scope_summary,
      intent_explanation,
      intent_confidence,
      matched_bid_number,
      match_confidence,
      match_reason,
      match_status,
      estimator_status,
      estimator_notes:raw_payload->>estimator_notes,
      refused_by:raw_payload->>refused_by,
      ml_llm_review:raw_payload->ml_llm_review,
      is_human_labeled,
      human_label,
      human_labeled_at,
      is_due_date_revised,
      revised_due_date,
      is_gc_won_prime,
      google_drive_folder_url,
      project_address_street,
      project_address_city,
      project_address_state,
      project_address_zip,
      created_at
    `.replace(/\s+/g, ' ').trim();

    let query = supabase
      .from('bid_requests')
      .select(selectQuery as any, { count: 'exact' });

    // If an Admin is using "View As Estimator", enforce the estimator's assigned scope
    if (
      ctx.isViewingAs &&
      ctx.profile.roles.includes('estimator') &&
      !ctx.profile.roles.includes('calendar_manager')
    ) {
      query = query.eq('raw_payload->>assigned_estimator_name', ctx.profile.full_name);
    }

    if (scope === 'calendar' && !q) {
      // Load recent emails + upcoming/recent due-date bids without scanning years of old archive
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86400000).toISOString();
      query = query.or(
        `bid_due_date.gte.${thirtyDaysAgo},triage_status.in.(pending_triage,in_triage,ready_for_assignment),created_at.gte.${fortyFiveDaysAgo}`
      );
    } else if (scope === 'estimator') {
      if (estimatorFilter && estimatorFilter !== 'ALL') {
        query = query.eq('raw_payload->>assigned_estimator_name', estimatorFilter);
      } else {
        query = query.or(
          'estimator_status.in.(in_progress,quoted,bid_submitted,won,lost,declined),raw_payload->>assigned_estimator_name.not.is.null'
        );
      }
    }

    if (q) {
      const escaped = q.replace(/,/g, ' ');
      query = query.or(
        `project_name.ilike.%${escaped}%,email_subject.ilike.%${escaped}%,client_company.ilike.%${escaped}%,bid_number.ilike.%${escaped}%,sender_name.ilike.%${escaped}%`
      );
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase query error in /api/bid-requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const totalCount = count ?? rows.length;

    if (rows.length > 0) {
      const bidIds = rows.map((r: any) => r.id);
      const { data: linkedJobs } = await supabase
        .from('jobs')
        .select('bid_request_id')
        .in('bid_request_id', bidIds);
      if (linkedJobs && linkedJobs.length > 0) {
        const wonSet = new Set(linkedJobs.map((j: any) => j.bid_request_id).filter(Boolean));
        const toSync: string[] = [];
        for (const r of rows as any[]) {
          if (wonSet.has(r.id) && r.estimator_status !== 'won') {
            r.estimator_status = 'won';
            toSync.push(r.id);
          }
        }
        if (toSync.length > 0) {
          await supabase
            .from('bid_requests')
            .update({ estimator_status: 'won' })
            .in('id', toSync);
        }
      }
    }

    return NextResponse.json({
      bidRequests: rows,
      totalCount,
      hasMore: offset + rows.length < totalCount,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error('Exception in /api/bid-requests:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bid requests' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
    if (!projectName) {
      return NextResponse.json({ error: 'Project Name is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Generate sequential BID-YY-XXXX
    let bidNumber: string | null = null;
    const { data: nextNum } = await supabase.rpc('get_next_bid_number');
    if (nextNum) {
      bidNumber = nextNum;
    } else {
      const currentYear = new Date().getFullYear().toString().slice(-2);
      const { count } = await supabase
        .from('bid_requests')
        .select('id', { count: 'exact', head: true })
        .not('bid_number', 'is', null);
      const seq = (count || 0) + 1;
      bidNumber = `BID-${currentYear}-${seq.toString().padStart(4, '0')}`;
    }

    const assignedEstimator = typeof body.assignedEstimator === 'string' && body.assignedEstimator.trim()
      ? body.assignedEstimator.trim()
      : null;
    const isNotBidding = assignedEstimator === 'Not Bidding' || assignedEstimator === 'No Bid';

    const bidDueDate =
      typeof body.bidDueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.bidDueDate.trim())
        ? `${body.bidDueDate.trim()}T17:00:00.000Z`
        : null;

    const nowIso = new Date().toISOString();
    const inviteSource =
      typeof body.inviteSource === 'string' && body.inviteSource.trim()
        ? body.inviteSource.trim()
        : 'Manual Entry';
    const contactName =
      typeof body.clientName === 'string' && body.clientName.trim()
        ? body.clientName.trim()
        : null;
    const contactPhone =
      typeof body.clientPhone === 'string' && body.clientPhone.trim()
        ? body.clientPhone.trim()
        : null;
    const contactEmail =
      typeof body.clientEmail === 'string' && body.clientEmail.trim()
        ? body.clientEmail.trim()
        : null;

    const record = {
      bid_number: bidNumber,
      email_subject: projectName,
      sender_email: contactEmail || 'manual@calendar-manager.local',
      sender_name: contactName || body.clientCompany?.trim() || inviteSource,
      email_received_at: nowIso,
      email_body_text:
        body.notes?.trim() ||
        body.scopeSummary?.trim() ||
        `Invitation to bid (${inviteSource}) entered by Calendar Manager.`,
      project_name: projectName,
      client_company: body.clientCompany?.trim() || null,
      client_name: contactName,
      client_phone: contactPhone,
      project_address_street: body.projectAddressStreet?.trim() || null,
      project_address_city: body.projectAddressCity?.trim() || null,
      project_address_state: body.projectAddressState?.trim() || null,
      project_address_zip: body.projectAddressZip?.trim() || null,
      scope_summary: body.scopeSummary?.trim() || null,
      bid_due_date: bidDueDate,
      google_drive_folder_url: body.googleDriveFolderUrl?.trim() || null,
      email_intent: 'invitation_to_bid',
      intent_confidence: 1.0,
      intent_explanation: `Manually entered by Calendar Manager (${inviteSource})`,
      is_human_labeled: true,
      human_label: 'ITB',
      human_labeled_at: nowIso,
      filter_status: 'inbox',
      triage_status: assignedEstimator && !isNotBidding ? 'assigned' : 'ready_for_assignment',
      estimator_status: isNotBidding ? 'no_bid' : assignedEstimator ? 'assigned' : 'unassigned',
      duplicate_group_id: crypto.randomUUID(),
      is_flagged_duplicate: false,
      raw_payload: {
        source: 'manual_calendar_entry',
        invite_source: inviteSource,
        assigned_estimator_name: assignedEstimator,
        bid_due_time: body.bidDueTime?.trim() || null,
        estimator_notes: body.notes?.trim() || null,
        is_labeled: true,
        human_verified: true,
        human_label: 'ITB',
      },
    };

    const { data: inserted, error } = await supabase
      .from('bid_requests')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Error creating manual bid request:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bidRequest: inserted }, { status: 201 });
  } catch (err: any) {
    console.error('Exception in POST /api/bid-requests:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create bid request' },
      { status: 500 }
    );
  }
}
