import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('bid_requests')
      .select(`
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
        raw_payload,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Strip bulky base64 data from raw_payload if present to keep payload lightweight
    const sanitized = (data || []).map((row) => {
      if (row.raw_payload && typeof row.raw_payload === 'object') {
        const { attachments: _rawAtts, ...restPayload } = row.raw_payload as any;
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
