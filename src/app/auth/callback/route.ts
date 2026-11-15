import { NextRequest, NextResponse } from 'next/server';
import { createSsrSupabaseClient } from '@/lib/supabase/ssr';
import { getCurrentUserContext } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/dashboard';

  if (code) {
    const supabase = await createSsrSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const ctx = await getCurrentUserContext();
      if (!ctx) {
        return NextResponse.redirect(`${origin}/login?error=inactive`);
      }
      const safeNext = next.startsWith('/') ? next : '/dashboard';
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
