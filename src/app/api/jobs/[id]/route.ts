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
    };

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camel, snake] of Object.entries(allowedFields)) {
      if (body[camel] !== undefined) {
        updates[snake] = body[camel];
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
