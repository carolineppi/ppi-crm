import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { deriveJobWarehouseStatus } from '@/lib/warehouse/helpers';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const poId: string | null = body.poId || null;
    const jobId: string | null = body.jobId || null;
    const receivedBy = body.receivedBy ? String(body.receivedBy).trim() : null;
    const packingSlipNumber = body.packingSlipNumber
      ? String(body.packingSlipNumber).trim()
      : null;
    const carrier = body.carrier ? String(body.carrier).trim() : null;
    const stagingLocation = body.stagingLocation
      ? String(body.stagingLocation).trim()
      : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    const itemsReceived = Array.isArray(body.itemsReceived) ? body.itemsReceived : [];
    const markFullReceived = Boolean(body.markFullReceived);

    const hasDiscrepancy =
      Boolean(body.hasDiscrepancy) ||
      itemsReceived.some(
        (it: any) =>
          (Number(it.qtyDamaged) || 0) > 0 ||
          (Number(it.qtyOrdered) || 0) > (Number(it.qtyReceived) || 0) ||
          it.condition === 'damaged' ||
          it.condition === 'short'
      );

    let resolvedJobId = jobId;
    let updatedPo: any = null;

    if (poId) {
      const { data: po, error: poErr } = await supabase
        .from('job_purchase_orders')
        .select('*')
        .eq('id', poId)
        .single();

      if (poErr || !po) {
        return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
      }
      resolvedJobId = po.job_id;

      // Merge cumulative received quantities onto PO items
      const existingItems = Array.isArray(po.items) ? po.items : [];
      const updatedItems = existingItems.map((item: any, idx: number) => {
        const match =
          itemsReceived.find((r: any) => r.index === idx) ||
          itemsReceived[idx];
        if (!match) return item;
        const prevReceived = Number(item.qtyReceived) || 0;
        const addReceived = Number(match.qtyReceived) || 0;
        const prevDamaged = Number(item.qtyDamaged) || 0;
        const addDamaged = Number(match.qtyDamaged) || 0;
        return {
          ...item,
          qtyReceived: prevReceived + addReceived,
          qtyDamaged: prevDamaged + addDamaged,
          lastCondition: match.condition || 'good',
        };
      });

      const allItemsSatisfied =
        markFullReceived ||
        (updatedItems.length > 0 &&
          updatedItems.every(
            (it: any) => (Number(it.qtyReceived) || 0) >= (Number(it.quantity) || 0)
          ));

      const newPoStatus =
        allItemsSatisfied && !hasDiscrepancy
          ? 'received'
          : allItemsSatisfied
          ? 'received'
          : 'partial';

      const { data: savedPo, error: updatePoErr } = await supabase
        .from('job_purchase_orders')
        .update({
          status: newPoStatus,
          actual_delivery_date: new Date().toISOString().slice(0, 10),
          warehouse_location: stagingLocation || po.warehouse_location || null,
          packing_slip_number: packingSlipNumber || po.packing_slip_number || null,
          received_by: receivedBy || po.received_by || null,
          has_damage_or_shortage: hasDiscrepancy,
          items: updatedItems,
          updated_at: new Date().toISOString(),
        })
        .eq('id', poId)
        .select()
        .single();

      if (updatePoErr) {
        return NextResponse.json({ error: updatePoErr.message }, { status: 500 });
      }
      updatedPo = savedPo;
    }

    const receiptNumber = `RCV-${Date.now().toString().slice(-6)}`;
    const { data: receipt, error: rcvErr } = await supabase
      .from('warehouse_receipts')
      .insert({
        po_id: poId,
        job_id: resolvedJobId,
        receipt_number: receiptNumber,
        received_by: receivedBy,
        packing_slip_number: packingSlipNumber,
        carrier,
        staging_location: stagingLocation,
        items_received: itemsReceived,
        has_discrepancy: hasDiscrepancy,
        notes,
      })
      .select()
      .single();

    if (rcvErr) {
      return NextResponse.json({ error: rcvErr.message }, { status: 500 });
    }

    // Recompute job warehouse_status
    let updatedJob: any = null;
    if (resolvedJobId) {
      const [jobRes, allPosRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, warehouse_status, warehouse_location')
          .eq('id', resolvedJobId)
          .single(),
        supabase
          .from('job_purchase_orders')
          .select('id, status, has_damage_or_shortage')
          .eq('job_id', resolvedJobId),
      ]);

      if (jobRes.data) {
        const nextStatus = deriveJobWarehouseStatus(
          allPosRes.data || [],
          jobRes.data.warehouse_status
        );
        const jobUpdates: Record<string, any> = {
          warehouse_status: nextStatus,
          warehouse_location: stagingLocation || jobRes.data.warehouse_location || null,
        };
        if (nextStatus === 'staged_ready') {
          jobUpdates.material_staged_at = new Date().toISOString();
        }
        const { data: savedJob } = await supabase
          .from('jobs')
          .update(jobUpdates)
          .eq('id', resolvedJobId)
          .select()
          .single();
        updatedJob = savedJob;
      }
    }

    return NextResponse.json({
      receipt,
      purchaseOrder: updatedPo,
      job: updatedJob,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to log warehouse receipt' },
      { status: 500 }
    );
  }
}
