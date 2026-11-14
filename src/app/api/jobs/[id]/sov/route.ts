import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { round2, syncChangeOrderToSov } from '@/lib/accounting/aia-helpers';
import { groupItemsBySection } from '@/lib/pricing/quote-sections';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('job_sov_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sovItems: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load SOV' },
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

    if (body?.action === 'sync_change_orders') {
      const { data: cos } = await supabase
        .from('job_change_orders')
        .select('*')
        .eq('job_id', id);
      for (const co of cos || []) {
        await syncChangeOrderToSov(supabase, id, co);
      }
      const { data: updated } = await supabase
        .from('job_sov_items')
        .select('*')
        .eq('job_id', id)
        .order('sort_order', { ascending: true });
      return NextResponse.json({ sovItems: updated || [] });
    }

    if (body?.action === 'import_from_quote') {
      const { data: job } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single();
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

      const newLines: Array<{
        item_number: string;
        description: string;
        scheduled_value: number;
      }> = [];

      if (job.bid_request_id) {
        const { data: cart } = await supabase
          .from('job_quote_carts')
          .select('*')
          .eq('bid_request_id', job.bid_request_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cart && Array.isArray(cart.items) && cart.items.length > 0) {
          const grouped = groupItemsBySection(
            cart.items,
            Array.isArray(cart.sections) ? cart.sections : [],
            Number(cart.markup_percent) || 0
          );
          let idx = 1;
          for (const g of grouped) {
            if (g.config.pricingMode === 'furnish_and_install') {
              newLines.push({
                item_number: String(idx++).padStart(2, '0'),
                description: `${g.sectionName} — Furnish & Install`,
                scheduled_value: round2(g.totals.furnishSell + g.totals.installSell),
              });
            } else {
              newLines.push({
                item_number: String(idx++).padStart(2, '0'),
                description: `${g.sectionName} — Furnish Material`,
                scheduled_value: round2(g.totals.furnishSell),
              });
              if (g.totals.installSell > 0) {
                newLines.push({
                  item_number: String(idx++).padStart(2, '0'),
                  description: `${g.sectionName} — Installation`,
                  scheduled_value: round2(g.totals.installSell),
                });
              }
            }
            for (const addon of g.config.addons || []) {
              newLines.push({
                item_number: String(idx++).padStart(2, '0'),
                description: `${g.sectionName} — ${addon.label}`,
                scheduled_value: round2(Number(addon.amount) || 0),
              });
            }
          }
        }
      }

      if (newLines.length === 0) {
        newLines.push({
          item_number: '01',
          description: job.scope_of_work || job.project_name || 'Contract Scope',
          scheduled_value: round2(Number(job.quote_amount) || 0),
        });
      }

      // Remove old contract lines, keep synced CO lines
      await supabase
        .from('job_sov_items')
        .delete()
        .eq('job_id', id)
        .eq('source', 'contract');

      const inserts = newLines.map((l, i) => ({
        job_id: id,
        item_number: l.item_number,
        description: l.description,
        scheduled_value: l.scheduled_value,
        source: 'contract',
        sort_order: i + 1,
      }));

      await supabase.from('job_sov_items').insert(inserts);

      // Ensure approved COs are synced
      const { data: cos } = await supabase
        .from('job_change_orders')
        .select('*')
        .eq('job_id', id);
      for (const co of cos || []) {
        await syncChangeOrderToSov(supabase, id, co);
      }

      const { data: updated } = await supabase
        .from('job_sov_items')
        .select('*')
        .eq('job_id', id)
        .order('sort_order', { ascending: true });
      return NextResponse.json({ sovItems: updated || [] });
    }

    if (Array.isArray(body?.items)) {
      // Save full contract SOV lines + any custom edits
      for (let i = 0; i < body.items.length; i++) {
        const it = body.items[i];
        const payload = {
          job_id: id,
          item_number: String(it.item_number || String(i + 1).padStart(2, '0')).trim(),
          description: String(it.description || 'Scope Item').trim(),
          scheduled_value: round2(Number(it.scheduled_value) || 0),
          source: it.source === 'change_order' ? 'change_order' : 'contract',
          sort_order: i + 1,
          updated_at: new Date().toISOString(),
        };
        if (it.id && !String(it.id).startsWith('new-')) {
          await supabase.from('job_sov_items').update(payload).eq('id', it.id).eq('job_id', id);
        } else {
          await supabase.from('job_sov_items').insert(payload);
        }
      }
    } else if (body?.description) {
      const { data: existing } = await supabase
        .from('job_sov_items')
        .select('sort_order')
        .eq('job_id', id)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextSort = (existing?.[0]?.sort_order ?? 0) + 1;

      await supabase.from('job_sov_items').insert({
        job_id: id,
        item_number: String(body.itemNumber || String(nextSort).padStart(2, '0')).trim(),
        description: String(body.description).trim(),
        scheduled_value: round2(Number(body.scheduledValue) || 0),
        source: 'contract',
        sort_order: nextSort,
      });
    }

    const { data: updated } = await supabase
      .from('job_sov_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order', { ascending: true });
    return NextResponse.json({ sovItems: updated || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save SOV' },
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
    const itemId = request.nextUrl.searchParams.get('itemId');
    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('job_sov_items')
      .delete()
      .eq('id', itemId)
      .eq('job_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete SOV item' },
      { status: 500 }
    );
  }
}
