import { SupabaseClient } from '@supabase/supabase-js';

export interface JobOverrides {
  jobNumber?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  scopeOfWork?: string | null;
  estimatorName?: string | null;
  quoteAmount?: number | null;
  estimatedStartDate?: string | null;
  notes?: string | null;
  wonConfirmedBy?: string | null;
  scopePdfFilename?: string | null;
  scopePdfUrl?: string | null;
  lineItems?: any[];
}

export async function createOrSyncJobFromBid(
  supabase: SupabaseClient,
  bid: any,
  overrides: JobOverrides = {}
) {
  // Check if a job already exists for this bid
  const { data: existingJob } = await supabase
    .from('jobs')
    .select('*')
    .eq('bid_request_id', bid.id)
    .maybeSingle();

  // Try to compute quote amount from the latest linked quote cart if not overridden
  let computedQuoteAmount: number | null =
    overrides.quoteAmount !== undefined ? overrides.quoteAmount : existingJob?.quote_amount ?? null;

  if (computedQuoteAmount === null) {
    const { data: cart } = await supabase
      .from('job_quote_carts')
      .select('items, markup_percent')
      .eq('bid_request_id', bid.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
      const subtotal = cart.items.reduce(
        (sum: number, item: any) =>
          sum + (Number(item.unitCost) || 0) * (Number(item.quantity) || 0),
        0
      );
      const markup = Number(cart.markup_percent) || 0;
      computedQuoteAmount = Math.round(subtotal * (1 + markup / 100) * 100) / 100;
    }
  }

  const assignedEstimator = bid.raw_payload?.assigned_estimator_name || null;
  const now = new Date().toISOString();

  const payload = {
    bid_request_id: bid.id,
    job_number:
      overrides.jobNumber ??
      existingJob?.job_number ??
      bid.job_code ??
      bid.bid_number ??
      `JOB-${String(bid.id).slice(0, 6).toUpperCase()}`,
    project_name:
      overrides.projectName ??
      existingJob?.project_name ??
      bid.project_name ??
      bid.ai_analysis?.projectName ??
      bid.email_subject ??
      'Untitled Job',
    client_name:
      overrides.clientName ?? existingJob?.client_name ?? bid.client_name ?? bid.sender_name ?? null,
    client_company:
      overrides.clientCompany ??
      existingJob?.client_company ??
      bid.client_company ??
      bid.ai_analysis?.clientCompany ??
      null,
    client_phone: overrides.clientPhone ?? existingJob?.client_phone ?? bid.client_phone ?? null,
    client_email: overrides.clientEmail ?? existingJob?.client_email ?? bid.sender_email ?? null,
    address_street:
      overrides.addressStreet ?? existingJob?.address_street ?? bid.project_address_street ?? null,
    address_city:
      overrides.addressCity ?? existingJob?.address_city ?? bid.project_address_city ?? null,
    address_state:
      overrides.addressState ?? existingJob?.address_state ?? bid.project_address_state ?? null,
    address_zip:
      overrides.addressZip ?? existingJob?.address_zip ?? bid.project_address_zip ?? null,
    scope_of_work:
      overrides.scopeOfWork ??
      existingJob?.scope_of_work ??
      bid.scope_of_work ??
      bid.scope_summary ??
      bid.ai_analysis?.scopeSummary ??
      null,
    estimator_name:
      overrides.estimatorName ?? existingJob?.estimator_name ?? assignedEstimator ?? null,
    quote_amount: computedQuoteAmount,
    estimated_start_date:
      overrides.estimatedStartDate ??
      existingJob?.estimated_start_date ??
      bid.estimated_project_start ??
      null,
    google_drive_folder_url:
      existingJob?.google_drive_folder_url ?? bid.google_drive_folder_url ?? null,
    notes: overrides.notes ?? existingJob?.notes ?? bid.raw_payload?.estimator_notes ?? null,
    won_confirmed_by:
      overrides.wonConfirmedBy ??
      existingJob?.won_confirmed_by ??
      assignedEstimator ??
      'Estimator',
    scope_pdf_filename:
      overrides.scopePdfFilename !== undefined
        ? overrides.scopePdfFilename
        : existingJob?.scope_pdf_filename ?? null,
    scope_pdf_url:
      overrides.scopePdfUrl !== undefined
        ? overrides.scopePdfUrl
        : existingJob?.scope_pdf_url ?? null,
    line_items:
      Array.isArray(overrides.lineItems)
        ? overrides.lineItems
        : Array.isArray(existingJob?.line_items)
        ? existingJob.line_items
        : [],
    contacts:
      Array.isArray(existingJob?.contacts) && existingJob.contacts.length > 0
        ? existingJob.contacts
        : overrides.clientName ||
          overrides.clientPhone ||
          overrides.clientEmail ||
          bid.client_name ||
          bid.client_phone ||
          bid.sender_email
        ? [
            {
              id: 'primary-init',
              name:
                overrides.clientName ??
                bid.client_name ??
                bid.sender_name ??
                overrides.clientCompany ??
                bid.client_company ??
                'Primary Contact',
              role: 'Primary POC',
              company: overrides.clientCompany ?? bid.client_company ?? null,
              phone: overrides.clientPhone ?? bid.client_phone ?? null,
              email: overrides.clientEmail ?? bid.sender_email ?? null,
              isPrimary: true,
            },
          ]
        : [],
    won_confirmed_at: existingJob?.won_confirmed_at ?? now,
    updated_at: now,
  };

  if (existingJob?.id) {
    const { data, error } = await supabase
      .from('jobs')
      .update(payload)
      .eq('id', existingJob.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { job: data, created: false };
  }

  const { data, error } = await supabase.from('jobs').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return { job: data, created: true };
}
