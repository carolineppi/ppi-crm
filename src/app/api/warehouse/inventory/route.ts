import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const lowStockOnly = request.nextUrl.searchParams.get('lowStock') === 'true';

    const [itemsRes, movementsRes] = await Promise.all([
      supabase.from('warehouse_inventory').select('*').order('name', { ascending: true }),
      supabase
        .from('warehouse_stock_movements')
        .select('*, inventory:warehouse_inventory(sku, name), job:jobs(job_number, project_name)')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    if (itemsRes.error) {
      return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
    }

    let items = itemsRes.data || [];
    if (q) {
      items = items.filter((it) =>
        `${it.sku || ''} ${it.name || ''} ${it.manufacturer || ''} ${it.category || ''} ${it.bin_location || ''}`
          .toLowerCase()
          .includes(q)
      );
    }
    if (lowStockOnly) {
      items = items.filter(
        (it) => Number(it.quantity_on_hand || 0) <= Number(it.reorder_point || 0)
      );
    }

    return NextResponse.json({
      items,
      movements: movementsRes.data || [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load inventory' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Action 1: Stock movement (receive, pull_to_job, return, adjustment)
    if (body.action === 'movement') {
      const { inventoryId, movementType, quantity, jobId, performedBy, notes } = body;
      if (!inventoryId || !movementType || quantity === undefined) {
        return NextResponse.json(
          { error: 'inventoryId, movementType, and quantity are required' },
          { status: 400 }
        );
      }

      const { data: current, error: fetchErr } = await supabase
        .from('warehouse_inventory')
        .select('*')
        .eq('id', inventoryId)
        .single();

      if (fetchErr || !current) {
        return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });
      }

      const qtyNum = Number(quantity) || 0;
      const delta =
        movementType === 'pull_to_job'
          ? -Math.abs(qtyNum)
          : movementType === 'receive' || movementType === 'return'
          ? Math.abs(qtyNum)
          : qtyNum; // adjustment can be +/-

      const newQty = Math.max(0, Number(current.quantity_on_hand || 0) + delta);

      const { data: updatedItem, error: updErr } = await supabase
        .from('warehouse_inventory')
        .update({
          quantity_on_hand: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventoryId)
        .select()
        .single();

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      const { data: movement, error: movErr } = await supabase
        .from('warehouse_stock_movements')
        .insert({
          inventory_id: inventoryId,
          job_id: jobId || null,
          movement_type: movementType,
          quantity_delta: delta,
          performed_by: performedBy ? String(performedBy).trim() : null,
          notes: notes ? String(notes).trim() : null,
        })
        .select()
        .single();

      if (movErr) {
        return NextResponse.json({ error: movErr.message }, { status: 500 });
      }

      return NextResponse.json({ item: updatedItem, movement });
    }

    // Action 2: Create new inventory SKU
    if (!body.sku || !body.name) {
      return NextResponse.json({ error: 'sku and name are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('warehouse_inventory')
      .insert({
        sku: String(body.sku).trim().toUpperCase(),
        name: String(body.name).trim(),
        manufacturer: body.manufacturer ? String(body.manufacturer).trim() : null,
        category: body.category || 'Hardware',
        bin_location: body.binLocation ? String(body.binLocation).trim() : null,
        quantity_on_hand: Number(body.quantityOnHand) || 0,
        reorder_point: Number(body.reorderPoint) || 0,
        unit: body.unit ? String(body.unit).trim() : 'EA',
        unit_cost: Number(body.unitCost) || 0,
        notes: body.notes ? String(body.notes).trim() : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save inventory' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.manufacturer !== undefined) {
      updates.manufacturer = body.manufacturer ? String(body.manufacturer).trim() : null;
    }
    if (body.category !== undefined) updates.category = body.category;
    if (body.binLocation !== undefined) {
      updates.bin_location = body.binLocation ? String(body.binLocation).trim() : null;
    }
    if (body.reorderPoint !== undefined) updates.reorder_point = Number(body.reorderPoint) || 0;
    if (body.unit !== undefined) updates.unit = String(body.unit).trim();
    if (body.unitCost !== undefined) updates.unit_cost = Number(body.unitCost) || 0;
    if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;

    const { data, error } = await supabase
      .from('warehouse_inventory')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update inventory item' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('warehouse_inventory').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete inventory item' },
      { status: 500 }
    );
  }
}
