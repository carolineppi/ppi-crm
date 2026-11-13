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
  PackageCheck,
  FileDiff,
  CalendarClock,
  Eye,
  Inbox,
  Users,
  UserCheck,
  DollarSign,
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

interface PMJob {
  id: string;
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
  estimator_name: string | null;
  project_manager: string | null;
  quote_amount: number | null;
  status: string;
  material_eta: string | null;
  site_available_range: string | null;
  requested_install_date: string | null;
  install_request_status: string;
  line_items: any[] | null;
  po_summary?: { total: number; open: number; totalCost: number };
  co_summary?: { total: number; pending: number; netApproved: number };
}

export default function ProjectManagerDashboardPage() {
  const [jobs, setJobs] = useState<PMJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPm, setSelectedPm] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('ppi_current_pm');
    if (saved) setSelectedPm(saved);
    fetchJobs();
  }, []);

  const handleSelectPm = (pm: string) => {
    setSelectedPm(pm);
    localStorage.setItem('ppi_current_pm', pm);
  };

  const fetchJobs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error('Failed to load PM jobs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const pmList = useMemo(() => {
    const set = new Set(DEFAULT_PMS);
    jobs.forEach((j) => {
      if (j.project_manager) set.add(j.project_manager);
    });
    return Array.from(set);
  }, [jobs]);

  const pmScopedJobs = useMemo(() => {
    if (selectedPm === 'ALL') return jobs;
    return jobs.filter((j) => j.project_manager === selectedPm);
  }, [jobs, selectedPm]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pmScopedJobs;
    return pmScopedJobs.filter((j) => {
      const hay = [
        j.job_number,
        j.project_name,
        j.client_company,
        j.client_name,
        j.address_city,
        j.address_state,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pmScopedJobs, searchQuery]);

  const openPoCount = useMemo(
    () => pmScopedJobs.reduce((s, j) => s + (j.po_summary?.open || 0), 0),
    [pmScopedJobs]
  );
  const pendingCoCount = useMemo(
    () => pmScopedJobs.reduce((s, j) => s + (j.co_summary?.pending || 0), 0),
    [pmScopedJobs]
  );
  const installRequestedCount = useMemo(
    () =>
      pmScopedJobs.filter(
        (j) => j.install_request_status === 'requested' || j.install_request_status === 'scheduled'
      ).length,
    [pmScopedJobs]
  );

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-teal-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-teal-300" />
            <span>Project Manager Portal — Active Jobs</span>
          </h1>
          <p className="text-xs text-blue-100/80 mt-0.5">
            Order scope materials (POs), manage change orders, coordinate with site contacts, and request install scheduling.
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
            href="/jobs"
            className="px-3.5 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 text-xs font-bold transition flex items-center gap-1.5 border border-teal-400/30"
          >
            <span>🏗️ All Jobs &amp; PM Assignment</span>
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

      {/* PM Profile Switcher */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
            <UserCheck className="w-4 h-4 text-teal-600" />
            Project Manager:
          </span>
          <button
            type="button"
            onClick={() => handleSelectPm('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedPm === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All PMs ({jobs.length})
          </button>
          {pmList.map((pm) => {
            const count = jobs.filter((j) => j.project_manager === pm).length;
            if (count === 0 && !DEFAULT_PMS.includes(pm)) return null;
            return (
              <button
                key={pm}
                type="button"
                onClick={() => handleSelectPm(pm)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  selectedPm === pm
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pm} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search job #, contractor..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs"
          />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Assigned Jobs
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{pmScopedJobs.length}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
            Open Purchase Orders
          </span>
          <span className="text-2xl font-black text-blue-900 mt-1 block">{openPoCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs bg-purple-50/30">
          <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider block">
            Pending Change Orders
          </span>
          <span className="text-2xl font-black text-purple-900 mt-1 block">{pendingCoCount}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
            Install Requested / Scheduled
          </span>
          <span className="text-2xl font-black text-emerald-900 mt-1 block">
            {installRequestedCount}
          </span>
        </div>
      </div>

      {/* Jobs Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading PM jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm">
          No jobs assigned to <strong>{selectedPm === 'ALL' ? 'any PM' : selectedPm}</strong> yet. Assign a PM on the{' '}
          <Link href="/jobs" className="text-blue-700 font-bold underline">
            Jobs &amp; PM Assignment
          </Link>{' '}
          page.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredJobs.map((job) => {
            const baseQuote = Number(job.quote_amount) || 0;
            const coNet = job.co_summary?.netApproved || 0;
            const adjustedTotal = baseQuote + coNet;
            const fullAddress = [
              job.address_street,
              [job.address_city, job.address_state].filter(Boolean).join(', '),
              job.address_zip,
            ]
              .filter(Boolean)
              .join(' • ');

            return (
              <div
                key={job.id}
                className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-teal-600 p-5 shadow-sm flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-extrabold px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                          {job.job_number || 'JOB'}
                        </span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3 text-emerald-600" />
                          {adjustedTotal.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          {coNet !== 0 && (
                            <span className="text-[10px] text-purple-700 ml-1">
                              (CO {coNet > 0 ? '+' : ''}
                              ${coNet.toLocaleString('en-US', { minimumFractionDigits: 0 })})
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          PM: {job.project_manager || 'Unassigned'}
                        </span>
                      </div>
                      <h2 className="text-base font-black text-slate-900 mt-1">{job.project_name}</h2>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                        job.install_request_status === 'scheduled'
                          ? 'bg-emerald-100 text-emerald-800'
                          : job.install_request_status === 'requested'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Install: {job.install_request_status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* POC & Address */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-start gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-bold text-slate-800">
                          {job.client_company || 'No Contractor'}
                        </div>
                        {job.client_name && <div>POC: {job.client_name}</div>}
                        {job.client_phone && (
                          <a href={`tel:${job.client_phone}`} className="text-blue-700 hover:underline flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {job.client_phone}
                          </a>
                        )}
                        {job.client_email && (
                          <a href={`mailto:${job.client_email}`} className="text-blue-700 hover:underline flex items-center gap-1 mt-0.5 truncate">
                            <Mail className="w-3 h-3" /> {job.client_email}
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{fullAddress || 'No site address'}</span>
                      </div>
                      {job.material_eta && (
                        <div className="flex items-center gap-1.5 text-blue-800 font-semibold">
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Material ETA: {job.material_eta}</span>
                        </div>
                      )}
                      {job.requested_install_date && (
                        <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Requested Install: {job.requested_install_date}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Links */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Job Viewer</span>
                  </Link>
                  <Link
                    href={`/jobs/${job.id}/purchase-orders`}
                    className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <PackageCheck className="w-3.5 h-3.5" />
                    <span>POs ({job.po_summary?.total || 0})</span>
                  </Link>
                  <Link
                    href={`/jobs/${job.id}/change-orders`}
                    className="px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <FileDiff className="w-3.5 h-3.5" />
                    <span>COs ({job.co_summary?.total || 0})</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
