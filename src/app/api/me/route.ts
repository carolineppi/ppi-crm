import { NextResponse } from 'next/server';
import {
  getAllowedNavLinks,
  getCurrentUserContext,
  getDefaultWidgetsForRoles,
} from '@/lib/auth/rbac';

export async function GET() {
  const ctx = await getCurrentUserContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    profile: ctx.profile,
    navLinks: getAllowedNavLinks(ctx.profile),
    defaultWidgets: getDefaultWidgetsForRoles(ctx.profile.roles),
  });
}
