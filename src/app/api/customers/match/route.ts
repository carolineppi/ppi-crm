import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { findBestCustomerMatches } from '@/lib/customers/matchCustomer';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const companyName = request.nextUrl.searchParams.get('company');
    const email = request.nextUrl.searchParams.get('email');
    const phone = request.nextUrl.searchParams.get('phone');

    const result = await findBestCustomerMatches(supabase, {
      companyName,
      email,
      phone,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to match customer' },
      { status: 500 }
    );
  }
}
