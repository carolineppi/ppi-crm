import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/rbac';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { ctx, errorResponse } = await requireApiAuth();
  if (errorResponse || !ctx) return errorResponse!;

  const isAdmin =
    ctx.realProfile.roles.includes('admin') || ctx.profile.roles.includes('admin');

  const statusFilter = request.nextUrl.searchParams.get('status');
  const typeFilter = request.nextUrl.searchParams.get('type');

  const db = isAdmin ? createServerSupabaseClient() : ctx.ssr;
  let query = db
    .from('feedback_flags')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!isAdmin) {
    query = query.eq('user_profile_id', ctx.profile.id);
  }
  if (statusFilter && statusFilter !== 'ALL') {
    query = query.eq('status', statusFilter);
  }
  if (typeFilter && typeFilter !== 'ALL') {
    query = query.eq('flag_type', typeFilter);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const openCount = rows.filter(
    (r: any) => r.status === 'open' || r.status === 'in_progress'
  ).length;

  return NextResponse.json({ flags: rows, openCount });
}

export async function POST(request: NextRequest) {
  const { ctx, errorResponse } = await requireApiAuth();
  if (errorResponse || !ctx) return errorResponse!;

  try {
    const body = await request.json();
    const title = String(body?.title || '').trim();
    const message = String(body?.message || '').trim();
    if (!title || !message) {
      return NextResponse.json(
        { error: 'Title and message are required.' },
        { status: 400 }
      );
    }

    const flagType = body?.flagType === 'improvement' ? 'improvement' : 'bug';
    const severity = ['low', 'normal', 'urgent'].includes(body?.severity)
      ? body.severity
      : 'normal';

    const contextSnapshot = {
      ...(typeof body?.contextSnapshot === 'object' && body.contextSnapshot !== null
        ? body.contextSnapshot
        : {}),
      effectiveRole: ctx.profile.primary_role,
      effectiveRoles: ctx.profile.roles,
      isViewingAs: ctx.isViewingAs,
      realAdminEmail: ctx.isViewingAs ? ctx.realProfile.email : undefined,
    };

    const payload = {
      user_profile_id: ctx.realProfile.id,
      reporter_name: ctx.realProfile.full_name || ctx.realProfile.email,
      reporter_email: ctx.realProfile.email,
      reporter_role: ctx.profile.primary_role,
      flag_type: flagType,
      severity,
      title,
      message,
      page_url: body?.pageUrl ? String(body.pageUrl).slice(0, 1000) : null,
      pathname: body?.pathname ? String(body.pathname).slice(0, 500) : null,
      context_snapshot: contextSnapshot,
      status: 'open',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await ctx.ssr
      .from('feedback_flags')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flag: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit flag' },
      { status: 500 }
    );
  }
}
