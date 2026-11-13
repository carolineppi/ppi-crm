import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('manufacturer_price_books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ books: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch price books' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, defaultMultiplier } = body;
    if (!id || defaultMultiplier === undefined) {
      return NextResponse.json({ error: 'id and defaultMultiplier are required' }, { status: 400 });
    }

    const mult = Number(defaultMultiplier);
    if (!Number.isFinite(mult) || mult <= 0 || mult > 5) {
      return NextResponse.json({ error: 'Multiplier must be between 0 and 5' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: book, error: bookErr } = await supabase
      .from('manufacturer_price_books')
      .update({ default_multiplier: mult })
      .eq('id', id)
      .select()
      .single();

    if (bookErr) {
      return NextResponse.json({ error: bookErr.message }, { status: 500 });
    }

    // Update multiplier on all items in this price book so effective_net_price recalculates automatically
    const { error: itemErr } = await supabase
      .from('manufacturer_price_items')
      .update({ multiplier: mult })
      .eq('price_book_id', id);

    if (itemErr) {
      return NextResponse.json({ error: itemErr.message }, { status: 500 });
    }

    return NextResponse.json({ book });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update price book' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Book id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('manufacturer_price_books')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete price book' },
      { status: 500 }
    );
  }
}
