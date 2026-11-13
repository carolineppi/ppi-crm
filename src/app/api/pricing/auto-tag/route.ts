import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  aiTagPriceItemsBatch,
  classifyPreliminaryGroup,
} from '@/lib/pricing/auto-tagger';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const counts = new Map<string, number>();
    let untaggedCount = 0;

    // Page through equivalent_group column in 1000-row chunks
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('manufacturer_price_items')
        .select('equivalent_group')
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;

      for (const row of data) {
        if (row.equivalent_group) {
          counts.set(row.equivalent_group, (counts.get(row.equivalent_group) || 0) + 1);
        } else {
          untaggedCount++;
        }
      }
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const groups = Array.from(counts.entries())
      .map(([group, count]) => ({ group, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ groups, untaggedCount });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load groups' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const useAi = body.useAi !== false;
    const aiLimit = Math.min(200, Math.max(20, Number(body.aiLimit || 120)));

    const supabase = createServerSupabaseClient();

    // 1. Fetch existing group names for consistency
    const { data: existingRows } = await supabase
      .from('manufacturer_price_items')
      .select('equivalent_group')
      .not('equivalent_group', 'is', null)
      .limit(1000);

    const existingGroups = Array.from(
      new Set((existingRows || []).map((r) => r.equivalent_group).filter(Boolean) as string[])
    );

    // 2. Fetch untagged items (page through all untagged)
    const untagged: Array<{
      id: string;
      manufacturer: string;
      sku: string;
      description: string;
      category: string | null;
    }> = [];

    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('manufacturer_price_items')
        .select('id, manufacturer, sku, description, category')
        .is('equivalent_group', null)
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      untagged.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    // 3. Deterministic pre-pass (fast, consistent, zero API cost)
    const groupBuckets = new Map<string, string[]>();
    const stillUntagged: typeof untagged = [];

    for (const item of untagged) {
      const tag = classifyPreliminaryGroup(item);
      if (tag) {
        const list = groupBuckets.get(tag) || [];
        list.push(item.id);
        groupBuckets.set(tag, list);
        if (!existingGroups.includes(tag)) existingGroups.push(tag);
      } else {
        stillUntagged.push(item);
      }
    }

    let ruleTaggedCount = 0;
    for (const [groupName, ids] of groupBuckets.entries()) {
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error } = await supabase
          .from('manufacturer_price_items')
          .update({ equivalent_group: groupName })
          .in('id', chunk);
        if (!error) ruleTaggedCount += chunk.length;
      }
    }

    // 4. AI batch tagging on remaining ambiguous items (up to aiLimit)
    let aiTaggedCount = 0;
    if (useAi && stillUntagged.length > 0) {
      const toTag = stillUntagged.slice(0, aiLimit);
      const batchSize = 40;
      for (let i = 0; i < toTag.length; i += batchSize) {
        const batch = toTag.slice(i, i + batchSize);
        const tagged = await aiTagPriceItemsBatch(batch, existingGroups);
        const aiBuckets = new Map<string, string[]>();
        for (const t of tagged) {
          if (!t.equivalentGroup) continue;
          const list = aiBuckets.get(t.equivalentGroup) || [];
          list.push(t.id);
          aiBuckets.set(t.equivalentGroup, list);
        }
        for (const [groupName, ids] of aiBuckets.entries()) {
          const { error } = await supabase
            .from('manufacturer_price_items')
            .update({ equivalent_group: groupName })
            .in('id', ids);
          if (!error) aiTaggedCount += ids.length;
        }
      }
    }

    const remainingUntaggedCount = Math.max(0, stillUntagged.length - aiTaggedCount);

    return NextResponse.json({
      ruleTaggedCount,
      aiTaggedCount,
      remainingUntaggedCount,
    });
  } catch (err: any) {
    console.error('Auto-tag error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to auto-tag items' },
      { status: 500 }
    );
  }
}
