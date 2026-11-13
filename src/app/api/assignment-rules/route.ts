import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assignment rules:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch assignment rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const note = (body.note || '').trim();
    if (!note) {
      return NextResponse.json({ error: 'Rule note is required' }, { status: 400 });
    }

    const ruleType = body.rule_type || 'estimator_contractor';
    const severity = body.severity || 'warning';

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('assignment_rules')
      .insert({
        rule_type: ruleType,
        estimator_name: body.estimator_name ? String(body.estimator_name).trim() : null,
        contractor_name: body.contractor_name ? String(body.contractor_name).trim() : null,
        severity,
        note,
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating assignment rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create assignment rule' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.rule_type !== undefined) updates.rule_type = body.rule_type;
    if (body.estimator_name !== undefined) {
      updates.estimator_name = body.estimator_name ? String(body.estimator_name).trim() : null;
    }
    if (body.contractor_name !== undefined) {
      updates.contractor_name = body.contractor_name ? String(body.contractor_name).trim() : null;
    }
    if (body.severity !== undefined) updates.severity = body.severity;
    if (body.note !== undefined) updates.note = String(body.note).trim();
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('assignment_rules')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating assignment rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update assignment rule' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const idFromQuery = request.nextUrl.searchParams.get('id');
    let id = idFromQuery;
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('assignment_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting assignment rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete assignment rule' },
      { status: 500 }
    );
  }
}
