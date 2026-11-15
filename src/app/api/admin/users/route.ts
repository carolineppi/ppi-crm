import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/rbac';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  const { errorResponse } = await requireApiAuth(['admin']);
  if (errorResponse) return errorResponse;

  const service = createServerSupabaseClient();
  const [usersRes, installersRes] = await Promise.all([
    service.from('user_profiles').select('*').order('full_name', { ascending: true }),
    service.from('installers').select('id, name, crew_name').order('name', { ascending: true }),
  ]);

  if (usersRes.error) {
    return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: usersRes.data || [],
    installers: installersRes.data || [],
  });
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireApiAuth(['admin']);
  if (errorResponse) return errorResponse;

  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  const fullName = String(body.fullName || '').trim();
  const roles = Array.isArray(body.roles) && body.roles.length > 0 ? body.roles : ['estimator'];
  const primaryRole = body.primaryRole || roles[0];

  if (!email || !fullName) {
    return NextResponse.json({ error: 'email and fullName are required' }, { status: 400 });
  }

  const service = createServerSupabaseClient();

  // Optional: create Supabase Auth user with password (great for Field Installers without Google)
  let authUserId: string | null = null;
  if (body.password && String(body.password).length >= 6) {
    const { data: createdAuth, error: authErr } = await service.auth.admin.createUser({
      email,
      password: String(body.password),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (authErr && !authErr.message.toLowerCase().includes('already')) {
      return NextResponse.json({ error: authErr.message }, { status: 400 });
    }
    authUserId = createdAuth?.user?.id || null;
  }

  const { data, error } = await service
    .from('user_profiles')
    .upsert(
      {
        email,
        full_name: fullName,
        primary_role: primaryRole,
        roles,
        allowed_pages: Array.isArray(body.allowedPages) ? body.allowedPages : null,
        installer_id: body.installerId || null,
        is_active: body.isActive !== undefined ? Boolean(body.isActive) : true,
        ...(authUserId ? { auth_user_id: authUserId } : {}),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

export async function PATCH(request: NextRequest) {
  const { errorResponse } = await requireApiAuth(['admin']);
  if (errorResponse) return errorResponse;

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.fullName !== undefined) updates.full_name = String(body.fullName).trim();
  if (Array.isArray(body.roles) && body.roles.length > 0) {
    updates.roles = body.roles;
    updates.primary_role = body.primaryRole || body.roles[0];
  } else if (body.primaryRole !== undefined) {
    updates.primary_role = body.primaryRole;
  }
  if (body.allowedPages !== undefined) updates.allowed_pages = body.allowedPages;
  if (body.installerId !== undefined) updates.installer_id = body.installerId || null;
  if (body.isActive !== undefined) updates.is_active = Boolean(body.isActive);

  const service = createServerSupabaseClient();
  const { data, error } = await service
    .from('user_profiles')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
