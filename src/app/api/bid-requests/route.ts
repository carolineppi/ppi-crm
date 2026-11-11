import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const isSummary = request.nextUrl.searchParams.get('summary') === '1';
    const supabase = createServerSupabaseClient();

    // Summary mode selects only essential columns, skipping heavy body texts for fast mobile queues
    const selectQuery = isSummary
      ? `
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
        bid_due_date,
        attachments,
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
        is_human_labeled,
        human_label,
        human_labeled_at,
        raw_payload,
        created_at
      `
      : `
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
        bid_due_date,
        attachments,
        email_body_text,
        email_body_html,
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
        is_human_labeled,
        human_label,
        human_labeled_at,
        raw_payload,
        created_at
      `;

    const { data, error } = await supabase
      .from('bid_requests')
      .select(selectQuery as any)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Strip bulky base64 data and redundant bodyHtml from raw_payload to keep payload lightweight
    const sanitized = ((data as any[]) || []).map((row) => {
      if (row.raw_payload && typeof row.raw_payload === 'object') {
        const { attachments: _rawAtts, bodyHtml: _rawHtml, bodyText: _rawText, ...restPayload } = row.raw_payload as any;
        return { ...row, raw_payload: restPayload };
      }
      return row;
    });

    return NextResponse.json({ bidRequests: sanitized });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bid requests' },
      { status: 500 }
    );
  }
}
