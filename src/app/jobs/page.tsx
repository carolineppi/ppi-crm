'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  RefreshCw,
  Search,
  MapPin,
  Building2,
  Phone,
  Mail,
  UserCheck,
  Award,
  Inbox,
  Users,
  DollarSign,
  FileText,
  ClipboardCheck,
  UserPlus,
} from 'lucide-react';

const DEFAULT_PMS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
  'Jennifer MacPherson',
];

interface JobRecord {
  id: string;
  bid_request_id: string | null;
  job_number: string | null;
  project_name: string;
  client_name: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_email: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  scope_of_work: string | null;
  estimator_name: string | null;
  project_manager: string | null;
  pm_assigned_at: string | null;
  quote_amount: number | null;
  status: 'pending_setup' | 'scheduled' | 'in_progress' | 'completed' | 'on_hold';
  notes: string | null;
  won_confirmed_by: string | null;
  won_confirmed_at: string | null;
  scope_pdf_filename: string | null;
  scope_pdf_url: string | null;
  line_items: Array<{
    id: string;
    lineNumber: number;
    manufacturer?: string;
    sku?: string;
    description: string;
    quantity: number;
    unit?: string;
    unitPrice?: number;
  }> | null;
  created_at: string;
}

const STATUS_LABELS: Record<JobRecord['status'], string> = {
  pending_setup: 'Pending Setup',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | JobRecord['status']>('ALL');
  const [pmFilter, setPmFilter] = useState<'ALL' | 'UNASSIGNED' | string>('ALL');
  const [customPmDraft, setCustomPmDraft] = useState<Record<string, string>>({});
  const [showCustomPmInput, setShowCustomPmInput] = useState<Record<string, boolean>>({});

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const pmOptions = useMemo(() => {
    const set = new Set(DEFAULT_PMS);
    jobs.forEach((j) => {
      if (j.project_manager) set.add(j.project_manager);
    });
    return Array.from(set);
  }, [jobs]);

  const handleStatusChange = async (jobId: string, newStatus: JobRecord['status']) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)));
      }
    } catch (err) {
      console.error('Failed to update job status:', err);
    }
  };

  const handleAssignPm = async (jobId: string, pmName: string | null) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectManager: pmName || null }),
      });
      const data = await res.json();
      if (res.ok && data.job) {
        setJobs((prev) => prev.map((j) => (j.id === jobId ? data.job : j)));
        setShowCustomPmInput((prev) => ({ ...prev, [jobId]: false }));
      }
    } catch (err) {
      console.error('Failed to assign project manager:', err);
    }
  };

  const unassignedPmCount = useMemo(
    () => jobs.filter((j) => !j.project_manager).length,
    [jobs]
  );

  const activeJobsCount = useMemo(
    () => jobs.filter((j) => j.status === 'scheduled' || j.status === 'in_progress').length,
    [jobs]
  );

  const totalQuoteValue = useMemo(
    () => jobs.reduce((sum, j) => sum + (Number(j.quote_amount) || 0), 0),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return jobs.filter((job) => {
      if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;
      if (pmFilter === 'UNASSIGNED' && job.project_manager) return false;
      if (pmFilter !== 'ALL' && pmFilter !== 'UNASSIGNED' && job.project_manager !== pmFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        job.job_number,
        job.project_name,
        job.client_company,
        job.client_name,
        job.address_street,
        job.address_city,
        job.address_state,
        job.estimator_name,
        job.project_manager,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, statusFilter, pmFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-emerald-300" />
            <span>Jobs &amp; Project Manager Assignment</span>
          </h1>
          <p className="text-xs text-emerald-100/80 mt-0.5">
            View won jobs, review their selected scope line items, and assign each job to a Project Manager.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Dispatch Feed</span>
          </Link>
          <Link
            href="/estimator"
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Estimator Portal</span>
          </Link>
          <Link
            href="/pm"
            className="px-3.5 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 text-xs font-bold transition flex items-center gap-1.5 border border-teal-400/30"
          >
            <span>📋 PM Portal</span>
          </Link>
          <Link
            href="/pricing"
            className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold transition flex items-center gap-1.5 border border-emerald-400/30"
          >
            <span>💰 Price Book</span>
          </Link>
          <button
            type="button"
            onClick={fetchJobs}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
            title="Refresh Jobs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Jobs
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{jobs.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs bg-amber-50/30">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block">
            Needs PM Assignment
          </span>
          <span className="text-2xl font-black text-amber-900 mt-1 block">{unassignedPmCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
            Scheduled / In Progress
          </span>
          <span className="text-2xl font-black text-blue-900 mt-1 block">{activeJobsCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
            Total Job Value
          </span>
          <span className="text-2xl font-black text-emerald-900 mt-1 block">
            ${totalQuoteValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'pending_setup', 'scheduled', 'in_progress', 'completed', 'on_hold'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'ALL' ? `All Statuses (${jobs.length})` : STATUS_LABELS[st]}
                </button>
              )
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search job #, contractor, PM, address..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs"
            />
          </div>
        </div>

        {/* PM Filter Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
            Project Manager:
          </span>
          <button
            type="button"
            onClick={() => setPmFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              pmFilter === 'ALL'
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setPmFilter('UNASSIGNED')}
            className={`px-2.5 py-1 rounded-lg font-bold transition ${
              pmFilter === 'UNASSIGNED'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Unassigned PM ({unassignedPmCount})
          </button>
          {pmOptions.map((pm) => {
            const count = jobs.filter((j) => j.project_manager === pm).length;
            if (count === 0 && !DEFAULT_PMS.includes(pm)) return null;
            return (
              <button
                key={pm}
                type="button"
                onClick={() => setPmFilter(pm)}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  pmFilter === pm
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pm} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Jobs Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading active jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm">
          No jobs match the current filter. Confirm a bid as <strong>Won</strong> in the Estimator Portal to create a job.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredJobs.map((job) => {
            const fullAddress = [
              job.address_street,
              [job.address_city, job.address_state].filter(Boolean).join(', '),
              job.address_zip,
            ]
              .filter(Boolean)
              .join(' • ');

            const isCustomOpen = Boolean(showCustomPmInput[job.id]);

            return (
              <div
                key={job.id}
                className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${
                  job.project_manager ? 'border-l-emerald-600' : 'border-l-amber-500'
                } p-5 shadow-sm space-y-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {job.job_number || 'JOB'}
                      </span>
                      {job.quote_amount !== null && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          {Number(job.quote_amount).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                      {!job.project_manager && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          Needs PM
                        </span>
                      )}
                    </div>
                    <Link href={`/jobs/${job.id}`} className="block group">
                      <h2 className="text-base font-black text-slate-900 mt-1 group-hover:text-blue-700 group-hover:underline">
                        {job.project_name} →
                      </h2>
                    </Link>
                  </div>

                  <select
                    value={job.status}
                    onChange={(e) => handleStatusChange(job.id, e.target.value as JobRecord['status'])}
                    className="text-xs font-bold rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-slate-800"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PM Assignment Bar */}
                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-950">
                    <UserPlus className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>Project Manager:</span>
                  </div>

                  {isCustomOpen ? (
                    <div className="flex items-center gap-1.5 flex-1 sm:max-w-xs">
                      <input
                        type="text"
                        placeholder="Enter PM name..."
                        value={customPmDraft[job.id] || ''}
                        onChange={(e) =>
                          setCustomPmDraft((prev) => ({ ...prev, [job.id]: e.target.value }))
                        }
                        className="flex-1 px-2.5 py-1 rounded-lg border border-blue-300 bg-white text-xs font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleAssignPm(job.id, (customPmDraft[job.id] || '').trim())}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setShowCustomPmInput((prev) => ({ ...prev, [job.id]: false }))
                        }
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={job.project_manager || ''}
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setShowCustomPmInput((prev) => ({ ...prev, [job.id]: true }));
                          } else {
                            handleAssignPm(job.id, e.target.value || null);
                          }
                        }}
                        className="text-xs font-bold rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-slate-900"
                      >
                        <option value="">-- Unassigned (Select PM) --</option>
                        {pmOptions.map((pm) => (
                          <option key={pm} value={pm}>
                            {pm}
                          </option>
                        ))}
                        <option value="__CUSTOM__">+ Enter Custom PM Name...</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Contractor & Address */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="flex items-start gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800">
                        {job.client_company || 'No Contractor Listed'}
                      </div>
                      {job.client_name && <div>{job.client_name}</div>}
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>{fullAddress || 'Address not specified on bid'}</div>
                  </div>
                  {(job.client_phone || job.client_email) && (
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1 border-t border-slate-200/60">
                      {job.client_phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {job.client_phone}
                        </span>
                      )}
                      {job.client_email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {job.client_email}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {job.scope_of_work && (
                  <p className="text-xs text-slate-600 line-clamp-2">{job.scope_of_work}</p>
                )}

                {job.scope_pdf_filename && (
                  <div className="flex items-center gap-2 text-xs">
                    <FileText className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span className="text-slate-500">Scope PDF:</span>
                    {job.scope_pdf_url ? (
                      <a
                        href={job.scope_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-blue-700 hover:underline truncate"
                      >
                        {job.scope_pdf_filename}
                      </a>
                    ) : (
                      <span className="font-bold text-slate-800 truncate">{job.scope_pdf_filename}</span>
                    )}
                  </div>
                )}

                {Array.isArray(job.line_items) && job.line_items.length > 0 && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/70">
                    <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-600">
                      Job Line Items ({job.line_items.length})
                    </div>
                    <div className="divide-y divide-slate-200/70 max-h-40 overflow-y-auto bg-white">
                      {job.line_items.map((li, idx) => (
                        <div
                          key={li.id || idx}
                          className="px-3 py-1.5 text-[11px] flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-bold text-slate-900 w-7 flex-shrink-0">
                              {li.quantity}x
                            </span>
                            {(li.manufacturer || li.sku) && (
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 flex-shrink-0">
                                {[li.manufacturer, li.sku].filter(Boolean).join(' ')}
                              </span>
                            )}
                            <span className="text-slate-700 truncate">{li.description}</span>
                          </div>
                          {li.unitPrice !== undefined && li.unitPrice !== null && (
                            <span className="font-semibold text-slate-800 flex-shrink-0">
                              ${Number(li.unitPrice).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    Estimator: <strong className="text-slate-700">{job.estimator_name || 'Unassigned'}</strong>
                  </span>
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <Award className="w-3.5 h-3.5" />
                    Confirmed Won by {job.won_confirmed_by || 'Estimator'}
                    {job.won_confirmed_at
                      ? ` • ${new Date(job.won_confirmed_at).toLocaleDateString()}`
                      : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
