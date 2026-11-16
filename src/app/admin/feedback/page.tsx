'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Flag,
  Bug,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  AlertTriangle,
} from 'lucide-react';

export default function AdminFeedbackPage() {
  const [flags, setFlags] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [expandedDiagIds, setExpandedDiagIds] = useState<Record<string, boolean>>({});
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      const res = await fetch(`/api/feedback?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        const list = data.flags || [];
        setFlags(list);
        const drafts: Record<string, string> = {};
        for (const f of list) {
          drafts[f.id] = f.admin_notes || '';
        }
        setNotesDrafts(drafts);
      } else {
        setErrorMsg(data.error || 'Failed to load bug reports.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleUpdateFlag = async (
    id: string,
    updates: { status?: string; adminNotes?: string }
  ) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await loadFlags();
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteFlag = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Delete this report?')) return;
    const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setFlags((prev) => prev.filter((f) => f.id !== id));
    }
  };

  const openCount = flags.filter(
    (f) => f.status === 'open' || f.status === 'in_progress'
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="bg-slate-900 text-white rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-md">
          <div className="flex items-center gap-3">
            <Flag className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-lg font-black">Admin Bug &amp; Improvement Inbox</h1>
              <p className="text-xs text-slate-300">
                User-flagged bugs &amp; requests with exact page URL, role, and runtime diagnostics.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
              {openCount} Open / Active
            </span>
            <button
              type="button"
              onClick={loadFlags}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Status:</span>
            {['ALL', 'open', 'in_progress', 'resolved', 'wont_fix'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg font-bold capitalize ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Type:</span>
            {['ALL', 'bug', 'improvement'].map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTypeFilter(tp)}
                className={`px-2.5 py-1 rounded-lg font-bold capitalize ${
                  typeFilter === tp
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tp}
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading flagged reports...</div>
        ) : flags.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-xs text-slate-500">
            No flagged bugs or improvement requests match the selected filters.
          </div>
        ) : (
          <div className="space-y-4">
            {flags.map((f) => {
              const ctx = f.context_snapshot || {};
              const failedReqs: any[] = Array.isArray(ctx.recentFailedRequests)
                ? ctx.recentFailedRequests
                : [];
              const consoleErrs: any[] = Array.isArray(ctx.recentErrors) ? ctx.recentErrors : [];
              const isExpanded = Boolean(expandedDiagIds[f.id]);

              return (
                <div
                  key={f.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            f.flag_type === 'bug'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {f.flag_type === 'bug' ? (
                            <Bug className="w-3 h-3" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {f.flag_type}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            f.severity === 'urgent'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : f.severity === 'low'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {f.severity}
                        </span>
                        <span className="text-sm font-black text-slate-900">{f.title}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Reported by <strong>{f.reporter_name}</strong> ({f.reporter_email}) • Role:{' '}
                        <strong>{f.reporter_role || 'unknown'}</strong> •{' '}
                        {new Date(f.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={f.status}
                        disabled={savingId === f.id}
                        onChange={(e) => handleUpdateFlag(f.id, { status: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 font-bold bg-slate-50"
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="wont_fix">Won&apos;t Fix</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteFlag(f.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600"
                        title="Delete report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 whitespace-pre-wrap">
                    {f.message}
                  </div>

                  {/* Exact Circumstances Diagnostics */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-slate-700">
                          Page: <code className="font-mono text-blue-700">{f.pathname || '/'}</code>
                        </span>
                        {failedReqs.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                            {failedReqs.length} Failed API
                          </span>
                        )}
                        {consoleErrs.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                            {consoleErrs.length} Console Errors
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {f.page_url && (
                          <Link
                            href={`${f.pathname || '/'}${ctx.search || ''}`}
                            className="text-[11px] font-bold text-blue-700 hover:underline inline-flex items-center gap-1"
                          >
                            <span>Open Exact Page</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDiagIds((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                          }
                          className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Hide Diagnostics' : 'View Exact Circumstances'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 border-t border-slate-200 bg-white space-y-2 text-[11px] font-mono text-slate-700">
                        <div>
                          <strong>Full URL:</strong> {f.page_url || '—'}
                        </div>
                        <div>
                          <strong>Effective Role:</strong> {ctx.effectiveRole || f.reporter_role}
                          {ctx.isViewingAs ? ` (Admin View-As Preview by ${ctx.realAdminEmail})` : ''}
                          {' • '}
                          <strong>Theme:</strong> {ctx.theme || 'default'}
                          {ctx.viewport ? ` • Viewport: ${ctx.viewport.width}×${ctx.viewport.height}` : ''}
                        </div>
                        <div className="truncate">
                          <strong>User Agent:</strong> {ctx.userAgent || '—'}
                        </div>

                        {failedReqs.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            <div className="font-bold text-rose-800">Failed API Requests:</div>
                            {failedReqs.map((r, i) => (
                              <div key={i} className="p-1.5 rounded bg-rose-50 text-rose-900">
                                [{r.status}] {r.method} {r.url}{' '}
                                {r.errorSnippet ? `— ${r.errorSnippet}` : ''}
                              </div>
                            ))}
                          </div>
                        )}

                        {consoleErrs.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            <div className="font-bold text-amber-900">Console / Runtime Errors:</div>
                            {consoleErrs.map((er, i) => (
                              <div key={i} className="p-1.5 rounded bg-amber-50 text-amber-900">
                                [{er.source}] {er.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Admin Notes */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Admin resolution notes..."
                      value={notesDrafts[f.id] ?? ''}
                      onChange={(e) =>
                        setNotesDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                      }
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs"
                    />
                    <button
                      type="button"
                      disabled={savingId === f.id}
                      onClick={() =>
                        handleUpdateFlag(f.id, { adminNotes: notesDrafts[f.id] ?? '' })
                      }
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Notes</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
