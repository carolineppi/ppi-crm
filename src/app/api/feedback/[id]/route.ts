import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/rbac';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { ctx, errorResponse } = await requireApiAuth(['admin']);
  if (errorResponse || !ctx) return errorResponse!;

  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (
      body?.status &&
      ['open', 'in_progress', 'resolved', 'wont_fix'].includes(body.status)
    ) {
      updates.status = body.status;
      if (body.status === 'resolved' || body.status === 'wont_fix') {
        updates.resolved_by = ctx.realProfile.full_name || ctx.realProfile.email;
        updates.resolved_at = new Date().toISOString();
      } else {
        updates.resolved_by = null;
        updates.resolved_at = null;
      }
    }

    if (body?.adminNotes !== undefined) {
      updates.admin_notes = body.adminNotes ? String(body.adminNotes).trim() : null;
    }

    const db = createServerSupabaseClient();
    const { data, error } = await db
      .from('feedback_flags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flag: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update flag' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth(['admin']);
  if (errorResponse) return errorResponse;

  try {
    const { id } = await params;
    const db = createServerSupabaseClient();
    const { error } = await db.from('feedback_flags').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete flag' },
      { status: 500 }
    );
  }
}
