'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  FileSpreadsheet,
  AlertTriangle,
  Plus,
  Printer,
  Download,
  RefreshCw,
  Save,
  Trash2,
  CheckCircle2,
  Briefcase,
} from 'lucide-react';
import AIAG702PrintModal from '@/components/AIAG702PrintModal';
import {
  ACCOUNTANT_NAMES,
  G703Line,
  calculateG702AndG703,
  round2,
} from '@/lib/accounting/aia-helpers';

function fmt(n: number | null | undefined) {
  return `$${(Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AccountingPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [openCoAlerts, setOpenCoAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [accountantFilter, setAccountantFilter] = useState('ALL');

  // Selected job & pay app workspace
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [sovItems, setSovItems] = useState<any[]>([]);
  const [jobPayApps, setJobPayApps] = useState<any[]>([]);
  const [activePayApp, setActivePayApp] = useState<any | null>(null);
  const [g703Lines, setG703Lines] = useState<G703Line[]>([]);
  const [completedRetPct, setCompletedRetPct] = useState('10');
  const [storedRetPct, setStoredRetPct] = useState('10');
  const [isRetainageRelease, setIsRetainageRelease] = useState(false);
  const [periodTo, setPeriodTo] = useState(new Date().toISOString().slice(0, 10));
  const [assignedAccountant, setAssignedAccountant] = useState('');
  const [payAppNotes, setPayAppNotes] = useState('');

  // Add SOV row inline
  const [newSovDesc, setNewSovDesc] = useState('');
  const [newSovVal, setNewSovVal] = useState('');
  // Add Pay App G703 line item inline
  const [newPayLineNum, setNewPayLineNum] = useState('');
  const [newPayLineDesc, setNewPayLineDesc] = useState('');
  const [newPayLineScheduled, setNewPayLineScheduled] = useState('');
  const [newPayLineSource, setNewPayLineSource] = useState<'contract' | 'change_order'>('contract');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const fetchAccounting = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (accountantFilter !== 'ALL') params.set('accountant', accountantFilter);
      const res = await fetch(`/api/accounting?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setQueue(data.queue || []);
        setJobs(data.jobs || []);
        setOpenCoAlerts(data.openCoAlerts || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, accountantFilter]);

  useEffect(() => {
    fetchAccounting();
  }, [fetchAccounting]);

  const loadJobWorkspace = async (jobId: string, openPayAppId?: string) => {
    setSelectedJobId(jobId);
    if (!jobId) return;
    const [sovRes, appsRes] = await Promise.all([
      fetch(`/api/jobs/${jobId}/sov`),
      fetch(`/api/jobs/${jobId}/pay-applications`),
    ]);
    const [sovData, appsData] = await Promise.all([sovRes.json(), appsRes.json()]);
    setSovItems(sovData.sovItems || []);
    const apps = appsData.payApplications || [];
    setJobPayApps(apps);

    const target = openPayAppId
      ? apps.find((a: any) => a.id === openPayAppId) || apps[0] || null
      : apps[0] || null;
    selectPayAppForEditing(target);
  };

  const selectPayAppForEditing = (app: any | null) => {
    setActivePayApp(app);
    if (!app) {
      setG703Lines([]);
      return;
    }
    setG703Lines(Array.isArray(app.g703_lines) ? app.g703_lines : []);
    setCompletedRetPct(String(app.completed_retainage_percent ?? 10));
    setStoredRetPct(String(app.stored_retainage_percent ?? 10));
    setIsRetainageRelease(Boolean(app.is_retainage_release));
    setPeriodTo(app.period_to || new Date().toISOString().slice(0, 10));
    setAssignedAccountant(app.assigned_accountant || '');
    setPayAppNotes(app.notes || '');
  };

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  const liveSummary = useMemo(() => {
    if (!activePayApp) return null;
    return calculateG702AndG703({
      lines: g703Lines,
      completedRetainagePercent: Number(completedRetPct) || 0,
      storedRetainagePercent: Number(storedRetPct) || 0,
      lessPreviousCertificates: Number(activePayApp.less_previous_certificates) || 0,
      isRetainageRelease,
    });
  }, [activePayApp, g703Lines, completedRetPct, storedRetPct, isRetainageRelease]);

  const handleImportSovFromQuote = async () => {
    if (!selectedJobId) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/sov`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_from_quote' }),
      });
      const data = await res.json();
      if (res.ok) {
        setSovItems(data.sovItems || []);
        setStatusMsg('Imported Schedule of Values from Quote Cart / Job Scope & synced approved COs.');
        await fetchAccounting();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddSovRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !newSovDesc.trim()) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/sov`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newSovDesc.trim(),
          scheduledValue: Number(newSovVal) || 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSovItems(data.sovItems || []);
        setNewSovDesc('');
        setNewSovVal('');
        await fetchAccounting();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteSovRow = async (itemId: string) => {
    if (!selectedJobId) return;
    await fetch(`/api/jobs/${selectedJobId}/sov?itemId=${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
    await loadJobWorkspace(selectedJobId, activePayApp?.id);
    await fetchAccounting();
  };

  const handleCreatePayApp = async (releaseRetainage = false) => {
    if (!selectedJobId) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/pay-applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'draft',
          isRetainageRelease: releaseRetainage,
          assignedAccountant: assignedAccountant || selectedJob?.assigned_accountant || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.payApplication) {
        setStatusMsg(`Created Pay Application #${data.payApplication.application_number}.`);
        await loadJobWorkspace(selectedJobId, data.payApplication.id);
        await fetchAccounting();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSavePayApp = async (nextStatus?: string) => {
    if (!selectedJobId || !activePayApp) return;
    setIsBusy(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJobId}/pay-applications`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payAppId: activePayApp.id,
          periodTo,
          completedRetainagePercent: Number(completedRetPct) || 0,
          storedRetainagePercent: Number(storedRetPct) || 0,
          isRetainageRelease,
          assignedAccountant: assignedAccountant || null,
          notes: payAppNotes,
          g703Lines,
          status: nextStatus || activePayApp.status,
        }),
      });
      const data = await res.json();
      if (res.ok && data.payApplication) {
        setStatusMsg(
          `Saved Pay App #${data.payApplication.application_number}${
            nextStatus ? ` (${nextStatus})` : ''
          }.`
        );
        await loadJobWorkspace(selectedJobId, data.payApplication.id);
        await fetchAccounting();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeletePayApp = async (payAppId: string, appNumber: number | string) => {
    if (!selectedJobId) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete Pay Application #${appNumber}? This cannot be undone.`)
    ) {
      return;
    }
    setIsBusy(true);
    try {
      const res = await fetch(
        `/api/jobs/${selectedJobId}/pay-applications?payAppId=${encodeURIComponent(payAppId)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setStatusMsg(`Deleted Pay Application #${appNumber}.`);
        await loadJobWorkspace(selectedJobId);
        await fetchAccounting();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportQuickBooksCsv = () => {
    const rows = [
      ['Customer', 'Job Number', 'Project', 'App #', 'Period To', 'Status', 'Current Payment Due', 'Retainage', 'Accountant'],
      ...queue.map((a) => [
        a.job?.client_company || '',
        a.job?.job_number || '',
        a.job?.project_name || '',
        String(a.application_number || ''),
        a.period_to || '',
        a.status || '',
        String(a.current_payment_due ?? 0),
        String(a.retainage_amount ?? 0),
        a.assigned_accountant || '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partition-plus-billing-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateG703LineField = (
    idx: number,
    field: 'scheduledValue' | 'thisPeriod' | 'storedMaterials',
    val: number
  ) => {
    setG703Lines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: round2(val) };
      return next;
    });
  };

  const updateG703LineText = (
    idx: number,
    field: 'itemNumber' | 'description',
    val: string
  ) => {
    setG703Lines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const removeG703Line = (idx: number) => {
    setG703Lines((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearAllG703Lines = () => {
    setG703Lines([]);
  };

  const addCustomG703Line = () => {
    const desc = newPayLineDesc.trim();
    if (!desc) return;
    const itemNum =
      newPayLineNum.trim() || String(g703Lines.length + 1).padStart(2, '0');
    const scheduled = round2(Number(newPayLineScheduled) || 0);
    setG703Lines((prev) => [
      ...prev,
      {
        sovItemId: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemNumber: itemNum,
        description: desc,
        source: newPayLineSource,
        scheduledValue: scheduled,
        previousCompleted: 0,
        thisPeriod: 0,
        storedMaterials: 0,
        totalCompletedAndStored: 0,
        percentComplete: 0,
        balanceToFinish: scheduled,
      },
    ]);
    setNewPayLineNum('');
    setNewPayLineDesc('');
    setNewPayLineScheduled('');
    setNewPayLineSource('contract');
  };

  const pullG703FromOriginalSov = () => {
    if (!sovItems || sovItems.length === 0) return;
    setG703Lines(
      sovItems.map((s: any) => ({
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
        balanceToFinish: round2(Number(s.scheduled_value) || 0),
      }))
    );
  };

  const setG703LinePercent = (idx: number, targetPct: number) => {
    setG703Lines((prev) => {
      const next = [...prev];
      const l = next[idx];
      const targetTotal = round2((l.scheduledValue * targetPct) / 100);
      const thisPeriod = round2(targetTotal - l.previousCompleted - l.storedMaterials);
      next[idx] = { ...l, thisPeriod };
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Accounting, SOV &amp; AIA G702/G703 Billing
              </h1>
              <p className="text-xs text-slate-400">
                Billing Queue • Change Order SOV Sync • Progress &amp; Retainage Pay Apps
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Calendar
            </Link>
            <Link href="/estimator" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Estimator
            </Link>
            <Link href="/jobs" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Jobs
            </Link>
            <Link href="/customers" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Customers
            </Link>
            <Link href="/warehouse" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Warehouse
            </Link>
            <button
              type="button"
              onClick={handleExportQuickBooksCsv}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export QuickBooks CSV</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {statusMsg}
            </span>
            <button onClick={() => setStatusMsg(null)} className="text-emerald-700 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Open Change Order Alerts */}
        {openCoAlerts.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5">
            <div className="font-extrabold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Open / Pending Change Orders ({openCoAlerts.length}) — Review before billing</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {openCoAlerts.map((co) => (
                <Link
                  key={co.id}
                  href={`/jobs/${co.job_id}/change-orders`}
                  className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-[11px] font-semibold"
                >
                  {co.job?.job_number || 'Job'} • {co.co_number}: {co.title} ({co.type === 'deduction' ? '-' : '+'}
                  {fmt(co.amount)})
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Accountant Queue Filters */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-500 mr-1">Accountant Queue:</span>
            {['ALL', ...ACCOUNTANT_NAMES, 'UNASSIGNED'].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAccountantFilter(name)}
                className={`px-3 py-1 rounded-full font-bold border transition ${
                  accountantFilter === name
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {name === 'ALL' ? 'All' : name === 'UNASSIGNED' ? 'Unassigned' : name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-semibold"
            >
              <option value="ALL">All Statuses</option>
              <option value="requested">PM Requested</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="paid">Paid</option>
            </select>
            <button
              type="button"
              onClick={fetchAccounting}
              className="p-2 rounded-xl border border-slate-300 hover:bg-slate-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Billing Queue & Jobs */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase text-slate-600">
                Billing Queue ({queue.length})
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {queue.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-400">
                    No pay applications in this queue yet.
                  </div>
                ) : (
                  queue.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => loadJobWorkspace(app.job_id, app.id)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-blue-50/50 transition text-xs ${
                        activePayApp?.id === app.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 truncate">
                          {app.job?.job_number ? `[${app.job.job_number}] ` : ''}
                          {app.job?.project_name || 'Job'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {app.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex justify-between">
                        <span>
                          App #{app.application_number} • {app.assigned_accountant || 'Unassigned'}
                        </span>
                        <strong className="text-slate-900">{fmt(app.current_payment_due)}</strong>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-extrabold uppercase text-slate-600">
                All Active Jobs ({jobs.length})
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {jobs.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => loadJobWorkspace(j.id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition text-xs ${
                      selectedJobId === j.id ? 'bg-emerald-50 border-l-4 border-l-emerald-600' : ''
                    }`}
                  >
                    <div className="font-bold text-slate-900 truncate">
                      {j.job_number ? `[${j.job_number}] ` : ''}
                      {j.project_name}
                    </div>
                    <div className="text-[11px] text-slate-500 flex justify-between mt-0.5">
                      <span className="truncate">{j.client_company || '—'}</span>
                      <span>
                        SOV: {j.sov_summary?.count || 0} ({fmt(j.sov_summary?.total || j.quote_amount)})
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Job SOV & AIA G702/G703 Workspace */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
            {!selectedJob ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Select a Pay Application or Job on the left to manage its Schedule of Values (SOV) and generate AIA G702 / G703 bills.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-emerald-600" />
                      <span>
                        {selectedJob.job_number ? `[${selectedJob.job_number}] ` : ''}
                        {selectedJob.project_name}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500">
                      {selectedJob.client_company || '—'} • Contract Quote: {fmt(selectedJob.quote_amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={handleImportSovFromQuote}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Import SOV from Quote / Scope</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCreatePayApp(false)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Pay App</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleCreatePayApp(true)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
                    >
                      Bill Retainage
                    </button>
                  </div>
                </div>

                {/* Schedule of Values */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase text-slate-700">
                      Schedule of Values ({sovItems.length} lines — Total:{' '}
                      {fmt(sovItems.reduce((s, i) => s + (Number(i.scheduled_value) || 0), 0))})
                    </h3>
                    <Link
                      href={`/jobs/${selectedJob.id}/change-orders`}
                      className="text-[11px] font-bold text-blue-700 hover:underline"
                    >
                      Manage Change Orders →
                    </Link>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden text-xs">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="p-2 w-16">#</th>
                          <th className="p-2">Description</th>
                          <th className="p-2 w-28">Source</th>
                          <th className="p-2 w-32 text-right">Scheduled Value</th>
                          <th className="p-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sovItems.map((it) => (
                          <tr key={it.id}>
                            <td className="p-2 font-mono">{it.item_number}</td>
                            <td className="p-2 font-semibold">{it.description}</td>
                            <td className="p-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  it.source === 'change_order'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {it.source === 'change_order' ? 'Change Order' : 'Contract'}
                              </span>
                            </td>
                            <td className="p-2 text-right font-mono font-bold">
                              {fmt(it.scheduled_value)}
                            </td>
                            <td className="p-2 text-right">
                              {it.source !== 'change_order' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSovRow(it.id)}
                                  className="text-slate-400 hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <form onSubmit={handleAddSovRow} className="flex items-center gap-2 text-xs">
                    <input
                      type="text"
                      value={newSovDesc}
                      onChange={(e) => setNewSovDesc(e.target.value)}
                      placeholder="Add SOV line description (e.g. Toilet Partitions - Furnish & Install)..."
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={newSovVal}
                      onChange={(e) => setNewSovVal(e.target.value)}
                      placeholder="Scheduled $"
                      className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={isBusy || !newSovDesc.trim()}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold disabled:opacity-50"
                    >
                      + Add Line
                    </button>
                  </form>
                </div>

                {/* Pay Application Selector & G702/G703 Editor */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold uppercase text-slate-700">
                        Pay Applications:
                      </span>
                      {jobPayApps.map((a) => (
                        <div key={a.id} className="inline-flex items-center">
                          <button
                            type="button"
                            onClick={() => selectPayAppForEditing(a)}
                            className={`px-2.5 py-1 rounded-l-lg text-xs font-bold border ${
                              activePayApp?.id === a.id
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-slate-50 text-slate-700 border-slate-300'
                            }`}
                          >
                            App #{a.application_number} ({a.status})
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeletePayApp(a.id, a.application_number)}
                            title={`Delete Pay Application #${a.application_number}`}
                            className={`px-1.5 py-1 rounded-r-lg border-y border-r text-xs transition-colors disabled:opacity-50 ${
                              activePayApp?.id === a.id
                                ? 'bg-blue-700 hover:bg-rose-600 text-white border-blue-600'
                                : 'bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 border-slate-300'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {activePayApp && liveSummary && (
                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                            Period To
                          </label>
                          <input
                            type="date"
                            value={periodTo}
                            onChange={(e) => setPeriodTo(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                            Completed Ret. %
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            value={completedRetPct}
                            onChange={(e) => setCompletedRetPct(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                            Stored Matl Ret. %
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            value={storedRetPct}
                            onChange={(e) => setStoredRetPct(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white font-mono text-right"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                            Accountant
                          </label>
                          <select
                            value={assignedAccountant}
                            onChange={(e) => setAssignedAccountant(e.target.value)}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                          >
                            <option value="">Unassigned</option>
                            {ACCOUNTANT_NAMES.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-1.5 font-bold text-amber-800 cursor-pointer pb-1.5">
                            <input
                              type="checkbox"
                              checked={isRetainageRelease}
                              onChange={(e) => setIsRetainageRelease(e.target.checked)}
                            />
                            <span>Retainage Release</span>
                          </label>
                        </div>
                      </div>

                      {/* G703 Customization Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-500">
                          Customize items &amp; scheduled amounts for this pay app &amp; future apps (original SOV &amp; POs stay unchanged).
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={pullG703FromOriginalSov}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
                          >
                            Pull Original SOV
                          </button>
                          <button
                            type="button"
                            onClick={clearAllG703Lines}
                            disabled={g703Lines.length === 0}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold disabled:opacity-40"
                          >
                            Remove All Items
                          </button>
                        </div>
                      </div>

                      {/* G703 Editable Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="bg-slate-100 text-[10px] uppercase text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="p-2">Item</th>
                              <th className="p-2">Description</th>
                              <th className="p-2 text-right">Scheduled ($)</th>
                              <th className="p-2 text-right">Prev. App</th>
                              <th className="p-2 text-right">This Period ($)</th>
                              <th className="p-2 text-right">Stored Matl ($)</th>
                              <th className="p-2 text-right">% Done</th>
                              <th className="p-2 text-center">Del</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {liveSummary.lines.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-4 text-center text-slate-400">
                                  No items in this pay application. Add custom line items below or click Pull Original SOV.
                                </td>
                              </tr>
                            ) : (
                              liveSummary.lines.map((l, idx) => (
                                <tr key={l.sovItemId || idx}>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={g703Lines[idx]?.itemNumber ?? ''}
                                      onChange={(e) =>
                                        updateG703LineText(idx, 'itemNumber', e.target.value)
                                      }
                                      className="w-16 px-1.5 py-1 rounded border border-slate-300 font-mono"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={g703Lines[idx]?.description ?? ''}
                                      onChange={(e) =>
                                        updateG703LineText(idx, 'description', e.target.value)
                                      }
                                      className="w-full min-w-[180px] px-1.5 py-1 rounded border border-slate-300"
                                    />
                                  </td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={g703Lines[idx]?.scheduledValue ?? 0}
                                      onChange={(e) =>
                                        updateG703LineField(
                                          idx,
                                          'scheduledValue',
                                          Number(e.target.value)
                                        )
                                      }
                                      className="w-24 px-1.5 py-1 rounded border border-slate-300 text-right font-mono font-semibold"
                                    />
                                  </td>
                                  <td className="p-2 text-right font-mono">{fmt(l.previousCompleted)}</td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={g703Lines[idx]?.thisPeriod ?? 0}
                                      onChange={(e) =>
                                        updateG703LineField(idx, 'thisPeriod', Number(e.target.value))
                                      }
                                      className="w-24 px-1.5 py-1 rounded border border-slate-300 text-right font-mono"
                                    />
                                  </td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={g703Lines[idx]?.storedMaterials ?? 0}
                                      onChange={(e) =>
                                        updateG703LineField(
                                          idx,
                                          'storedMaterials',
                                          Number(e.target.value)
                                        )
                                      }
                                      className="w-24 px-1.5 py-1 rounded border border-slate-300 text-right font-mono"
                                    />
                                  </td>
                                  <td className="p-2 text-right">
                                    <input
                                      type="number"
                                      step="1"
                                      min={0}
                                      max={100}
                                      value={Math.round(l.percentComplete)}
                                      onChange={(e) =>
                                        setG703LinePercent(idx, Number(e.target.value) || 0)
                                      }
                                      className="w-16 px-1.5 py-1 rounded border border-slate-300 text-right font-mono"
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeG703Line(idx)}
                                      className="p-1 text-slate-400 hover:text-rose-600"
                                      title="Remove item from pay app"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>

                        {/* Add Custom Pay App Line Item */}
                        <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center gap-2 text-[11px]">
                          <input
                            type="text"
                            placeholder="Item # / Name"
                            value={newPayLineNum}
                            onChange={(e) => setNewPayLineNum(e.target.value)}
                            className="w-24 px-2 py-1 rounded border border-slate-300 bg-white font-mono"
                          />
                          <input
                            type="text"
                            placeholder="Custom line description (e.g. Toilet Partitions — Labor Breakout)..."
                            value={newPayLineDesc}
                            onChange={(e) => setNewPayLineDesc(e.target.value)}
                            className="flex-1 min-w-[200px] px-2 py-1 rounded border border-slate-300 bg-white"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Scheduled ($)"
                            value={newPayLineScheduled}
                            onChange={(e) => setNewPayLineScheduled(e.target.value)}
                            className="w-28 px-2 py-1 rounded border border-slate-300 bg-white font-mono"
                          />
                          <select
                            value={newPayLineSource}
                            onChange={(e) =>
                              setNewPayLineSource(
                                e.target.value === 'change_order' ? 'change_order' : 'contract'
                              )
                            }
                            className="px-2 py-1 rounded border border-slate-300 bg-white font-semibold"
                          >
                            <option value="contract">Contract</option>
                            <option value="change_order">Change Order</option>
                          </select>
                          <button
                            type="button"
                            onClick={addCustomG703Line}
                            disabled={!newPayLineDesc.trim()}
                            className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold inline-flex items-center gap-1 disabled:opacity-40"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Line</span>
                          </button>
                        </div>
                      </div>

                      {/* G702 Summary Strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-white border border-slate-200">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">
                            Contract To Date
                          </div>
                          <div className="font-mono font-bold text-slate-900">
                            {fmt(liveSummary.contractSumToDate)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">
                            Completed &amp; Stored
                          </div>
                          <div className="font-mono font-bold text-slate-900">
                            {fmt(liveSummary.totalCompletedAndStored)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">
                            Total Retainage
                          </div>
                          <div className="font-mono font-bold text-amber-700">
                            {fmt(liveSummary.retainageAmount)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">
                            Current Payment Due
                          </div>
                          <div className="font-mono font-black text-emerald-700 text-sm">
                            {fmt(liveSummary.currentPaymentDue)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSavePayApp()}
                            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Draft</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSavePayApp('submitted')}
                            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
                          >
                            Mark Submitted
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSavePayApp('paid')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                          >
                            Mark Paid
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowPrintModal(true)}
                          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Print AIA G702 / G703</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <AIAG702PrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        job={selectedJob}
        payApp={
          activePayApp
            ? {
                ...activePayApp,
                period_to: periodTo,
                completed_retainage_percent: Number(completedRetPct) || 0,
                stored_retainage_percent: Number(storedRetPct) || 0,
                is_retainage_release: isRetainageRelease,
                g703_lines: g703Lines,
              }
            : null
        }
      />
    </div>
  );
}
