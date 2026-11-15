'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Save,
  AlertTriangle,
  Briefcase,
  FileText,
  DollarSign,
  Warehouse,
  CalendarCheck2,
  X,
} from 'lucide-react';
import { DashboardWidgetConfig } from '@/lib/auth/roles';

function DashboardContent() {
  const searchParams = useSearchParams();
  const denied = searchParams.get('denied') === '1';

  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>([]);
  const [data, setData] = useState<any>({
    bids: [],
    jobs: [],
    payApps: [],
    incomingPOs: [],
    upcomingInstalls: [],
  });

  const [showCustomize, setShowCustomize] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  const loadDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/me/dashboard');
      const json = await res.json();
      if (res.ok) {
        setProfile(json.profile);
        setWidgets(json.widgets || []);
        setData(json.data || {});
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const moveWidget = (idx: number, dir: -1 | 1) => {
    setWidgets((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const toggleWidget = (idx: number) => {
    setWidgets((prev) =>
      prev.map((w, i) => (i === idx ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const toggleSpan = (idx: number) => {
    setWidgets((prev) =>
      prev.map((w, i) =>
        i === idx ? { ...w, span: w.span === 'full' ? 'half' : 'full' } : w
      )
    );
  };

  const toggleScope = (idx: number) => {
    setWidgets((prev) =>
      prev.map((w, i) =>
        i === idx ? { ...w, scope: w.scope === 'mine' ? 'all' : 'mine' } : w
      )
    );
  };

  const handleSaveLayout = async () => {
    setIsSaving(true);
    setSavedToast(null);
    try {
      const res = await fetch('/api/me/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dashboardConfig: { widgets },
        }),
      });
      if (res.ok) {
        setSavedToast('Dashboard layout saved.');
        setShowCustomize(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const myName = (profile?.full_name || '').toLowerCase();

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading your workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {denied && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              You don&apos;t have permission to view that page. Contact an Admin if you need access.
            </span>
          </div>
        )}

        {savedToast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold">
            {savedToast}
          </div>
        )}

        {/* Welcome Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div>
            <h1 className="text-xl font-black text-slate-900">
              Welcome back, {profile?.full_name || 'User'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Roles:{' '}
              <span className="font-bold text-slate-700">
                {(profile?.roles || []).join(', ')}
              </span>{' '}
              • Personalized Partition Plus Workspace
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCustomize(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Customize Dashboard</span>
          </button>
        </div>

        {/* Customizable Widget Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {widgets
            .filter((w) => w.enabled)
            .map((w) => {
              const spanClass = w.span === 'full' ? 'lg:col-span-2' : 'lg:col-span-1';

              if (w.id === 'kpis') {
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} grid grid-cols-2 sm:grid-cols-5 gap-3`}
                  >
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">Visible Bids</div>
                      <div className="text-2xl font-black mt-1">{data.bids?.length || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">Active Jobs</div>
                      <div className="text-2xl font-black mt-1">{data.jobs?.length || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">Billing Queue</div>
                      <div className="text-2xl font-black mt-1">{data.payApps?.length || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">Incoming POs</div>
                      <div className="text-2xl font-black mt-1">{data.incomingPOs?.length || 0}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">Installs</div>
                      <div className="text-2xl font-black mt-1">{data.upcomingInstalls?.length || 0}</div>
                    </div>
                  </div>
                );
              }

              if (w.id === 'quick_links') {
                const roles = profile?.roles || [];
                const can = (r: string) => roles.includes('admin') || roles.includes(r);
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-2`}
                  >
                    <h2 className="text-xs font-extrabold uppercase text-slate-500">{w.title}</h2>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(can('calendar_manager') || can('estimator')) && (
                        <Link href="/estimator" className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 font-bold border border-blue-200">
                          Estimator Workspace
                        </Link>
                      )}
                      {can('pm') && (
                        <Link href="/pm" className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-200">
                          PM Portal
                        </Link>
                      )}
                      {can('accounting') && (
                        <Link href="/accounting" className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                          Accounting &amp; AIA Billing
                        </Link>
                      )}
                      {can('warehouse') && (
                        <Link href="/warehouse" className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 font-bold border border-amber-200">
                          Warehouse Dock &amp; Stock
                        </Link>
                      )}
                      {(can('install_coordinator') || can('installer')) && (
                        <Link href="/install" className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-800 font-bold border border-indigo-200">
                          Install Schedule &amp; Reports
                        </Link>
                      )}
                      {roles.includes('admin') && (
                        <Link href="/admin/users" className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold">
                          Manage 30+ Users
                        </Link>
                      )}
                    </div>
                  </div>
                );
              }

              if (w.id === 'my_bids') {
                const list =
                  w.scope === 'mine' && myName
                    ? (data.bids || []).filter(
                        (b: any) =>
                          (b.raw_payload?.assigned_estimator_name || '').toLowerCase() === myName
                      )
                    : data.bids || [];
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span>{w.title}</span>
                      </h2>
                      <Link href="/estimator" className="text-xs font-bold text-blue-700 hover:underline">
                        Open →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {list.slice(0, 6).map((b: any) => (
                        <div key={b.id} className="py-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900">
                              {b.bid_number ? `${b.bid_number} — ` : ''}
                              {b.project_name || 'Untitled Bid'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {b.client_company || 'GC'} • Due: {b.bid_due_date || 'TBD'}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                            {b.estimator_status || b.triage_status || 'open'}
                          </span>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <div className="py-4 text-slate-400 text-center">No bids in this view.</div>
                      )}
                    </div>
                  </div>
                );
              }

              if (w.id === 'my_jobs') {
                const list =
                  w.scope === 'mine' && myName
                    ? (data.jobs || []).filter(
                        (j: any) =>
                          (j.project_manager || '').toLowerCase() === myName ||
                          (j.estimator_name || '').toLowerCase() === myName
                      )
                    : data.jobs || [];
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                        <Briefcase className="w-4 h-4 text-teal-600" />
                        <span>{w.title}</span>
                      </h2>
                      <Link href="/jobs" className="text-xs font-bold text-blue-700 hover:underline">
                        All Jobs →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {list.slice(0, 6).map((j: any) => (
                        <div key={j.id} className="py-2 flex items-center justify-between gap-2">
                          <Link href={`/jobs/${j.id}`} className="font-bold text-blue-700 hover:underline">
                            {j.job_number || 'JOB'} — {j.project_name}
                          </Link>
                          <span className="text-[11px] text-slate-500">
                            {j.warehouse_location || j.warehouse_status || j.status}
                          </span>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <div className="py-4 text-slate-400 text-center">No jobs assigned.</div>
                      )}
                    </div>
                  </div>
                );
              }

              if (w.id === 'my_billing') {
                const list =
                  w.scope === 'mine' && myName
                    ? (data.payApps || []).filter(
                        (a: any) =>
                          !a.assigned_accountant ||
                          myName.includes(String(a.assigned_accountant).toLowerCase())
                      )
                    : data.payApps || [];
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span>{w.title}</span>
                      </h2>
                      <Link href="/accounting" className="text-xs font-bold text-blue-700 hover:underline">
                        Accounting →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {list.slice(0, 6).map((a: any) => (
                        <div key={a.id} className="py-2 flex items-center justify-between">
                          <span className="font-bold">Pay App #{a.application_number}</span>
                          <span className="text-slate-600">
                            ${Number(a.current_payment_due || 0).toLocaleString()} ({a.status})
                          </span>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <div className="py-4 text-slate-400 text-center">No pending billing items.</div>
                      )}
                    </div>
                  </div>
                );
              }

              if (w.id === 'warehouse_dock') {
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                        <Warehouse className="w-4 h-4 text-amber-600" />
                        <span>{w.title}</span>
                      </h2>
                      <Link href="/warehouse" className="text-xs font-bold text-blue-700 hover:underline">
                        Warehouse →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {(data.incomingPOs || []).slice(0, 6).map((po: any) => (
                        <div key={po.id} className="py-2 flex items-center justify-between">
                          <span className="font-mono font-bold">{po.po_number}</span>
                          <span className="text-slate-600">
                            {po.vendor} • ETA: {po.expected_delivery_date || 'TBD'}
                          </span>
                        </div>
                      ))}
                      {(data.incomingPOs || []).length === 0 && (
                        <div className="py-4 text-slate-400 text-center">No incoming POs.</div>
                      )}
                    </div>
                  </div>
                );
              }

              if (w.id === 'upcoming_installs') {
                return (
                  <div
                    key={w.id}
                    className={`${spanClass} bg-white rounded-xl border border-slate-200 p-4 space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                        <CalendarCheck2 className="w-4 h-4 text-indigo-600" />
                        <span>{w.title}</span>
                      </h2>
                      <Link href="/install" className="text-xs font-bold text-blue-700 hover:underline">
                        Install Dept →
                      </Link>
                    </div>
                    <div className="divide-y divide-slate-100 text-xs">
                      {(data.upcomingInstalls || []).slice(0, 6).map((t: any) => (
                        <div key={t.id} className="py-2 flex items-center justify-between">
                          <div>
                            <div className="font-bold">
                              {t.job?.job_number} — {t.job?.project_name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Crew: {t.assigned_crew || 'Unassigned'}
                            </div>
                          </div>
                          <span className="font-bold text-indigo-700">
                            {t.confirmed_install_date || t.requested_install_date}
                          </span>
                        </div>
                      ))}
                      {(data.upcomingInstalls || []).length === 0 && (
                        <div className="py-4 text-slate-400 text-center">No upcoming installs.</div>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}
        </div>
      </div>

      {/* Customize Dashboard Modal */}
      {showCustomize && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">Customize Your Dashboard</h2>
              <button type="button" onClick={() => setShowCustomize(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {widgets.map((w, idx) => (
                <div key={w.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">{w.title}</div>
                    <div className="text-[11px] text-slate-500">
                      Width: {w.span} {w.scope ? `• Scope: ${w.scope}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {w.scope && (
                      <button
                        type="button"
                        onClick={() => toggleScope(idx)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold"
                      >
                        {w.scope === 'mine' ? 'Mine' : 'All'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleSpan(idx)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 font-bold"
                    >
                      {w.span === 'full' ? 'Full' : 'Half'}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, -1)}
                      className="p-1.5 rounded hover:bg-slate-100"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, 1)}
                      className="p-1.5 rounded hover:bg-slate-100"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleWidget(idx)}
                      className={`p-1.5 rounded ${
                        w.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {w.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCustomize(false)}
                className="px-4 py-2 border rounded-lg text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveLayout}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm text-slate-500">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
