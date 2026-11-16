import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeCompanyName } from '@/lib/customers/matchCustomer';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'warehouse',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await context.params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const trimmed = String(body.name).trim();
      if (trimmed) {
        updates.name = trimmed;
        updates.normalized_name = normalizeCompanyName(trimmed) || trimmed.toLowerCase();
      }
    }
    const fields: Array<[string, string]> = [
      ['address', 'address'],
      ['representative', 'representative'],
      ['representative_phone', 'representativePhone'],
      ['representative_email', 'representativeEmail'],
      ['quickbooks_name', 'quickbooksName'],
      ['notes', 'notes'],
    ];
    for (const [snake, camel] of fields) {
      if (body[snake] !== undefined) updates[snake] = body[snake];
      else if (body[camel] !== undefined) updates[snake] = body[camel];
    }

    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ supplier: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update supplier' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'warehouse',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await context.params;
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete supplier' },
      { status: 500 }
    );
  }
}
