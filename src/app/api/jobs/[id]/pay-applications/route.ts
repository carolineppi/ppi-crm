import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  G703Line,
  calculateG702AndG703,
  round2,
} from '@/lib/accounting/aia-helpers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('job_pay_applications')
      .select('*')
      .eq('job_id', id)
      .order('application_number', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ payApplications: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load pay applications' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const [{ data: job }, { data: sovItems }, { data: prevApps }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase
        .from('job_sov_items')
        .select('*')
        .eq('job_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('job_pay_applications')
        .select('*')
        .eq('job_id', id)
        .order('application_number', { ascending: false }),
    ]);

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const existingApps = prevApps || [];
    const nextAppNum =
      existingApps.length > 0 ? Number(existingApps[0].application_number || 0) + 1 : 1;

    const lastBilledApp =
      existingApps.find((a: any) => a.status === 'submitted' || a.status === 'paid') ||
      existingApps[0] ||
      null;
    const prevTemplateApp = existingApps[0] || null;

    const isRetainageRelease = Boolean(body?.isRetainageRelease);
    const completedRetPct =
      body?.completedRetainagePercent !== undefined
        ? Number(body.completedRetainagePercent)
        : Number(job.completed_retainage_percent ?? 10);
    const storedRetPct =
      body?.storedRetainagePercent !== undefined
        ? Number(body.storedRetainagePercent)
        : Number(job.stored_retainage_percent ?? 10);

    const lessPreviousCertificates = lastBilledApp
      ? round2(Number(lastBilledApp.total_earned_less_retainage) || 0)
      : 0;

    let initialLines: G703Line[];

    if (prevTemplateApp && Array.isArray(prevTemplateApp.g703_lines)) {
      // Carry over the accountant's customized line items, descriptions, and scheduled values
      const prevLines = prevTemplateApp.g703_lines as any[];
      const existingSovIds = new Set(prevLines.map((l) => l?.sovItemId).filter(Boolean));

      initialLines = prevLines.map((l: any) => {
        const prevCompleted = round2(
          (Number(l.previousCompleted) || 0) + (Number(l.thisPeriod) || 0)
        );
        const prevStored = round2(Number(l.storedMaterials) || 0);
        return {
          sovItemId: l.sovItemId || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          itemNumber: String(l.itemNumber ?? '01'),
          description: String(l.description ?? 'Scope Item'),
          source: l.source === 'change_order' ? 'change_order' : 'contract',
          scheduledValue: round2(Number(l.scheduledValue) || 0),
          previousCompleted: prevCompleted,
          thisPeriod: 0,
          storedMaterials: isRetainageRelease ? prevStored : 0,
          totalCompletedAndStored: round2(prevCompleted + (isRetainageRelease ? prevStored : 0)),
          percentComplete: 0,
          balanceToFinish: 0,
        };
      });

      // Also append any newly-approved change order SOV items created after the previous application
      const prevCreatedAt = prevTemplateApp.created_at
        ? new Date(prevTemplateApp.created_at).getTime()
        : 0;
      for (const s of sovItems || []) {
        if (
          s.source === 'change_order' &&
          !existingSovIds.has(s.id) &&
          (!prevCreatedAt || (s.created_at && new Date(s.created_at).getTime() > prevCreatedAt))
        ) {
          initialLines.push({
            sovItemId: s.id,
            itemNumber: s.item_number || 'CO',
            description: s.description || 'Change Order',
            source: 'change_order',
            scheduledValue: round2(Number(s.scheduled_value) || 0),
            previousCompleted: 0,
            thisPeriod: 0,
            storedMaterials: 0,
            totalCompletedAndStored: 0,
            percentComplete: 0,
            balanceToFinish: round2(Number(s.scheduled_value) || 0),
          });
        }
      }
    } else {
      const baseSov =
        sovItems && sovItems.length > 0
          ? sovItems
          : [
              {
                id: `contract-${id}`,
                item_number: '01',
                description: job.scope_of_work || job.project_name || 'Contract Scope',
                scheduled_value: Number(job.quote_amount) || 0,
                source: 'contract',
              },
            ];

      initialLines = baseSov.map((s: any) => ({
        sovItemId: s.id,
        itemNumber: s.item_number || '01',
        description: s.description || 'Scope Item',
        source: s.source === 'change_order' ? 'change_order' : 'contract',
        scheduledValue: round2(Number(s.scheduled_value) || 0),
        previousCompleted: 0,
        thisPeriod: 0,
        storedMaterials: 0,
        totalCompletedAndStored: 0,
        percentComplete: 0,
        balanceToFinish: 0,
      }));
    }

    const summary = calculateG702AndG703({
      lines: initialLines,
      completedRetainagePercent: completedRetPct,
      storedRetainagePercent: storedRetPct,
      lessPreviousCertificates,
      isRetainageRelease,
    });

    const now = new Date().toISOString();
    const { data: created, error } = await supabase
      .from('job_pay_applications')
      .insert({
        job_id: id,
        application_number: nextAppNum,
        period_to: body?.periodTo || new Date().toISOString().slice(0, 10),
        completed_retainage_percent: completedRetPct,
        stored_retainage_percent: storedRetPct,
        is_retainage_release: isRetainageRelease,
        status: body?.status || 'requested',
        requested_by: body?.requestedBy || job.project_manager || 'PM',
        assigned_accountant: body?.assignedAccountant || job.assigned_accountant || null,
        notes: body?.notes || null,
        original_contract_sum: summary.originalContractSum,
        net_change_orders: summary.netChangeOrders,
        contract_sum_to_date: summary.contractSumToDate,
        total_completed_and_stored: summary.totalCompletedAndStored,
        retainage_amount: summary.retainageAmount,
        total_earned_less_retainage: summary.totalEarnedLessRetainage,
        less_previous_certificates: summary.lessPreviousCertificates,
        current_payment_due: summary.currentPaymentDue,
        g703_lines: summary.lines,
        updated_at: now,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ payApplication: created });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create pay application' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const payAppId = body?.payAppId;
    if (!payAppId) {
      return NextResponse.json({ error: 'payAppId is required' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('job_pay_applications')
      .select('*')
      .eq('id', payAppId)
      .eq('job_id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Pay application not found' }, { status: 404 });
    }

    const completedRetPct =
      body.completedRetainagePercent !== undefined
        ? Number(body.completedRetainagePercent)
        : Number(existing.completed_retainage_percent ?? 10);
    const storedRetPct =
      body.storedRetainagePercent !== undefined
        ? Number(body.storedRetainagePercent)
        : Number(existing.stored_retainage_percent ?? 10);
    const isRetainageRelease =
      body.isRetainageRelease !== undefined
        ? Boolean(body.isRetainageRelease)
        : Boolean(existing.is_retainage_release);
    const lessPreviousCertificates =
      body.lessPreviousCertificates !== undefined
        ? Number(body.lessPreviousCertificates)
        : Number(existing.less_previous_certificates ?? 0);
    const lines: G703Line[] = Array.isArray(body.g703Lines)
      ? body.g703Lines
      : Array.isArray(existing.g703_lines)
      ? existing.g703_lines
      : [];

    const summary = calculateG702AndG703({
      lines,
      completedRetainagePercent: completedRetPct,
      storedRetainagePercent: storedRetPct,
      lessPreviousCertificates,
      isRetainageRelease,
    });

    const now = new Date().toISOString();
    const nextStatus = body.status ?? existing.status;

    const updates: Record<string, any> = {
      period_to: body.periodTo !== undefined ? body.periodTo : existing.period_to,
      completed_retainage_percent: completedRetPct,
      stored_retainage_percent: storedRetPct,
      is_retainage_release: isRetainageRelease,
      status: nextStatus,
      assigned_accountant:
        body.assignedAccountant !== undefined
          ? body.assignedAccountant || null
          : existing.assigned_accountant,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      original_contract_sum: summary.originalContractSum,
      net_change_orders: summary.netChangeOrders,
      contract_sum_to_date: summary.contractSumToDate,
      total_completed_and_stored: summary.totalCompletedAndStored,
      retainage_amount: summary.retainageAmount,
      total_earned_less_retainage: summary.totalEarnedLessRetainage,
      less_previous_certificates: summary.lessPreviousCertificates,
      current_payment_due: summary.currentPaymentDue,
      g703_lines: summary.lines,
      updated_at: now,
    };

    if (nextStatus === 'submitted' && !existing.submitted_at) {
      updates.submitted_at = now;
    }
    if (nextStatus === 'paid' && !existing.paid_at) {
      updates.paid_at = now;
    }

    const { data: updated, error } = await supabase
      .from('job_pay_applications')
      .update(updates)
      .eq('id', payAppId)
      .eq('job_id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ payApplication: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update pay application' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payAppId = request.nextUrl.searchParams.get('payAppId');
    if (!payAppId) {
      return NextResponse.json({ error: 'payAppId is required' }, { status: 400 });
    }
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from('job_pay_applications')
      .delete()
      .eq('id', payAppId)
      .eq('job_id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete pay application' },
      { status: 500 }
    );
  }
}
