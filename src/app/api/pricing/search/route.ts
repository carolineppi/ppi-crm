import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const manufacturer = (request.nextUrl.searchParams.get('manufacturer') || '').trim();
    const equivalentGroup = (request.nextUrl.searchParams.get('equivalentGroup') || '').trim();
    const limit = Math.min(200, Math.max(10, Number(request.nextUrl.searchParams.get('limit') || '100')));

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from('manufacturer_price_items')
      .select('*')
      .order('effective_net_price', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (manufacturer && manufacturer !== 'ALL') {
      query = query.eq('manufacturer', manufacturer);
    }

    if (equivalentGroup === '__UNTAGGED__') {
      query = query.is('equivalent_group', null);
    } else if (equivalentGroup) {
      query = query.eq('equivalent_group', equivalentGroup);
    }

    if (q) {
      // Support multi-word search by matching each token against sku/alt_sku/description/equivalent_group
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 4);
      for (const token of tokens) {
        const escaped = token.replace(/[%_]/g, '');
        query = query.or(
          `sku.ilike.%${escaped}%,alt_sku.ilike.%${escaped}%,description.ilike.%${escaped}%,equivalent_group.ilike.%${escaped}%,category.ilike.%${escaped}%`
        );
      }
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to search pricing' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, equivalentGroup, multiplier } = body;
    if (!id) {
      return NextResponse.json({ error: 'Item id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (equivalentGroup !== undefined) {
      updates.equivalent_group = equivalentGroup ? String(equivalentGroup).trim() : null;
    }
    if (multiplier !== undefined) {
      const mult = Number(multiplier);
      if (!Number.isFinite(mult) || mult <= 0 || mult > 5) {
        return NextResponse.json({ error: 'Invalid multiplier' }, { status: 400 });
      }
      updates.multiplier = mult;
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('manufacturer_price_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update price item' },
      { status: 500 }
    );
  }
}
