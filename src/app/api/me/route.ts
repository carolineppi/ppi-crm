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
    realProfile: ctx.realProfile,
    isRealAdmin: ctx.realProfile.roles.includes('admin'),
    isViewingAs: ctx.isViewingAs,
    navLinks: getAllowedNavLinks(ctx.profile),
    defaultWidgets: getDefaultWidgetsForRoles(ctx.profile.roles),
  });
}
