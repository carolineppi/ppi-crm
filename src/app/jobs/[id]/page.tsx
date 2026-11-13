'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Phone,
  Mail,
  FileText,
  PackageCheck,
  FileDiff,
  CalendarClock,
  CheckCircle2,
  UserCheck,
  DollarSign,
  Send,
} from 'lucide-react';

export default function JobViewerPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;

  const [job, setJob] = useState<any>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [changeOrders, setChangeOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [materialEta, setMaterialEta] = useState('');
  const [siteAvailableRange, setSiteAvailableRange] = useState('');
  const [requestedInstallDate, setRequestedInstallDate] = useState('');
  const [installAvailabilityNotes, setInstallAvailabilityNotes] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState<string | null>(null);

  const loadJob = async () => {
    if (!jobId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setPurchaseOrders(data.purchaseOrders || []);
        setChangeOrders(data.changeOrders || []);
        setMaterialEta(data.job.material_eta || '');
        setSiteAvailableRange(data.job.site_available_range || '');
        setRequestedInstallDate(data.job.requested_install_date || '');
        setInstallAvailabilityNotes(data.job.install_availability_notes || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadJob();
  }, [jobId]);

  const handleSaveSchedule = async (requestInstall: boolean) => {
    if (!jobId) return;
    setIsSavingSchedule(true);
    setScheduleSavedMsg(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialEta: materialEta || null,
          siteAvailableRange: siteAvailableRange || null,
          requestedInstallDate: requestedInstallDate || null,
          installAvailabilityNotes: installAvailabilityNotes || null,
          installRequestStatus: requestInstall ? 'requested' : job?.install_request_status,
        }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJob(data.job);
        setScheduleSavedMsg(
          requestInstall
            ? 'Install scheduling request saved for the Installation Department!'
            : 'Material ETA & site availability notes saved.'
        );
      }
    } finally {
      setIsSavingSchedule(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-slate-500 text-sm">Loading job viewer...</div>;
  }

  if (!job) {
    return (
      <div className="p-12 text-center space-y-3">
        <p className="text-slate-600">Job not found.</p>
        <Link href="/pm" className="text-blue-700 font-bold underline text-sm">
          ← Back to PM Portal
        </Link>
      </div>
    );
  }

  const baseQuote = Number(job.quote_amount) || 0;
  const approvedAdditions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'addition')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const approvedDeductions = changeOrders
    .filter((c) => (c.status === 'approved' || c.status === 'billed') && c.type === 'deduction')
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const adjustedTotal = baseQuote + approvedAdditions - approvedDeductions;
  const totalPoSpend = purchaseOrders
    .filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + (Number(p.total_cost) || 0), 0);

  const lineItems = Array.isArray(job.line_items) ? job.line_items : [];
  const fullAddress = [
    job.address_street,
    [job.address_city, job.address_state].filter(Boolean).join(', '),
    job.address_zip,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Top Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-teal-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-xs text-teal-200">
            <Link href="/pm" className="hover:underline flex items-center gap-1 font-bold">
              <ArrowLeft className="w-3.5 h-3.5" /> PM Dashboard
            </Link>
            <span>•</span>
            <Link href="/jobs" className="hover:underline font-bold">
              All Jobs
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-200">
              {job.job_number || 'JOB'}
            </span>
            <span>{job.project_name}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/jobs/${job.id}/purchase-orders`}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Purchase Orders ({purchaseOrders.length})</span>
          </Link>
          <Link
            href={`/jobs/${job.id}/change-orders`}
            className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <FileDiff className="w-4 h-4" />
            <span>Change Orders ({changeOrders.length})</span>
          </Link>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Base Quote Amount</span>
          <div className="text-xl font-black text-slate-900 mt-1">
            ${baseQuote.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs bg-purple-50/30">
          <span className="text-[11px] font-bold text-purple-800 uppercase">Approved Change Orders</span>
          <div className="text-xl font-black text-purple-900 mt-1">
            {approvedAdditions - approvedDeductions >= 0 ? '+' : '-'}$
            {Math.abs(approvedAdditions - approvedDeductions).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase">Adjusted Contract Total</span>
          <div className="text-xl font-black text-emerald-900 mt-1 flex items-center gap-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            {adjustedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
          <span className="text-[11px] font-bold text-blue-800 uppercase">PO Material Spend</span>
          <div className="text-xl font-black text-blue-900 mt-1">
            ${totalPoSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Main 2-column Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: POC, Site Info & Install Scheduling */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
            <h2 className="text-sm font-black text-slate-900">Point of Contact &amp; Site</h2>
            <div className="space-y-2 text-slate-600">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="font-bold text-slate-900">{job.client_company || 'No Contractor'}</div>
                  {job.client_name && <div>POC: {job.client_name}</div>}
                </div>
              </div>
              {job.client_phone && (
                <a href={`tel:${job.client_phone}`} className="flex items-center gap-2 text-blue-700 font-semibold hover:underline">
                  <Phone className="w-4 h-4" /> {job.client_phone}
                </a>
              )}
              {job.client_email && (
                <a href={`mailto:${job.client_email}`} className="flex items-center gap-2 text-blue-700 font-semibold hover:underline">
                  <Mail className="w-4 h-4" /> {job.client_email}
                </a>
              )}
              <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <span>{fullAddress || 'Address not specified'}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>
                  PM: <strong>{job.project_manager || 'Unassigned'}</strong> • Estimator:{' '}
                  <strong>{job.estimator_name || 'N/A'}</strong>
                </span>
              </div>
              {job.scope_pdf_filename && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>Scope PDF: </span>
                  {job.scope_pdf_url ? (
                    <a href={job.scope_pdf_url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 hover:underline truncate">
                      {job.scope_pdf_filename}
                    </a>
                  ) : (
                    <strong>{job.scope_pdf_filename}</strong>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Install Department Coordination */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <CalendarClock className="w-4 h-4 text-blue-600" />
                <span>Install Dept. Scheduling</span>
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  job.install_request_status === 'scheduled'
                    ? 'bg-emerald-100 text-emerald-800'
                    : job.install_request_status === 'requested'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {job.install_request_status.replace('_', ' ')}
              </span>
            </div>

            {scheduleSavedMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{scheduleSavedMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Products Expected By (Material ETA)
              </label>
              <input
                type="date"
                value={materialEta}
                onChange={(e) => setMaterialEta(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Job Site Available Date Range
              </label>
              <input
                type="text"
                placeholder="e.g. 11/24 - 12/05"
                value={siteAvailableRange}
                onChange={(e) => setSiteAvailableRange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Requested Install Date (Install Dept Makes Final Call)
              </label>
              <input
                type="date"
                value={requestedInstallDate}
                onChange={(e) => setRequestedInstallDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Site Availability &amp; Access Notes
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Site only available Tue/Thu; GC requires 48hr notice..."
                value={installAvailabilityNotes}
                onChange={(e) => setInstallAvailabilityNotes(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={isSavingSchedule}
                onClick={() => handleSaveSchedule(false)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700"
              >
                Save Notes
              </button>
              <button
                type="button"
                disabled={isSavingSchedule}
                onClick={() => handleSaveSchedule(true)}
                className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Request Install</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 2 Columns: Scope Line Items + PO & CO Snapshots */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Job Scope Line Items ({lineItems.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Selected scope items transferred from the won bid.
                </p>
              </div>
              <Link
                href={`/jobs/${job.id}/purchase-orders`}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
              >
                + Order Items (PO)
              </Link>
            </div>

            {lineItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No line items recorded on this job yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Qty</th>
                      <th className="py-2.5 px-4">Manufacturer / SKU</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((li: any, idx: number) => (
                      <tr key={li.id || idx}>
                        <td className="py-2.5 px-4 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold">{li.quantity}</td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          {[li.manufacturer, li.sku].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-800">{li.description}</td>
                        <td className="py-2.5 px-4 text-right font-semibold">
                          {li.unitPrice !== undefined && li.unitPrice !== null
                            ? `$${Number(li.unitPrice).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick PO & CO Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <PackageCheck className="w-4 h-4 text-blue-600" />
                  <span>Purchase Orders ({purchaseOrders.length})</span>
                </h3>
                <Link href={`/jobs/${job.id}/purchase-orders`} className="text-xs font-bold text-blue-700 hover:underline">
                  Manage POs →
                </Link>
              </div>
              {purchaseOrders.length === 0 ? (
                <p className="text-xs text-slate-400">No purchase orders created yet.</p>
              ) : (
                <div className="space-y-2">
                  {purchaseOrders.slice(0, 4).map((po) => (
                    <div key={po.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {po.po_number} • {po.vendor}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Status: <strong className="uppercase">{po.status}</strong>
                          {po.expected_delivery_date ? ` • ETA ${po.expected_delivery_date}` : ''}
                        </div>
                      </div>
                      <div className="font-bold text-slate-900">
                        ${Number(po.total_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <FileDiff className="w-4 h-4 text-purple-600" />
                  <span>Change Orders ({changeOrders.length})</span>
                </h3>
                <Link href={`/jobs/${job.id}/change-orders`} className="text-xs font-bold text-purple-700 hover:underline">
                  Manage COs →
                </Link>
              </div>
              {changeOrders.length === 0 ? (
                <p className="text-xs text-slate-400">No change orders recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {changeOrders.slice(0, 4).map((co) => (
                    <div key={co.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {co.co_number} • {co.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {co.type === 'deduction' ? 'Refund / Credit' : 'Extra Work'} •{' '}
                          <strong className="uppercase">{co.status}</strong>
                        </div>
                      </div>
                      <div
                        className={`font-bold ${
                          co.type === 'deduction' ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {co.type === 'deduction' ? '-' : '+'}$
                        {Number(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
