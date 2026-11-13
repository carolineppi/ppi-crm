import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('job_change_orders')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrders: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load change orders' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const items = Array.isArray(body.items) ? body.items : [];
    const computedAmount =
      body.amount !== undefined && body.amount !== null && body.amount !== ''
        ? Math.abs(Number(body.amount) || 0)
        : Math.abs(
            items.reduce(
              (sum: number, it: any) =>
                sum + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0),
              0
            )
          );

    const status = body.status || 'pending';
    const payload: Record<string, any> = {
      job_id: id,
      co_number: String(body.coNumber || `CO-${Date.now().toString().slice(-4)}`).trim(),
      title: String(body.title || 'Scope Change Order').trim(),
      type: body.type === 'deduction' ? 'deduction' : 'addition',
      amount: Math.round(computedAmount * 100) / 100,
      status,
      reason: body.reason ? String(body.reason).trim() : null,
      items,
      requested_by: body.requestedBy || null,
      approved_by: status === 'approved' || status === 'billed' ? body.approvedBy || body.requestedBy || 'PM' : null,
      approved_at: status === 'approved' || status === 'billed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('job_change_orders')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrder: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create change order' },
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
    if (!body.coId) {
      return NextResponse.json({ error: 'coId is required' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.coNumber !== undefined) updates.co_number = String(body.coNumber).trim();
    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.type !== undefined) updates.type = body.type === 'deduction' ? 'deduction' : 'addition';
    if (body.reason !== undefined) updates.reason = body.reason ? String(body.reason).trim() : null;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'approved' || body.status === 'billed') {
        updates.approved_by = body.approvedBy || 'PM';
        updates.approved_at = new Date().toISOString();
      }
    }
    if (Array.isArray(body.items)) {
      updates.items = body.items;
    }
    if (body.amount !== undefined) {
      updates.amount = Math.abs(Number(body.amount) || 0);
    }

    const { data, error } = await supabase
      .from('job_change_orders')
      .update(updates)
      .eq('id', body.coId)
      .eq('job_id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ changeOrder: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update change order' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const coId = request.nextUrl.searchParams.get('coId');
    if (!coId) {
      return NextResponse.json({ error: 'coId is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('job_change_orders')
      .delete()
      .eq('id', coId)
      .eq('job_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete change order' },
      { status: 500 }
    );
  }
}
