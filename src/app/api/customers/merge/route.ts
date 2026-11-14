import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const sourceCustomerId = body?.sourceCustomerId;
    const targetCustomerId = body?.targetCustomerId;

    if (!sourceCustomerId || !targetCustomerId || sourceCustomerId === targetCustomerId) {
      return NextResponse.json(
        { error: 'Valid distinct sourceCustomerId and targetCustomerId are required' },
        { status: 400 }
      );
    }

    const [{ data: source }, { data: target }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', sourceCustomerId).single(),
      supabase.from('customers').select('*').eq('id', targetCustomerId).single(),
    ]);

    if (!source || !target) {
      return NextResponse.json({ error: 'Source or target customer not found' }, { status: 404 });
    }

    // 1. Move all contacts from source to target (keeping target's primary status intact)
    await supabase
      .from('customer_contacts')
      .update({
        customer_id: targetCustomerId,
        is_primary: false,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', sourceCustomerId);

    // 2. Re-link any jobs pointing to sourceCustomerId
    await supabase
      .from('jobs')
      .update({ customer_id: targetCustomerId })
      .eq('customer_id', sourceCustomerId);

    // 3. Backfill any blank fields on target from source
    const mergedNotes = [target.general_notes, source.general_notes]
      .filter(Boolean)
      .join('\n---\n');

    const { error: updateErr } = await supabase
      .from('customers')
      .update({
        main_phone: target.main_phone || source.main_phone,
        billing_email: target.billing_email || source.billing_email,
        billing_postal_address: target.billing_postal_address || source.billing_postal_address,
        billing_phone: target.billing_phone || source.billing_phone,
        bill_to_name: target.bill_to_name || source.bill_to_name,
        address_street: target.address_street || source.address_street,
        address_city: target.address_city || source.address_city,
        address_state: target.address_state || source.address_state,
        address_zip: target.address_zip || source.address_zip,
        bad_pay: Boolean(target.bad_pay || source.bad_pay),
        bad_pay_notes: target.bad_pay_notes || source.bad_pay_notes,
        general_notes: mergedNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetCustomerId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // 4. Delete source customer
    const { error: delErr } = await supabase
      .from('customers')
      .delete()
      .eq('id', sourceCustomerId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mergedIntoId: targetCustomerId });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to merge customers' },
      { status: 500 }
    );
  }
}
