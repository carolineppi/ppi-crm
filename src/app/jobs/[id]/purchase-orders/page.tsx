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
} from 'lucide-react';

interface POItem {
  manufacturer?: string;
  sku?: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export default function JobPurchaseOrdersPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<any>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [poNumber, setPoNumber] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('ordered');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        const prefix = data.job.job_number || 'JOB';
        setPoNumber(`${prefix}-PO-${String(pos.length + 1).padStart(2, '0')}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [jobId]);

  const loadFromJobScope = (filterVendor?: string) => {
    const scopeItems = Array.isArray(job?.line_items) ? job.line_items : [];
    const filtered = filterVendor
      ? scopeItems.filter((it: any) =>
          `${it.manufacturer || ''} ${it.sku || ''}`
            .toLowerCase()
            .includes(filterVendor.toLowerCase())
        )
      : scopeItems;
    setItems(
      filtered.map((it: any) => ({
        manufacturer: it.manufacturer || '',
        sku: it.sku || '',
        description: it.description || '',
        quantity: Math.max(1, Number(it.quantity) || 1),
        unitCost: Number(it.unitPrice) || 0,
      }))
    );
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !vendor.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber,
          vendor,
          status,
          orderDate: orderDate || null,
          expectedDeliveryDate: expectedDeliveryDate || null,
          trackingNumber: trackingNumber || null,
          notes: notes || null,
          items,
          createdBy: job?.project_manager || 'PM',
        }),
      });
      if (res.ok) {
        setVendor('');
        setExpectedDeliveryDate('');
        setTrackingNumber('');
        setNotes('');
        setItems([]);
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

      {/* Create PO Form */}
      <form onSubmit={handleCreatePO} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black text-slate-900">Create New Purchase Order</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadFromJobScope()}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
            >
              Load All Scope Items ({Array.isArray(job?.line_items) ? job.line_items.length : 0})
            </button>
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
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Vendor / Manufacturer</label>
            <input
              type="text"
              required
              placeholder="e.g. Bobrick, Bradley, ASI..."
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
            />
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
            <span className="text-[10px] font-bold uppercase text-slate-600">PO Line Items ({items.length})</span>
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
                    className="col-span-3 px-2 py-1 rounded border border-slate-300 font-mono"
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
                    className="col-span-5 px-2 py-1 rounded border border-slate-300"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit $"
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

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating PO...' : 'Create Purchase Order'}</span>
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
    </div>
  );
}
