import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Handle date-specific availability override
    if (body.dateOverride) {
      const ov = body.dateOverride;
      if (ov.remove) {
        const { error } = await supabase
          .from('installer_date_overrides')
          .delete()
          .eq('installer_id', id)
          .eq('override_date', ov.overrideDate);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        const { error } = await supabase.from('installer_date_overrides').upsert(
          {
            installer_id: id,
            override_date: ov.overrideDate,
            is_available: Boolean(ov.isAvailable),
            shift: ov.shift || 'Day',
            start_time: ov.startTime || null,
            end_time: ov.endTime || null,
            note: ov.note ? String(ov.note).trim() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'installer_id,override_date' }
        );
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    const allowedFields: Record<string, string> = {
      name: 'name',
      employmentType: 'employment_type',
      companyName: 'company_name',
      phone: 'phone',
      email: 'email',
      specialty: 'specialty',
      defaultWeeklyAvailability: 'default_weekly_availability',
      isActive: 'is_active',
      notes: 'notes',
    };

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    for (const [camel, snake] of Object.entries(allowedFields)) {
      if (body[camel] !== undefined) {
        updates[snake] = body[camel];
      }
    }

    const { data: installer, error } = await supabase
      .from('installers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ installer });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update installer' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { error } = await supabase.from('installers').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete installer' },
      { status: 500 }
    );
  }
}
