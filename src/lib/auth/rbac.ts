import { NextResponse } from 'next/server';
import { createSsrSupabaseClient } from '@/lib/supabase/ssr';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UserProfile, UserRole } from '@/lib/auth/roles';

export * from '@/lib/auth/roles';

export async function getCurrentUserContext() {
  const ssr = await createSsrSupabaseClient();
  const {
    data: { user },
    error,
  } = await ssr.auth.getUser();

  if (error || !user) return null;

  const service = createServerSupabaseClient();
  const email = (user.email || '').toLowerCase();

  let { data: profile } = await service
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!profile && email) {
    const { data: byEmail } = await service
      .from('user_profiles')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (byEmail) {
      const { data: linked } = await service
        .from('user_profiles')
        .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
        .eq('id', byEmail.id)
        .select()
        .single();
      profile = linked || byEmail;
    } else if (email.endsWith('@partitionplus.com')) {
      const fullName =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        email.split('@')[0];
      const { data: created } = await service
        .from('user_profiles')
        .insert({
          auth_user_id: user.id,
          email,
          full_name: fullName,
          primary_role: 'estimator',
          roles: ['estimator'],
          is_active: true,
        })
        .select()
        .single();
      profile = created;
    }
  }

  if (!profile || !profile.is_active) {
    return null;
  }

  return {
    user,
    profile: profile as UserProfile,
    ssr,
  };
}

export async function requireApiAuth(allowedRoles?: UserRole[]) {
  const ctx = await getCurrentUserContext();
  if (!ctx) {
    return {
      ctx: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (
    allowedRoles &&
    allowedRoles.length > 0 &&
    !ctx.profile.roles.includes('admin') &&
    !allowedRoles.some((r) => ctx.profile.roles.includes(r))
  ) {
    return {
      ctx: null,
      errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ctx, errorResponse: null };
}
