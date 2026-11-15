import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { canAccessPath, UserProfile } from '@/lib/auth/roles';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/webhooks/email'];

function isPublicPath(pathname: string) {
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/)
  ) {
    return true;
  }
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Enforce page-level RBAC for non-API routes
  if (!pathname.startsWith('/api/')) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, auth_user_id, email, full_name, primary_role, roles, allowed_pages, installer_id, is_active, dashboard_config')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    // If profile isn't linked yet (first OAuth callback), allow /dashboard to trigger linking
    if (profile) {
      if (!profile.is_active) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('error', 'inactive');
        return NextResponse.redirect(loginUrl);
      }
      if (!canAccessPath(profile as UserProfile, pathname)) {
        const dashUrl = request.nextUrl.clone();
        dashUrl.pathname = '/dashboard';
        dashUrl.searchParams.set('denied', '1');
        return NextResponse.redirect(dashUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
