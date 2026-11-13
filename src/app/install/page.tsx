'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck2,
  RefreshCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sun,
  Moon,
  MapPin,
  Phone,
  Building2,
  UserCheck,
  Inbox,
  Users,
  Briefcase,
  SlidersHorizontal,
  ExternalLink,
} from 'lucide-react';
import InstallCalendarMicroView, {
  CalendarDaySummary,
} from '@/components/InstallCalendarMicroView';

interface InstallTicketRow {
  id: string;
  job_id: string;
  status: string;
  material_eta: string | null;
  site_available_range: string | null;
  site_open_days: string[] | null;
  work_shift: string;
  requested_install_date: string;
  confirmed_install_date: string | null;
  is_priority: boolean;
  priority_reason: string | null;
  site_access_notes: string | null;
  estimated_duration_days: number;
  crew_size_needed: number | null;
  submitted_by: string | null;
  submitted_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  install_dept_notes: string | null;
  assigned_crew: string | null;
  job?: {
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
    project_manager: string | null;
  };
}

export default function InstallDepartmentDashboardPage() {
  const [tickets, setTickets] = useState<InstallTicketRow[]>([]);
  const [calendarSummary, setCalendarSummary] = useState<
    Record<string, CalendarDaySummary>
  >({});
  const [defaultDailyLimit, setDefaultDailyLimit] = useState<number>(3);
  const [limitInput, setLimitInput] = useState<string>('3');
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  const [selectedCalDate, setSelectedCalDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [overrideLimitInput, setOverrideLimitInput] = useState<string>('');
  const [overrideNoteInput, setOverrideNoteInput] = useState<string>('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'priority' | 'confirmed' | 'all'>(
    'pending'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Per-ticket draft confirmation state
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        confirmedDate: string;
        assignedCrew: string;
        installDeptNotes: string;
      }
    >
  >({});
  const [savingTicketId, setSavingTicketId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/install-tickets');
      const data = await res.json();
      if (res.ok) {
        const list: InstallTicketRow[] = data.tickets || [];
        setTickets(list);
        setCalendarSummary(data.calendarSummary || {});
        const limit = data.defaultDailyLimit ?? 3;
        setDefaultDailyLimit(limit);
        setLimitInput(String(limit));

        // Seed drafts
        const nextDrafts: Record<
          string,
          { confirmedDate: string; assignedCrew: string; installDeptNotes: string }
        > = {};
        for (const t of list) {
          nextDrafts[t.id] = {
            confirmedDate: t.confirmed_install_date || t.requested_install_date || '',
            assignedCrew: t.assigned_crew || '',
            installDeptNotes: t.install_dept_notes || '',
          };
        }
        setDrafts(nextDrafts);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const info = calendarSummary[selectedCalDate];
    setOverrideLimitInput(info ? String(info.limit) : String(defaultDailyLimit));
    setOverrideNoteInput(info?.overrideNote || '');
  }, [selectedCalDate, calendarSummary, defaultDailyLimit]);

  const handleSaveDefaultLimit = async () => {
    setIsSavingLimit(true);
    try {
      const res = await fetch('/api/install-calendar/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDailyLimit: Number(limitInput) || 3 }),
      });
      if (res.ok) {
        setFeedbackMsg('Default daily job limit updated.');
        setTimeout(() => setFeedbackMsg(null), 2500);
        await loadData();
      }
    } finally {
      setIsSavingLimit(false);
    }
  };

  const handleSaveDayOverride = async (removeOverride = false) => {
    if (!selectedCalDate) return;
    setIsSavingOverride(true);
    try {
      const res = await fetch('/api/install-calendar/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrideDate: selectedCalDate,
          maxJobs: Number(overrideLimitInput),
          note: overrideNoteInput,
          removeOverride,
        }),
      });
      if (res.ok) {
        setFeedbackMsg(
          removeOverride
            ? `Removed custom override for ${selectedCalDate}.`
            : `Updated capacity for ${selectedCalDate}.`
        );
        setTimeout(() => setFeedbackMsg(null), 2500);
        await loadData();
      }
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleUpdateTicket = async (
    ticketId: string,
    nextStatus: 'confirmed' | 'completed' | 'cancelled' | 'pending'
  ) => {
    const draft = drafts[ticketId];
    setSavingTicketId(ticketId);
    try {
      const res = await fetch(`/api/install-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
          confirmedInstallDate:
            nextStatus === 'confirmed' || nextStatus === 'completed'
              ? draft?.confirmedDate || null
              : null,
          assignedCrew: draft?.assignedCrew || null,
          installDeptNotes: draft?.installDeptNotes || null,
          confirmedBy: nextStatus === 'confirmed' ? 'Install Dept' : undefined,
        }),
      });
      if (res.ok) {
        setFeedbackMsg(
          nextStatus === 'confirmed'
            ? `Install confirmed for ${draft?.confirmedDate || 'selected date'}!`
            : `Ticket marked as ${nextStatus}.`
        );
        setTimeout(() => setFeedbackMsg(null), 3000);
        await loadData();
      }
    } finally {
      setSavingTicketId(null);
    }
  };

  const counts = useMemo(() => {
    const pending = tickets.filter((t) => t.status === 'pending' || t.status === 'rescheduled');
    const priority = pending.filter((t) => t.is_priority);
    const confirmed = tickets.filter((t) => t.status === 'confirmed');
    return {
      pending: pending.length,
      priority: priority.length,
      confirmed: confirmed.length,
      all: tickets.length,
    };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    let list = tickets;
    if (activeTab === 'pending') {
      list = list.filter((t) => t.status === 'pending' || t.status === 'rescheduled');
    } else if (activeTab === 'priority') {
      list = list.filter(
        (t) => (t.status === 'pending' || t.status === 'rescheduled') && t.is_priority
      );
    } else if (activeTab === 'confirmed') {
      list = list.filter((t) => t.status === 'confirmed');
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => {
      const hay = [
        t.job?.job_number,
        t.job?.project_name,
        t.job?.client_company,
        t.job?.client_name,
        t.job?.project_manager,
        t.assigned_crew,
        t.priority_reason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tickets, activeTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <CalendarCheck2 className="w-4 h-4" />
            <span>Installation Department</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Install Scheduling &amp; Dispatch Dashboard
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl">
            Review incoming installation tickets from Project Managers, check daily crew capacity,
            evaluate priority override requests, and confirm final install dates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Dispatch</span>
          </Link>
          <Link
            href="/estimator"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Estimator</span>
          </Link>
          <Link
            href="/jobs"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <span>All Jobs</span>
          </Link>
          <Link
            href="/pm"
            className="px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 text-xs font-bold transition flex items-center gap-1.5 border border-teal-400/30"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>PM Portal</span>
          </Link>
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
            title="Refresh Install Tickets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* KPI & Global Capacity Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-slate-500">
            Pending Tickets
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">{counts.pending}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Awaiting confirmation</div>
        </div>
        <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-rose-600 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Priority / Important
          </div>
          <div className="text-2xl font-black text-rose-700 mt-1">{counts.priority}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Flagged with PM justification
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase text-emerald-700">
            Confirmed Scheduled
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{counts.confirmed}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Locked on calendar</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-2">
          <div className="text-[11px] font-bold uppercase text-slate-500 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
            Daily Job Cap (Default)
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={limitInput}
              onChange={(e) => setLimitInput(e.target.value)}
              className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm font-bold text-slate-900"
            />
            <button
              type="button"
              disabled={isSavingLimit}
              onClick={handleSaveDefaultLimit}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-50"
            >
              {isSavingLimit ? 'Saving...' : 'Save Cap'}
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-column Layout: Calendar + Tickets Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Calendar & Selected Day Override */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
            <InstallCalendarMicroView
              calendarSummary={calendarSummary}
              defaultDailyLimit={defaultDailyLimit}
              selectedDate={selectedCalDate}
              onSelectDate={setSelectedCalDate}
              compact={false}
            />

            {/* Day Override Controls */}
            {selectedCalDate && (
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5 text-xs">
                <div className="font-bold text-slate-800">
                  Adjust Capacity for {selectedCalDate}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Max Jobs
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={overrideLimitInput}
                      onChange={(e) => setOverrideLimitInput(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white font-bold"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Day Note (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Crew training, Holiday..."
                      value={overrideNoteInput}
                      onChange={(e) => setOverrideNoteInput(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border border-slate-300 bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSavingOverride}
                    onClick={() => handleSaveDayOverride(false)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold"
                  >
                    Save Day Limit
                  </button>
                  <button
                    type="button"
                    disabled={isSavingOverride}
                    onClick={() => handleSaveDayOverride(true)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 2 Columns: Incoming Install Tickets */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filter Tabs + Search */}
          <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'pending', label: `Pending (${counts.pending})` },
                  { id: 'priority', label: `Priority (${counts.priority})` },
                  { id: 'confirmed', label: `Confirmed (${counts.confirmed})` },
                  { id: 'all', label: `All (${counts.all})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    activeTab === tab.id
                      ? tab.id === 'priority'
                        ? 'bg-rose-600 text-white'
                        : 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search job, PM, contractor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
              Loading install tickets...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
              No install tickets match the current filter.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTickets.map((ticket) => {
                const draft = drafts[ticket.id] || {
                  confirmedDate:
                    ticket.confirmed_install_date || ticket.requested_install_date || '',
                  assignedCrew: ticket.assigned_crew || '',
                  installDeptNotes: ticket.install_dept_notes || '',
                };

                const targetDayInfo = draft.confirmedDate
                  ? calendarSummary[draft.confirmedDate]
                  : undefined;
                const targetLimit = targetDayInfo?.limit ?? defaultDailyLimit;
                const targetConfirmed = targetDayInfo?.confirmedCount ?? 0;
                const isTargetFull = targetConfirmed >= targetLimit;

                const fullAddr = [
                  ticket.job?.address_street,
                  ticket.job?.address_city,
                  ticket.job?.address_state,
                  ticket.job?.address_zip,
                ]
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={ticket.id}
                    className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 ${
                      ticket.is_priority && ticket.status === 'pending'
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-mono font-bold">
                            {ticket.job?.job_number || 'NO JOB #'}
                          </span>
                          {ticket.is_priority && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              IMPORTANT / PRIORITY
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                              ticket.status === 'confirmed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ticket.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : ticket.status === 'cancelled'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ticket.status}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                              ticket.work_shift === 'Night'
                                ? 'bg-indigo-900 text-indigo-100'
                                : 'bg-sky-100 text-sky-800'
                            }`}
                          >
                            {ticket.work_shift === 'Night' ? (
                              <Moon className="w-3 h-3" />
                            ) : (
                              <Sun className="w-3 h-3" />
                            )}
                            {ticket.work_shift} Work
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-black text-slate-900">
                            {ticket.job?.project_name || 'Untitled Job'}
                          </h3>
                          <Link
                            href={`/jobs/${ticket.job_id}`}
                            className="text-xs text-blue-700 font-bold hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Open Job</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                          {ticket.job?.client_company && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {ticket.job.client_company}
                            </span>
                          )}
                          {ticket.job?.client_name && (
                            <span>
                              POC: <strong>{ticket.job.client_name}</strong>
                              {ticket.job.client_phone ? ` (${ticket.job.client_phone})` : ''}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                            PM: <strong>{ticket.job?.project_manager || ticket.submitted_by || 'Unassigned'}</strong>
                          </span>
                        </div>
                        {fullAddr && (
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span>{fullAddr}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right text-xs shrink-0 space-y-0.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400">
                          Requested Date
                        </div>
                        <div className="text-sm font-black text-slate-900">
                          {ticket.requested_install_date}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Est. {ticket.estimated_duration_days} day(s)
                          {ticket.crew_size_needed ? ` • ${ticket.crew_size_needed} crew` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Priority Reason Banner */}
                    {ticket.is_priority && ticket.priority_reason && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900">
                        <span className="font-black uppercase text-[10px] tracking-wider block text-rose-700 mb-0.5">
                          Why This Day Is Required (PM Priority Note)
                        </span>
                        {ticket.priority_reason}
                      </div>
                    )}

                    {/* Site Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Site Open Days
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(ticket.site_open_days || []).map((d) => (
                            <span
                              key={d}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-300 font-semibold text-slate-700 text-[11px]"
                            >
                              {d}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Material ETA &amp; Site Window
                        </div>
                        <div className="text-slate-700">
                          ETA: <strong>{ticket.material_eta || 'TBD'}</strong>
                        </div>
                        <div className="text-slate-600">
                          Window: {ticket.site_available_range || 'Not specified'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Site Access &amp; PM Notes
                        </div>
                        <div className="text-slate-700 whitespace-pre-wrap">
                          {ticket.site_access_notes || 'None'}
                        </div>
                      </div>
                    </div>

                    {/* Install Dept Confirmation Controls */}
                    <div className="pt-2 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-2.5 items-end text-xs">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Confirm Date{' '}
                          <span
                            className={
                              isTargetFull
                                ? 'text-rose-600 font-black'
                                : 'text-emerald-700 font-bold'
                            }
                          >
                            ({targetConfirmed}/{targetLimit}
                            {isTargetFull ? ' FULL' : ''})
                          </span>
                        </label>
                        <input
                          type="date"
                          value={draft.confirmedDate}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [ticket.id]: { ...draft, confirmedDate: e.target.value },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Assigned Crew / Lead
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Crew A - Mike"
                          value={draft.assignedCrew}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [ticket.id]: { ...draft, assignedCrew: e.target.value },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Install Dept Notes
                        </label>
                        <input
                          type="text"
                          placeholder="Notes back to PM..."
                          value={draft.installDeptNotes}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [ticket.id]: { ...draft, installDeptNotes: e.target.value },
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={savingTicketId === ticket.id || !draft.confirmedDate}
                          onClick={() => handleUpdateTicket(ticket.id, 'confirmed')}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                        >
                          {ticket.status === 'confirmed' ? 'Update' : 'Confirm'}
                        </button>
                        {ticket.status === 'confirmed' && (
                          <button
                            type="button"
                            disabled={savingTicketId === ticket.id}
                            onClick={() => handleUpdateTicket(ticket.id, 'completed')}
                            className="py-1.5 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                          >
                            Done
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
