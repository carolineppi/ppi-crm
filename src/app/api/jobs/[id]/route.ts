import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const [jobRes, poRes, coRes] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase
        .from('job_purchase_orders')
        .select('*')
        .eq('job_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('job_change_orders')
        .select('*')
        .eq('job_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (jobRes.error || !jobRes.data) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
      job: jobRes.data,
      purchaseOrders: poRes.data || [],
      changeOrders: coRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load job' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const allowedFields: Record<string, string> = {
      jobNumber: 'job_number',
      projectName: 'project_name',
      clientName: 'client_name',
      clientCompany: 'client_company',
      clientPhone: 'client_phone',
      clientEmail: 'client_email',
      addressStreet: 'address_street',
      addressCity: 'address_city',
      addressState: 'address_state',
      addressZip: 'address_zip',
      scopeOfWork: 'scope_of_work',
      estimatorName: 'estimator_name',
      quoteAmount: 'quote_amount',
      estimatedStartDate: 'estimated_start_date',
      googleDriveFolderUrl: 'google_drive_folder_url',
      status: 'status',
      notes: 'notes',
      scopePdfFilename: 'scope_pdf_filename',
      scopePdfUrl: 'scope_pdf_url',
      lineItems: 'line_items',
      projectManager: 'project_manager',
      materialEta: 'material_eta',
      siteAvailableRange: 'site_available_range',
      requestedInstallDate: 'requested_install_date',
      installAvailabilityNotes: 'install_availability_notes',
      installRequestStatus: 'install_request_status',
      contacts: 'contacts',
      pmNotesLog: 'pm_notes_log',
    };

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camel, snake] of Object.entries(allowedFields)) {
      if (body[camel] !== undefined) {
        updates[snake] = body[camel];
      }
    }

    if (body.projectManager !== undefined) {
      updates.pm_assigned_at = body.projectManager ? new Date().toISOString() : null;
    }

    // Keep top-level client_name / client_phone / client_email synced with Primary Contact
    if (Array.isArray(body.contacts)) {
      const primary =
        body.contacts.find((c: any) => c?.isPrimary) || body.contacts[0] || null;
      if (primary) {
        updates.client_name = primary.name || null;
        updates.client_phone = primary.phone || null;
        updates.client_email = primary.email || null;
      } else {
        updates.client_name = null;
        updates.client_phone = null;
        updates.client_email = null;
      }
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update job' },
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
    const { error } = await supabase.from('jobs').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete job' },
      { status: 500 }
    );
  }
}
