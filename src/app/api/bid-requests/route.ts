import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const isSummary = request.nextUrl.searchParams.get('summary') === '1';
    const supabase = createServerSupabaseClient();

    // Fast, lightweight column selection that extracts assigned estimator name without scanning heavy binary raw_payload
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

    const { data, error } = await supabase
      .from('bid_requests')
      .select(selectQuery as any)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase query error in /api/bid-requests:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bidRequests: data || [] });
  } catch (err: any) {
    console.error('Exception in /api/bid-requests:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bid requests' },
      { status: 500 }
    );
  }
}
