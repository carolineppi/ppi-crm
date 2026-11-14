import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeCompanyName } from '@/lib/customers/matchCustomer';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let list = data || [];
    if (q) {
      list = list.filter((s: any) => {
        const hay = `${s.name || ''} ${s.quickbooks_name || ''} ${s.representative || ''} ${
          s.representative_email || ''
        } ${s.representative_phone || ''} ${s.address || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ suppliers: list });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load suppliers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Supplier name is required' }, { status: 400 });
    }

    const payload = {
      name,
      normalized_name: normalizeCompanyName(name) || name.toLowerCase(),
      address: body.address || null,
      representative: body.representative || null,
      representative_phone: body.representativePhone || body.representative_phone || null,
      representative_email: body.representativeEmail || body.representative_email || null,
      quickbooks_name: body.quickbooksName || body.quickbooks_name || name,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('suppliers')
      .upsert(payload, { onConflict: 'normalized_name' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ supplier: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create supplier' },
      { status: 500 }
    );
  }
}
