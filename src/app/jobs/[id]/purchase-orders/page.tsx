'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  PackageCheck,
  Plus,
  Trash2,
  CheckCircle2,
  Truck,
  Pencil,
  X,
  Printer,
} from 'lucide-react';
import { getJobLineItemsOrderStatus } from '@/lib/jobs/lineItemOrderStatus';
import { getSubmittalSummary } from '@/lib/jobs/submittals';
import PurchaseOrderPrintModal from '@/components/PurchaseOrderPrintModal';

interface POItem {
  sourceLineItemId?: string | null;
  sourceLineNumber?: number | null;
  sourceChangeOrderId?: string | null;
  manufacturer?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCost: number;
  estimatedUnitCost?: number | null;
}

export default function JobPurchaseOrdersPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<any>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [poNumber, setPoNumber] = useState('');
  const [vendor, setVendor] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [status, setStatus] = useState('ordered');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPoId, setEditingPoId] = useState<string | null>(null);
  const [printingPo, setPrintingPo] = useState<any | null>(null);

  const loadData = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        const pos = data.purchaseOrders || [];
        setPurchaseOrders(pos);
        setChangeOrders(data.changeOrders || []);
        const prefix = data.job.job_number || 'JOB';
        setPoNumber(`${prefix}-PO-${String(pos.length + 1).padStart(2, '0')}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.suppliers)) setSuppliersList(d.suppliers);
      })
      .catch(() => {});
  }, [jobId]);

  const orderStatusSummary = getJobLineItemsOrderStatus(job?.line_items, purchaseOrders);
  const unorderedCount = orderStatusSummary.byIndex.filter((s) => s.status !== 'ordered').length;
  const draftPoTotal = items.reduce(
    (sum, it) => sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0),
    0
  );
  const positiveCOs = changeOrders.filter(
    (c) => c.type === 'addition' && c.status !== 'rejected'
  );
  const draftEstTotal = items.reduce(
    (sum, it) =>
      sum +
      (it.estimatedUnitCost !== null && it.estimatedUnitCost !== undefined
        ? Number(it.estimatedUnitCost) || 0
        : Number(it.unitCost) || 0) *
        (Number(it.quantity) || 0),
    0
  );

  const loadPositiveChangeOrders = () => {
    if (positiveCOs.length === 0) return;
    setItems((prev) => {
      const existingCoIds = new Set(prev.map((p) => p.sourceChangeOrderId).filter(Boolean));
      const toAdd: POItem[] = [];
      for (const co of positiveCOs) {
        if (existingCoIds.has(co.id)) continue;
        const amt = Number(co.amount) || 0;
        toAdd.push({
          sourceChangeOrderId: co.id,
          manufacturer: 'Change Order',
          sku: co.co_number || 'CO',
          description: co.title || 'Change Order Addition',
          quantity: 1,
          unitCost: amt,
          estimatedUnitCost: amt,
        });
      }
      return [...prev, ...toAdd];
    });
  };

  const loadFromJobScope = (filterVendor?: string, onlyUnordered = false) => {
    const scopeItems = Array.isArray(job?.line_items) ? job.line_items : [];
    const allZeroPrices =
      scopeItems.length > 0 && scopeItems.every((it: any) => !(Number(it.unitPrice) > 0));
    const totalScopeQty = scopeItems.reduce(
      (s: number, it: any) => s + Math.max(1, Number(it.quantity) || 1),
      0
    );
    const fallbackUnitCost =
      allZeroPrices && Number(job?.quote_amount) > 0 && totalScopeQty > 0
        ? Math.round((Number(job.quote_amount) / totalScopeQty) * 100) / 100
        : 0;

    const indexed: Array<{ it: any; origIdx: number }> = scopeItems
      .map((it: any, origIdx: number) => ({ it, origIdx }))
      .filter(({ it }: { it: any; origIdx: number }) => !it?.isAddon || it?.addonStatus === 'approved');
    const vendorFiltered = filterVendor
      ? indexed.filter(({ it }) =>
          `${it.manufacturer || ''} ${it.sku || ''}`
            .toLowerCase()
            .includes(filterVendor.toLowerCase())
        )
      : indexed;
    const finalItems = onlyUnordered
      ? vendorFiltered.filter(
          ({ origIdx }) => orderStatusSummary.byIndex[origIdx]?.status !== 'ordered'
        )
      : vendorFiltered;

    setItems(
      finalItems.map(({ it, origIdx }) => {
        const statusInfo = orderStatusSummary.byIndex[origIdx];
        const baseQty = Math.max(1, Number(it.quantity) || 1);
        const qty =
          onlyUnordered && statusInfo?.status === 'partial'
            ? Math.max(1, baseQty - statusInfo.orderedQty)
            : baseQty;
        const rawUnitPrice = Number(it.unitPrice) || 0;
        const estPrice = rawUnitPrice > 0 ? rawUnitPrice : fallbackUnitCost;
        return {
          sourceLineItemId: it.id || null,
          sourceLineNumber: it.lineNumber || origIdx + 1,
          manufacturer: it.manufacturer || '',
          sku: it.sku || '',
          description: it.description || '',
          quantity: qty,
          unitCost: estPrice,
          estimatedUnitCost: estPrice,
        };
      })
    );
  };

  const resetForm = () => {
    setEditingPoId(null);
    setVendor('');
    setSupplierId(null);
    setStatus('ordered');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDeliveryDate('');
    setTrackingNumber('');
    setNotes('');
    setItems([]);
  };

  const startEditingPo = (po: any) => {
    setEditingPoId(po.id);
    setPoNumber(po.po_number || '');
    setVendor(po.vendor || '');
    setSupplierId(po.supplier_id || null);
    setStatus(po.status || 'ordered');
    setOrderDate(po.order_date || '');
    setExpectedDeliveryDate(po.expected_delivery_date || '');
    setTrackingNumber(po.tracking_number || '');
    setNotes(po.notes || '');
    setItems(
      Array.isArray(po.items)
        ? po.items.map((it: any) => ({
            sourceLineItemId: it.sourceLineItemId ?? null,
            sourceLineNumber: it.sourceLineNumber ?? null,
            sourceChangeOrderId: it.sourceChangeOrderId ?? null,
            manufacturer: it.manufacturer || '',
            sku: it.sku || '',
            description: it.description || '',
            quantity: Math.max(1, Number(it.quantity) || 1),
            unitCost: Number(it.unitCost) || 0,
            estimatedUnitCost:
              it.estimatedUnitCost !== undefined && it.estimatedUnitCost !== null
                ? Number(it.estimatedUnitCost)
                : null,
          }))
        : []
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !vendor.trim()) return;
    setIsSubmitting(true);
    try {
      const isEditing = Boolean(editingPoId);
      const res = await fetch(`/api/jobs/${jobId}/purchase-orders`, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEditing ? { poId: editingPoId } : {}),
          poNumber,
          vendor,
          supplierId,
          status,
          orderDate: orderDate || null,
          expectedDeliveryDate: expectedDeliveryDate || null,
          trackingNumber: trackingNumber || null,
          notes: notes || null,
          items,
          ...(isEditing ? {} : { createdBy: job?.project_manager || 'PM' }),
        }),
      });
      if (res.ok) {
        resetForm();
        await loadData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePoStatus = async (poId: string, newStatus: string) => {
    if (!jobId) return;
    const body: any = { poId, status: newStatus };
    if (newStatus === 'received') {
      body.actualDeliveryDate = new Date().toISOString().slice(0, 10);
    }
    const res = await fetch(`/api/jobs/${jobId}/purchase-orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await loadData();
    }
  };

  const handleDeletePo = async (poId: string) => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}/purchase-orders?poId=${encodeURIComponent(poId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setPurchaseOrders((prev) => prev.filter((p) => p.id !== poId));
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading purchase orders...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-blue-200">
            <Link href={`/jobs/${jobId}`} className="hover:underline flex items-center gap-1 font-bold">
              <ArrowLeft className="w-3.5 h-3.5" /> Job Viewer
            </Link>
            <span>•</span>
            <Link href="/pm" className="hover:underline font-bold">
              PM Dashboard
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <PackageCheck className="w-6 h-6 text-blue-300" />
            <span>Purchase Orders — {job?.job_number} {job?.project_name}</span>
          </h1>
        </div>

        <Link
          href={`/jobs/${jobId}/change-orders`}
          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
        >
          Go to Change Orders →
        </Link>
      </div>

      {/* Submittal Gate Notice */}
      {(() => {
        const subSummary = getSubmittalSummary(job?.submittals);
        if (subSummary.unapprovedList.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>Submittal Approval Notice:</strong> {subSummary.unapprovedList.length}{' '}
              submittal{subSummary.unapprovedList.length === 1 ? ' is' : 's are'} not yet approved (
              {subSummary.unapprovedList
                .slice(0, 2)
                .map((s) => `${s.submittalNumber}: ${s.title}`)
                .join(', ')}
              ). Verify approval before releasing custom material POs.
            </div>
            <Link
              href={`/jobs/${jobId}#submittals`}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold shrink-0"
            >
              View Submittals →
            </Link>
          </div>
        );
      })()}

      {/* Create PO Form */}
      <form onSubmit={handleCreatePO} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-slate-900">
              {editingPoId ? `Edit Purchase Order (${poNumber})` : 'Create New Purchase Order'}
            </h2>
            {editingPoId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Cancel Edit
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadFromJobScope(undefined, true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold"
            >
              Load Unordered Items ({unorderedCount})
            </button>
            <button
              type="button"
              onClick={() => loadFromJobScope()}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
            >
              Load All Scope Items ({Array.isArray(job?.line_items) ? job.line_items.length : 0})
            </button>
            {positiveCOs.length > 0 && (
              <button
                type="button"
                onClick={loadPositiveChangeOrders}
                className="px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold"
              >
                + Add Positive COs ({positiveCOs.length})
              </button>
            )}
            {vendor.trim() && (
              <button
                type="button"
                onClick={() => loadFromJobScope(vendor)}
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold"
              >
                Load &ldquo;{vendor}&rdquo; Scope Items
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">PO Number</label>
            <input
              type="text"
              required
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Vendor / Manufacturer (Supplier Directory)
            </label>
            <input
              type="text"
              required
              list="suppliers-master-list"
              placeholder="Search 260+ suppliers (e.g. Bobrick, ASI, Scranton)..."
              value={vendor}
              onChange={(e) => {
                const val = e.target.value;
                setVendor(val);
                const match = suppliersList.find(
                  (s) => s.name.toLowerCase() === val.trim().toLowerCase()
                );
                setSupplierId(match ? match.id : null);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
            />
            <datalist id="suppliers-master-list">
              {suppliersList.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
            {supplierId && (() => {
              const s = suppliersList.find((x) => x.id === supplierId);
              if (!s) return null;
              return (
                <div className="text-[10px] text-emerald-700 font-semibold mt-1 truncate">
                  ✓ Master Supplier{s.representative ? ` • Rep: ${s.representative}` : ''}
                  {s.representative_phone ? ` (${s.representative_phone})` : ''}
                </div>
              );
            })()}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
            >
              <option value="draft">Draft</option>
              <option value="ordered">Ordered</option>
              <option value="partial">Partial Delivery</option>
              <option value="received">Received</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Order Date</label>
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Expected Delivery</label>
            <input
              type="date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
            />
          </div>
        </div>

        {/* PO Items */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-slate-600">
              PO Line Items ({items.length}) • PO Total: $
              {draftPoTotal.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
              {items.some((it) => it.estimatedUnitCost !== null && it.estimatedUnitCost !== undefined) && (
                <span className="ml-2 text-slate-500">
                  (Est. Total: $
                  {draftEstTotal.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  {draftPoTotal !== draftEstTotal && (
                    <span
                      className={`ml-1 font-extrabold ${
                        draftPoTotal <= draftEstTotal ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {draftPoTotal > draftEstTotal ? '+' : '-'}$
                      {Math.abs(draftPoTotal - draftEstTotal).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                  )
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() =>
                setItems((prev) => [
                  ...prev,
                  { manufacturer: vendor, sku: '', description: '', quantity: 1, unitCost: 0 },
                ])
              }
              className="text-blue-700 font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
          </div>
          {items.length === 0 ? (
            <div className="p-4 text-center text-slate-400">
              Click <strong>Load All Scope Items</strong> or <strong>Add Item</strong> to build this Purchase Order.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {items.map((it, idx) => (
                <div key={idx} className="p-2 grid grid-cols-12 gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, quantity: Math.max(1, Number(e.target.value) || 1) } : row
                        )
                      )
                    }
                    className="col-span-1 px-1.5 py-1 rounded border border-slate-300 text-center font-bold"
                  />
                  <input
                    type="text"
                    placeholder="SKU"
                    value={it.sku || ''}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, sku: e.target.value } : row))
                      )
                    }
                    className="col-span-2 px-2 py-1 rounded border border-slate-300 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                      )
                    }
                    className="col-span-4 px-2 py-1 rounded border border-slate-300"
                  />
                  <div
                    className="col-span-2 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-right text-[11px] font-mono text-slate-600"
                    title="Unalterable Estimate Unit Price"
                  >
                    {it.estimatedUnitCost !== null && it.estimatedUnitCost !== undefined
                      ? `Est: $${Number(it.estimatedUnitCost).toFixed(2)}`
                      : 'Est: —'}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Actual $"
                    title="Actual PO Unit Cost"
                    value={it.unitCost}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, unitCost: Number(e.target.value) || 0 } : row
                        )
                      )
                    }
                    className="col-span-2 px-2 py-1 rounded border border-slate-300 text-right font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 flex justify-center text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Tracking # (optional)"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300"
          />
          <input
            type="text"
            placeholder="PO notes / shipping instructions..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300"
          />
        </div>

        <div className="flex justify-end gap-2">
          {editingPoId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {isSubmitting
                ? editingPoId
                  ? 'Saving PO...'
                  : 'Creating PO...'
                : editingPoId
                ? 'Save PO Changes'
                : 'Create Purchase Order'}
            </span>
          </button>
        </div>
      </form>

      {/* Existing POs List */}
      <div className="space-y-3">
        <h2 className="text-sm font-black text-slate-900">Job Purchase Orders ({purchaseOrders.length})</h2>
        {purchaseOrders.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
            No purchase orders created for this job yet.
          </div>
        ) : (
          purchaseOrders.map((po) => {
            const poItems = Array.isArray(po.items) ? po.items : [];
            return (
              <div key={po.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {po.po_number}
                      </span>
                      <span className="text-sm font-black text-slate-900">{po.vendor}</span>
                      <span className="font-bold text-slate-700">
                        • ${Number(po.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-3">
                      {po.order_date && <span>Ordered: {po.order_date}</span>}
                      {po.expected_delivery_date && (
                        <span className="flex items-center gap-1 text-blue-700 font-semibold">
                          <Truck className="w-3 h-3" /> ETA: {po.expected_delivery_date}
                        </span>
                      )}
                      {po.actual_delivery_date && (
                        <span className="text-emerald-700 font-semibold">
                          Received: {po.actual_delivery_date}
                        </span>
                      )}
                      {po.tracking_number && <span>Tracking: {po.tracking_number}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={po.status}
                      onChange={(e) => handleUpdatePoStatus(po.id, e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-slate-50"
                    >
                      <option value="draft">Draft</option>
                      <option value="ordered">Ordered</option>
                      <option value="partial">Partial</option>
                      <option value="received">Received</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setPrintingPo(po)}
                      className="p-1.5 text-slate-500 hover:text-slate-900"
                      title="Print / Save PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditingPo(po)}
                      className="p-1.5 text-slate-500 hover:text-blue-700"
                      title="Edit PO"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePo(po.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                      title="Delete PO"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {poItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    <div className="divide-y divide-slate-200 bg-white">
                      {poItems.map((it: any, i: number) => (
                        <div key={i} className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px]">
                          <span>
                            <strong>{it.quantity}x</strong> {it.sku ? `[${it.sku}] ` : ''}
                            {it.description}
                          </span>
                          <span className="font-semibold">
                            {it.estimatedUnitCost !== null &&
                              it.estimatedUnitCost !== undefined &&
                              Number(it.estimatedUnitCost) !== Number(it.unitCost) && (
                                <span className="text-[10px] text-slate-400 mr-2">
                                  (Est: $
                                  {(
                                    Number(it.estimatedUnitCost) * Number(it.quantity || 1)
                                  ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  )
                                </span>
                              )}
                            ${(Number(it.unitCost || 0) * Number(it.quantity || 1)).toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {po.notes && <div className="text-[11px] text-slate-600">Notes: {po.notes}</div>}
              </div>
            );
          })
        )}
      </div>

      <PurchaseOrderPrintModal
        isOpen={Boolean(printingPo)}
        onClose={() => setPrintingPo(null)}
        job={job}
        po={printingPo}
        supplier={suppliersList.find(
          (s) =>
            (printingPo?.supplier_id && s.id === printingPo.supplier_id) ||
            (printingPo?.vendor && s.name.toLowerCase() === String(printingPo.vendor).toLowerCase())
        )}
      />
    </div>
  );
}
