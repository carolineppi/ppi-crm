'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  FileDiff,
  Trash2,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
} from 'lucide-react';

export default function JobChangeOrdersPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<any>(null);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [coNumber, setCoNumber] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'addition' | 'deduction'>('addition');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('pending');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        const cos = data.changeOrders || [];
        setChangeOrders(cos);
        const prefix = data.job.job_number || 'JOB';
        setCoNumber(`${prefix}-CO-${String(cos.length + 1).padStart(2, '0')}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [jobId]);

  const handleCreateCO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId || !title.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/change-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coNumber,
          title,
          type,
          amount: Number(amount) || 0,
          status,
          reason: reason || null,
          requestedBy: job?.project_manager || 'PM',
        }),
      });
      if (res.ok) {
        setTitle('');
        setAmount('');
        setReason('');
        await loadData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCoStatus = async (coId: string, newStatus: string) => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}/change-orders`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coId, status: newStatus, approvedBy: job?.project_manager || 'PM' }),
    });
    if (res.ok) {
      await loadData();
    }
  };

  const handleDeleteCo = async (coId: string) => {
    if (!jobId) return;
    const res = await fetch(`/api/jobs/${jobId}/change-orders?coId=${encodeURIComponent(coId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setChangeOrders((prev) => prev.filter((c) => c.id !== coId));
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading change orders...</div>;
  }

  const baseQuote = Number(job?.quote_amount) || 0;
  const approvedAdditions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'addition')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const approvedDeductions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'deduction')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const adjustedTotal = baseQuote + approvedAdditions - approvedDeductions;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-purple-200">
            <Link href={`/jobs/${jobId}`} className="hover:underline flex items-center gap-1 font-bold">
              <ArrowLeft className="w-3.5 h-3.5" /> Job Viewer
            </Link>
            <span>•</span>
            <Link href="/pm" className="hover:underline font-bold">
              PM Dashboard
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <FileDiff className="w-6 h-6 text-purple-300" />
            <span>Change Orders — {job?.job_number} {job?.project_name}</span>
          </h1>
        </div>

        <Link
          href={`/jobs/${jobId}/purchase-orders`}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
        >
          Go to Purchase Orders →
        </Link>
      </div>

      {/* Contract Impact Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Base Contract</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            ${baseQuote.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Approved Additions (+)</span>
          <div className="text-xl font-black text-emerald-900 mt-1">
            +${approvedAdditions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-rose-200 shadow-2xs bg-rose-50/30">
          <span className="text-[11px] font-bold text-rose-800 uppercase">Approved Refunds / Credits (-)</span>
          <div className="text-xl font-black text-rose-900 mt-1">
            -${approvedDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs bg-purple-50/30">
          <span className="text-[11px] font-bold text-purple-800 uppercase">Adjusted Contract Total</span>
          <div className="text-xl font-black text-purple-900 mt-1">
            ${adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Create CO Form */}
      <form onSubmit={handleCreateCO} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 text-xs">
        <h2 className="text-sm font-black text-slate-900">Create Change Order</h2>

        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">CO Number</label>
            <input
              type="text"
              required
              value={coNumber}
              onChange={(e) => setCoNumber(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Change Order Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Add 2 Grab Bars in Restroom B"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'addition' | 'deduction')}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
            >
              <option value="addition">+ Extra Charge (Extra Work)</option>
              <option value="deduction">- Refund / Credit (Uncompleted)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold"
            >
              <option value="pending">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="billed">Billed / Credited</option>
            </select>
          </div>
        </div>

        <textarea
          rows={2}
          placeholder="Reason / field notes for this change order..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
        />

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'Saving...' : 'Create Change Order'}</span>
          </button>
        </div>
      </form>

      {/* Change Orders List */}
      <div className="space-y-3">
        <h2 className="text-sm font-black text-slate-900">Change Orders ({changeOrders.length})</h2>
        {changeOrders.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
            No change orders recorded for this job yet.
          </div>
        ) : (
          changeOrders.map((co) => (
            <div key={co.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200">
                    {co.co_number}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      co.type === 'deduction'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {co.type === 'deduction' ? (
                      <MinusCircle className="w-3 h-3" />
                    ) : (
                      <PlusCircle className="w-3 h-3" />
                    )}
                    {co.type === 'deduction' ? 'Refund / Credit' : 'Extra Work'}
                  </span>
                  <span className="text-sm font-black text-slate-900">{co.title}</span>
                  <span
                    className={`font-extrabold ${
                      co.type === 'deduction' ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {co.type === 'deduction' ? '-' : '+'}$
                    {Number(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {co.reason && <p className="text-slate-600">{co.reason}</p>}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={co.status}
                  onChange={(e) => handleUpdateCoStatus(co.id, e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-slate-50"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="billed">Billed / Credited</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleDeleteCo(co.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                  title="Delete CO"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
