import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiAuth } from '@/lib/auth/rbac';

export async function GET() {
  const { errorResponse } = await requireApiAuth();
  if (errorResponse) return errorResponse;
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, roles, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const estimatorSet = new Set<string>();
    const pmSet = new Set<string>();

    const employees = rows.map((r: any) => {
      const name = String(r.full_name || r.email || '').trim();
      const roles: string[] = Array.isArray(r.roles) ? r.roles : [];
      if (name && roles.includes('estimator')) {
        estimatorSet.add(name);
      }
      if (name && roles.includes('pm')) {
        pmSet.add(name);
      }
      return {
        id: r.id,
        fullName: name,
        email: r.email,
        roles,
      };
    });

    return NextResponse.json({
      estimators: Array.from(estimatorSet).sort((a, b) => a.localeCompare(b)),
      pms: Array.from(pmSet).sort((a, b) => a.localeCompare(b)),
      employees,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load employees' },
      { status: 500 }
    );
  }
}
