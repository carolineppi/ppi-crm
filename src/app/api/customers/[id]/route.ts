import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeCompanyName, upsertCustomerContact } from '@/lib/customers/matchCustomer';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
    'accounting',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await context.params;
    const supabase = createServerSupabaseClient();

    const [{ data: customer, error }, { data: contacts }, { data: jobs }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase
        .from('customer_contacts')
        .select('*')
        .eq('customer_id', id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('jobs')
        .select('id, job_number, project_name, status, quote_amount, created_at')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (error || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({
      customer: {
        ...customer,
        contacts: contacts || [],
        jobs: jobs || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load customer' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await context.params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const now = new Date().toISOString();

    // Contact operations
    if (body?.action === 'add_contact' && body.contact) {
      await upsertCustomerContact(supabase, id, body.contact);
    } else if (body?.action === 'set_primary_contact' && body.contactId) {
      await supabase
        .from('customer_contacts')
        .update({ is_primary: false, updated_at: now })
        .eq('customer_id', id);
      await supabase
        .from('customer_contacts')
        .update({ is_primary: true, updated_at: now })
        .eq('id', body.contactId)
        .eq('customer_id', id);
    } else if (body?.action === 'delete_contact' && body.contactId) {
      await supabase
        .from('customer_contacts')
        .delete()
        .eq('id', body.contactId)
        .eq('customer_id', id);
    } else if (body?.action === 'update_contact' && body.contactId && body.contact) {
      const c = body.contact;
      const fullName =
        c.fullName?.trim() ||
        [c.firstName, c.lastName].filter(Boolean).join(' ').trim() ||
        c.email?.trim() ||
        null;
      await supabase
        .from('customer_contacts')
        .update({
          first_name: c.firstName ?? null,
          last_name: c.lastName ?? null,
          full_name: fullName,
          email: c.email ?? null,
          phone: c.phone ?? null,
          role: c.role ?? null,
          notes: c.notes ?? null,
          updated_at: now,
        })
        .eq('id', body.contactId)
        .eq('customer_id', id);
    } else {
      const updates: Record<string, any> = { updated_at: now };
      if (body.name !== undefined) {
        const trimmed = String(body.name).trim();
        if (trimmed) {
          updates.name = trimmed;
          updates.normalized_name = normalizeCompanyName(trimmed) || trimmed.toLowerCase();
        }
      }
      const fieldMap: Array<[string, string]> = [
        ['customer_type', 'customerType'],
        ['standing', 'standing'],
        ['main_phone', 'mainPhone'],
        ['billing_email', 'billingEmail'],
        ['billing_postal_address', 'billingPostalAddress'],
        ['billing_phone', 'billingPhone'],
        ['general_notes', 'generalNotes'],
        ['bad_pay', 'badPay'],
        ['bad_pay_notes', 'badPayNotes'],
        ['bad_pay_year', 'badPayYear'],
        ['bad_pay_amount', 'badPayAmount'],
        ['bill_day', 'billDay'],
        ['billing_platform', 'billingPlatform'],
        ['bill_to_name', 'billToName'],
        ['address_street', 'addressStreet'],
        ['address_city', 'addressCity'],
        ['address_state', 'addressState'],
        ['address_zip', 'addressZip'],
        ['credit', 'credit'],
      ];
      for (const [snake, camel] of fieldMap) {
        if (body[snake] !== undefined) updates[snake] = body[snake];
        else if (body[camel] !== undefined) updates[snake] = body[camel];
      }

      const { error } = await supabase.from('customers').update(updates).eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const [{ data: customer }, { data: contacts }, { data: jobs }] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase
        .from('customer_contacts')
        .select('*')
        .eq('customer_id', id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('jobs')
        .select('id, job_number, project_name, status, quote_amount, created_at')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      customer: {
        ...customer,
        contacts: contacts || [],
        jobs: jobs || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update customer' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { errorResponse } = await requireApiAuth([
    'admin',
    'calendar_manager',
    'estimator',
    'pm',
  ]);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await context.params;
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete customer' },
      { status: 500 }
    );
  }
}
