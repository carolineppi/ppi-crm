import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserContext } from '@/lib/auth/rbac';
import { ROLE_DEFINITIONS, UserRole } from '@/lib/auth/roles';

export async function POST(request: NextRequest) {
  const ctx = await getCurrentUserContext({ ignoreViewAs: true });
  if (!ctx || !ctx.profile.roles.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const role = body.role ? String(body.role).trim() : '';
  const name = body.name ? String(body.name).trim() : '';

  const response = NextResponse.json({ ok: true, role: role || null, name: name || null });

  if (!role || role === 'admin') {
    response.cookies.delete('ppi_view_as_role');
    response.cookies.delete('ppi_view_as_name');
  } else if (role in ROLE_DEFINITIONS) {
    response.cookies.set('ppi_view_as_role', role as UserRole, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
    });
    if (name) {
      response.cookies.set('ppi_view_as_name', name, {
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
      });
    } else {
      response.cookies.delete('ppi_view_as_name');
    }
  } else {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  return response;
}
