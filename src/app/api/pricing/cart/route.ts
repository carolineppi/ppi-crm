import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const bidId = request.nextUrl.searchParams.get('bidId');
    const supabase = createServerSupabaseClient();

    if (bidId) {
      const { data, error } = await supabase
        .from('job_quote_carts')
        .select('*')
        .eq('bid_request_id', bidId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ cart: data || null });
    }

    const { data, error } = await supabase
      .from('job_quote_carts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(25);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ carts: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load quote cart' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      bidRequestId,
      title,
      markupPercent = 0,
      notes = null,
      items = [],
      status = 'draft',
    } = body;

    const now = new Date().toISOString();
    const supabase = createServerSupabaseClient();

    const payload: Record<string, any> = {
      bid_request_id: bidRequestId || null,
      title: (title || 'Untitled Quote').trim(),
      markup_percent: Number(markupPercent) || 0,
      notes: notes ? String(notes).trim() : null,
      items: Array.isArray(items) ? items : [],
      status: status === 'quoted' ? 'quoted' : 'draft',
      updated_at: now,
    };

    if (status === 'quoted') {
      payload.quoted_at = now;
    }

    let savedCart: any = null;

    if (id) {
      const { data, error } = await supabase
        .from('job_quote_carts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      savedCart = data;
    } else if (bidRequestId) {
      // Upsert by bid_request_id if one already exists
      const { data: existing } = await supabase
        .from('job_quote_carts')
        .select('id')
        .eq('bid_request_id', bidRequestId)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('job_quote_carts')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        savedCart = data;
      } else {
        const { data, error } = await supabase
          .from('job_quote_carts')
          .insert(payload)
          .select()
          .single();
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        savedCart = data;
      }
    } else {
      const { data, error } = await supabase
        .from('job_quote_carts')
        .insert(payload)
        .select()
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      savedCart = data;
    }

    // If "quoted" (printed), switch the linked bid (and its duplicate group siblings) to "bid_submitted" status!
    if (status === 'quoted' && bidRequestId) {
      const { data: targetBid, error: bidErr } = await supabase
        .from('bid_requests')
        .update({ estimator_status: 'bid_submitted' })
        .eq('id', bidRequestId)
        .select('id, duplicate_group_id')
        .single();

      if (bidErr) {
        console.error('Failed to update bid estimator_status to bid_submitted:', bidErr);
      } else if (targetBid?.duplicate_group_id) {
        await supabase
          .from('bid_requests')
          .update({ estimator_status: 'bid_submitted' })
          .eq('duplicate_group_id', targetBid.duplicate_group_id)
          .not('estimator_status', 'in', '("won","lost")');
      }
    }

    return NextResponse.json({ cart: savedCart });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save quote cart' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Cart id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('job_quote_carts').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete cart' },
      { status: 500 }
    );
  }
}
