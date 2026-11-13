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
      .from('job_purchase_orders')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ purchaseOrders: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load purchase orders' },
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
    const computedTotal =
      body.totalCost !== undefined && body.totalCost !== null && body.totalCost !== ''
        ? Number(body.totalCost) || 0
        : items.reduce(
            (sum: number, it: any) =>
              sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0),
            0
          );

    const payload = {
      job_id: id,
      po_number: String(body.poNumber || `PO-${Date.now().toString().slice(-5)}`).trim(),
      vendor: String(body.vendor || 'Supplier').trim(),
      status: body.status || 'draft',
      order_date: body.orderDate || null,
      expected_delivery_date: body.expectedDeliveryDate || null,
      actual_delivery_date: body.actualDeliveryDate || null,
      tracking_number: body.trackingNumber ? String(body.trackingNumber).trim() : null,
      items,
      total_cost: Math.round(computedTotal * 100) / 100,
      notes: body.notes ? String(body.notes).trim() : null,
      created_by: body.createdBy || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('job_purchase_orders')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ purchaseOrder: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create purchase order' },
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
    if (!body.poId) {
      return NextResponse.json({ error: 'poId is required' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.poNumber !== undefined) updates.po_number = String(body.poNumber).trim();
    if (body.vendor !== undefined) updates.vendor = String(body.vendor).trim();
    if (body.status !== undefined) updates.status = body.status;
    if (body.orderDate !== undefined) updates.order_date = body.orderDate || null;
    if (body.expectedDeliveryDate !== undefined) {
      updates.expected_delivery_date = body.expectedDeliveryDate || null;
    }
    if (body.actualDeliveryDate !== undefined) {
      updates.actual_delivery_date = body.actualDeliveryDate || null;
    }
    if (body.trackingNumber !== undefined) {
      updates.tracking_number = body.trackingNumber ? String(body.trackingNumber).trim() : null;
    }
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (Array.isArray(body.items)) {
      updates.items = body.items;
      const sum = body.items.reduce(
        (s: number, it: any) => s + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0),
        0
      );
      updates.total_cost = Math.round(sum * 100) / 100;
    }
    if (body.totalCost !== undefined) {
      updates.total_cost = Number(body.totalCost) || 0;
    }

    const { data, error } = await supabase
      .from('job_purchase_orders')
      .update(updates)
      .eq('id', body.poId)
      .eq('job_id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ purchaseOrder: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update purchase order' },
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
    const poId = request.nextUrl.searchParams.get('poId');
    if (!poId) {
      return NextResponse.json({ error: 'poId is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('job_purchase_orders')
      .delete()
      .eq('id', poId)
      .eq('job_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete purchase order' },
      { status: 500 }
    );
  }
}
