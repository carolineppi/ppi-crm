import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeCompanyName, upsertCustomerContact } from '@/lib/customers/matchCustomer';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'accounting',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const supabase = createServerSupabaseClient();
    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const standing = request.nextUrl.searchParams.get('standing') || '';
    const customerType = request.nextUrl.searchParams.get('type') || '';
    const badPayOnly = request.nextUrl.searchParams.get('badPayOnly') === '1';

    let query = supabase
      .from('customers')
      .select('*, customer_contacts(*)')
      .order('name', { ascending: true });

    if (standing && standing !== 'ALL') {
      query = query.eq('standing', standing);
    }
    if (customerType && customerType !== 'ALL') {
      query = query.eq('customer_type', customerType);
    }
    if (badPayOnly) {
      query = query.eq('bad_pay', true);
    }

    // Fetch up to 1500 customers (current dataset is ~1,124 rows)
    const { data: customers, error } = await query.limit(1500);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: jobCountsRaw } = await supabase
      .from('jobs')
      .select('id, customer_id');

    const jobCountByCustomer = new Map<string, number>();
    for (const j of jobCountsRaw || []) {
      if (j.customer_id) {
        jobCountByCustomer.set(j.customer_id, (jobCountByCustomer.get(j.customer_id) || 0) + 1);
      }
    }

    let list = (customers || []).map((c: any) => ({
      ...c,
      contacts: Array.isArray(c.customer_contacts) ? c.customer_contacts : [],
      job_count: jobCountByCustomer.get(c.id) || 0,
    }));

    if (q) {
      list = list.filter((c: any) => {
        const contactHay = (c.contacts || [])
          .map((p: any) => `${p.full_name || ''} ${p.email || ''} ${p.phone || ''}`)
          .join(' ');
        const hay = `${c.name || ''} ${c.bill_to_name || ''} ${c.billing_email || ''} ${
          c.main_phone || ''
        } ${c.address_city || ''} ${c.address_state || ''} ${contactHay}`.toLowerCase();
        return hay.includes(q);
      });
    }

    return NextResponse.json({ customers: list });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load customers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    const payload = {
      name,
      normalized_name: normalizeCompanyName(name) || name.toLowerCase(),
      customer_type: body.customerType || body.customer_type || 'Contractor',
      standing: body.standing || 'No History',
      main_phone: body.mainPhone || body.main_phone || null,
      billing_email: body.billingEmail || body.billing_email || null,
      billing_postal_address: body.billingPostalAddress || body.billing_postal_address || null,
      billing_phone: body.billingPhone || body.billing_phone || null,
      general_notes: body.generalNotes || body.general_notes || null,
      bad_pay: Boolean(body.badPay ?? body.bad_pay ?? false),
      bad_pay_notes: body.badPayNotes || body.bad_pay_notes || null,
      bill_day: body.billDay || body.bill_day || null,
      billing_platform: body.billingPlatform || body.billing_platform || null,
      bill_to_name: body.billToName || body.bill_to_name || name,
      address_street: body.addressStreet || body.address_street || null,
      address_city: body.addressCity || body.address_city || null,
      address_state: body.addressState || body.address_state || null,
      address_zip: body.addressZip || body.address_zip || null,
      credit: body.credit || null,
      updated_at: new Date().toISOString(),
    };

    const { data: customer, error } = await supabase
      .from('customers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.initialContact && (body.initialContact.fullName || body.initialContact.email || body.initialContact.phone || body.initialContact.firstName)) {
      await upsertCustomerContact(supabase, customer.id, {
        ...body.initialContact,
        isPrimary: true,
      });
    }

    const { data: contacts } = await supabase
      .from('customer_contacts')
      .select('*')
      .eq('customer_id', customer.id);

    return NextResponse.json({ customer: { ...customer, contacts: contacts || [] } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create customer' },
      { status: 500 }
    );
  }
}
