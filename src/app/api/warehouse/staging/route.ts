import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    if (!body.jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (body.warehouseStatus !== undefined) {
      updates.warehouse_status = body.warehouseStatus;
      if (body.warehouseStatus === 'staged_ready') {
        updates.material_staged_at = new Date().toISOString();
      }
      if (body.warehouseStatus === 'loaded_out' || body.warehouseStatus === 'delivered_to_site') {
        updates.material_loaded_at = new Date().toISOString();
        if (body.loadedBy) updates.material_loaded_by = String(body.loadedBy).trim();
      }
    }
    if (body.warehouseLocation !== undefined) {
      updates.warehouse_location = body.warehouseLocation
        ? String(body.warehouseLocation).trim()
        : null;
    }
    if (body.warehouseNotes !== undefined) {
      updates.warehouse_notes = body.warehouseNotes
        ? String(body.warehouseNotes).trim()
        : null;
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', body.jobId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ job: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update job staging' },
      { status: 500 }
    );
  }
}
