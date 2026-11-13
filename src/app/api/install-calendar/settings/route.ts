import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    if (body.defaultDailyLimit !== undefined) {
      const limit = Math.max(1, Math.min(50, Number(body.defaultDailyLimit) || 3));
      const { error } = await supabase.from('install_calendar_settings').upsert({
        id: 'default',
        default_daily_limit: limit,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (body.overrideDate) {
      if (body.removeOverride) {
        const { error } = await supabase
          .from('install_day_overrides')
          .delete()
          .eq('override_date', body.overrideDate);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else if (body.maxJobs !== undefined) {
        const maxJobs = Math.max(0, Math.min(50, Number(body.maxJobs)));
        const { error } = await supabase.from('install_day_overrides').upsert({
          override_date: body.overrideDate,
          max_jobs: maxJobs,
          note: body.note ? String(body.note).trim() : null,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update calendar settings' },
      { status: 500 }
    );
  }
}
