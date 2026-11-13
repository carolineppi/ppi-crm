'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Plus,
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserCheck,
  Phone,
  Mail,
  Sun,
  Moon,
  Clock,
  CheckCircle2,
  X,
  Inbox,
  Briefcase,
  CalendarCheck2,
  Trash2,
  Edit3,
} from 'lucide-react';
import {
  DAY_KEYS,
  DEFAULT_WEEKLY_AVAILABILITY,
  DayKey,
  InstallerRecord,
  ShiftOption,
  WeeklyAvailability,
  getInstallerAvailabilityForDate,
} from '@/lib/installers/availability';

function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function InstallersCalendarPage() {
  const [installers, setInstallers] = useState<InstallerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'employee' | 'subcontractor'>('all');

  // 14-day window starting from Monday
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));

  // Add Installer form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'employee' | 'subcontractor'>('employee');
  const [newCompany, setNewCompany] = useState('');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newWeekly, setNewWeekly] = useState<WeeklyAvailability>(() =>
    JSON.parse(JSON.stringify(DEFAULT_WEEKLY_AVAILABILITY))
  );
  const [isSavingNew, setIsSavingNew] = useState(false);

  // Edit Weekly Availability modal
  const [editingInstaller, setEditingInstaller] = useState<InstallerRecord | null>(null);
  const [editWeekly, setEditWeekly] = useState<WeeklyAvailability>(DEFAULT_WEEKLY_AVAILABILITY);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);

  // Date Override modal
  const [overrideTarget, setOverrideTarget] = useState<{
    installer: InstallerRecord;
    dateStr: string;
    isAvailable: boolean;
    shift: ShiftOption;
    startTime: string;
    endTime: string;
    note: string;
    hasExistingOverride: boolean;
  } | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadInstallers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/installers');
      const data = await res.json();
      if (res.ok) {
        setInstallers(data.installers || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadInstallers();
  }, []);

  const calendarDays = useMemo(() => {
    const days: Array<{ dateStr: string; label: string; dayName: string; isWeekend: boolean }> = [];
    for (let i = 0; i < 14; i++) {
      const dt = new Date(weekStart);
      dt.setDate(dt.getDate() + i);
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      const label = dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      days.push({
        dateStr: toYmd(dt),
        label,
        dayName,
        isWeekend: dt.getDay() === 0 || dt.getDay() === 6,
      });
    }
    return days;
  }, [weekStart]);

  const shiftWeek = (deltaDays: number) => {
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });
  };

  const handleCreateInstaller = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSavingNew(true);
    try {
      const res = await fetch('/api/installers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          employmentType: newType,
          companyName: newCompany,
          specialty: newSpecialty,
          phone: newPhone,
          email: newEmail,
          defaultWeeklyAvailability: newWeekly,
        }),
      });
      if (res.ok) {
        setNewName('');
        setNewCompany('');
        setNewSpecialty('');
        setNewPhone('');
        setNewEmail('');
        setNewWeekly(JSON.parse(JSON.stringify(DEFAULT_WEEKLY_AVAILABILITY)));
        setShowAddForm(false);
        setFeedbackMsg('Installer added to roster & calendar.');
        setTimeout(() => setFeedbackMsg(null), 2500);
        await loadInstallers();
      }
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleSaveWeekly = async () => {
    if (!editingInstaller) return;
    setIsSavingWeekly(true);
    try {
      const res = await fetch(`/api/installers/${editingInstaller.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultWeeklyAvailability: editWeekly }),
      });
      if (res.ok) {
        setEditingInstaller(null);
        setFeedbackMsg('Updated recurring weekly availability.');
        setTimeout(() => setFeedbackMsg(null), 2500);
        await loadInstallers();
      }
    } finally {
      setIsSavingWeekly(false);
    }
  };

  const handleSaveDateOverride = async (remove = false) => {
    if (!overrideTarget) return;
    setIsSavingOverride(true);
    try {
      const res = await fetch(`/api/installers/${overrideTarget.installer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateOverride: {
            overrideDate: overrideTarget.dateStr,
            isAvailable: overrideTarget.isAvailable,
            shift: overrideTarget.shift,
            startTime: overrideTarget.startTime,
            endTime: overrideTarget.endTime,
            note: overrideTarget.note,
            remove,
          },
        }),
      });
      if (res.ok) {
        setOverrideTarget(null);
        setFeedbackMsg(
          remove ? 'Reset day to recurring weekly schedule.' : 'Saved date-specific availability.'
        );
        setTimeout(() => setFeedbackMsg(null), 2500);
        await loadInstallers();
      }
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleDeleteInstaller = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the installer roster?`)) return;
    await fetch(`/api/installers/${id}`, { method: 'DELETE' });
    await loadInstallers();
  };

  const filteredInstallers = useMemo(() => {
    if (typeFilter === 'all') return installers;
    return installers.filter((i) => i.employment_type === typeFilter);
  }, [installers, typeFilter]);

  const employeeCount = installers.filter((i) => i.employment_type === 'employee').length;
  const subCount = installers.filter((i) => i.employment_type === 'subcontractor').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-teal-300 text-xs font-bold uppercase tracking-wider">
            <CalendarDays className="w-4 h-4" />
            <span>Installer Availability Calendar</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Installers &amp; Subcontractor Schedule
          </h1>
          <p className="text-xs text-slate-300 max-w-2xl">
            Manage contracted employees and subcontractor crews, set each installer&apos;s recurring
            weekly days &amp; shifts, and view or override day-by-day availability and job
            assignments.
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
            href="/pm"
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/10"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>PM Portal</span>
          </Link>
          <Link
            href="/install"
            className="px-3.5 py-2 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/40 text-indigo-100 text-xs font-bold transition flex items-center gap-1.5 border border-indigo-400/40"
          >
            <CalendarCheck2 className="w-3.5 h-3.5" />
            <span>Install Dept Board</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-black transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Installer / Sub</span>
          </button>
          <button
            type="button"
            onClick={loadInstallers}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10"
            title="Refresh"
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

      {/* Add Installer Form */}
      {showAddForm && (
        <form
          onSubmit={handleCreateInstaller}
          className="bg-white rounded-2xl border border-teal-200 p-5 shadow-sm space-y-4 text-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">
              Add Contracted Employee or Subcontractor
            </h2>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Installer / Crew Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mike Torres or Apex Installers"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Employment Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as 'employee' | 'subcontractor')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                <option value="employee">Contracted Employee</option>
                <option value="subcontractor">Subcontractor</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Subcontractor Company (if applicable)
              </label>
              <input
                type="text"
                placeholder="e.g. Summit Door & Hardware LLC"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Specialty / Trade
              </label>
              <input
                type="text"
                placeholder="e.g. Doors & Frames, Access Control"
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Phone
              </label>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Email
              </label>
              <input
                type="email"
                placeholder="installer@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Recurring Weekly Availability
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
              {DAY_KEYS.map((day) => {
                const cfg = newWeekly[day];
                return (
                  <div
                    key={day}
                    className={`p-2.5 rounded-xl border space-y-1.5 ${
                      cfg.available
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <label className="flex items-center justify-between font-bold text-slate-800 cursor-pointer">
                      <span>{day}</span>
                      <input
                        type="checkbox"
                        checked={cfg.available}
                        onChange={(e) =>
                          setNewWeekly((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], available: e.target.checked },
                          }))
                        }
                      />
                    </label>
                    {cfg.available && (
                      <>
                        <select
                          value={cfg.shift}
                          onChange={(e) =>
                            setNewWeekly((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], shift: e.target.value as ShiftOption },
                            }))
                          }
                          className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-[11px]"
                        >
                          <option value="Day">Day</option>
                          <option value="Night">Night</option>
                          <option value="Both">Day &amp; Night</option>
                        </select>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            value={cfg.start || '07:00'}
                            onChange={(e) =>
                              setNewWeekly((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], start: e.target.value },
                              }))
                            }
                            className="w-full px-1 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                            placeholder="07:00"
                          />
                          <input
                            type="text"
                            value={cfg.end || '16:00'}
                            onChange={(e) =>
                              setNewWeekly((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], end: e.target.value },
                              }))
                            }
                            className="w-full px-1 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                            placeholder="16:00"
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingNew || !newName.trim()}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold disabled:opacity-50"
            >
              {isSavingNew ? 'Saving...' : 'Save Installer'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Calendar Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              typeFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({installers.length})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('employee')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              typeFilter === 'employee'
                ? 'bg-teal-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Contracted Employees ({employeeCount})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('subcontractor')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
              typeFilter === 'subcontractor'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Subcontractors ({subCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            title="Previous Week"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(getMondayOfWeek(new Date()))}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700"
          >
            This Week
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
            title="Next Week"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 14-Day Installer Availability Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-800">
            2-Week Installer Availability Grid (click any day cell to set an override)
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-200 border border-emerald-400" />
              Available
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-blue-200 border border-blue-400" />
              Assigned to Job
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-300" />
              Off / Unavailable
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            Loading installer calendar...
          </div>
        ) : filteredInstallers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500">
              No installers added yet. Click <strong>&ldquo;+ Add Installer / Sub&rdquo;</strong>{' '}
              above to add your employees and subcontractors.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1100px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-3 font-black text-slate-700 w-60 sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                    Installer / Crew
                  </th>
                  {calendarDays.map((d) => (
                    <th
                      key={d.dateStr}
                      className={`p-2 text-center border-r border-slate-100 min-w-[76px] ${
                        d.isWeekend ? 'bg-slate-100/80 text-slate-400' : 'text-slate-700'
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase">{d.dayName}</div>
                      <div className="text-xs font-black">{d.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInstallers.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-50/40">
                    <td className="p-3 sticky left-0 bg-white z-10 border-r border-slate-200 align-top">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-900">{inst.name}</div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                inst.employment_type === 'subcontractor'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-teal-100 text-teal-800'
                              }`}
                            >
                              {inst.employment_type === 'subcontractor' ? 'Subcontractor' : 'Employee'}
                            </span>
                            {inst.company_name && (
                              <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                {inst.company_name}
                              </span>
                            )}
                          </div>
                          {inst.specialty && (
                            <div className="text-[10px] text-slate-500">{inst.specialty}</div>
                          )}
                          {inst.phone && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5" /> {inst.phone}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInstaller(inst);
                              setEditWeekly(
                                inst.default_weekly_availability || DEFAULT_WEEKLY_AVAILABILITY
                              );
                            }}
                            title="Edit weekly schedule"
                            className="p-1 rounded border border-slate-200 text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInstaller(inst.id, inst.name)}
                            title="Remove installer"
                            className="p-1 rounded border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {calendarDays.map((d) => {
                      const avail = getInstallerAvailabilityForDate(inst, d.dateStr);
                      const dayAssignments = (inst.assignments || []).filter(
                        (a) => a.date === d.dateStr
                      );
                      const hasOverride = Boolean(
                        inst.overrides?.some((o) => o.override_date === d.dateStr)
                      );

                      let cellStyle =
                        'bg-slate-100/70 text-slate-400 hover:bg-slate-200/70';
                      if (dayAssignments.length > 0) {
                        cellStyle =
                          'bg-blue-50 text-blue-900 border-blue-200 hover:bg-blue-100';
                      } else if (avail.available) {
                        cellStyle =
                          'bg-emerald-50 text-emerald-900 hover:bg-emerald-100';
                      }

                      return (
                        <td
                          key={d.dateStr}
                          className="p-1 border-r border-slate-100 align-top"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOverrideTarget({
                                installer: inst,
                                dateStr: d.dateStr,
                                isAvailable: avail.available,
                                shift: avail.shift,
                                startTime: avail.start || '07:00',
                                endTime: avail.end || '16:00',
                                note: avail.note || '',
                                hasExistingOverride: hasOverride,
                              })
                            }
                            className={`w-full min-h-[54px] rounded-lg p-1.5 text-left transition flex flex-col justify-between ${cellStyle} ${
                              hasOverride ? 'ring-1 ring-amber-400' : ''
                            }`}
                          >
                            {dayAssignments.length > 0 ? (
                              <div className="space-y-0.5">
                                {dayAssignments.map((a) => (
                                  <div
                                    key={a.ticketId}
                                    className="text-[10px] font-bold leading-tight truncate bg-blue-600 text-white px-1 py-0.5 rounded"
                                    title={`${a.jobNumber || ''} ${a.projectName}`}
                                  >
                                    {a.jobNumber || a.projectName}
                                  </div>
                                ))}
                              </div>
                            ) : avail.available ? (
                              <>
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                  <span className="inline-flex items-center gap-0.5">
                                    {avail.shift === 'Night' ? (
                                      <Moon className="w-2.5 h-2.5 text-indigo-700" />
                                    ) : (
                                      <Sun className="w-2.5 h-2.5 text-amber-600" />
                                    )}
                                    {avail.shift}
                                  </span>
                                  {hasOverride && (
                                    <span className="text-[8px] px-1 rounded bg-amber-200 text-amber-900">
                                      OVR
                                    </span>
                                  )}
                                </div>
                                {(avail.start || avail.end) && (
                                  <div className="text-[9px] text-emerald-700">
                                    {avail.start}-{avail.end}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center justify-between text-[10px]">
                                <span>Off</span>
                                {hasOverride && (
                                  <span className="text-[8px] px-1 rounded bg-amber-200 text-amber-900">
                                    OVR
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Weekly Schedule Modal */}
      {editingInstaller && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">
                Recurring Weekly Schedule — {editingInstaller.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingInstaller(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {DAY_KEYS.map((day) => {
                const cfg = editWeekly[day] || { available: false, shift: 'Day' };
                return (
                  <div
                    key={day}
                    className={`p-2.5 rounded-xl border space-y-1.5 ${
                      cfg.available
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <label className="flex items-center justify-between font-bold text-slate-800 cursor-pointer">
                      <span>{day}</span>
                      <input
                        type="checkbox"
                        checked={cfg.available}
                        onChange={(e) =>
                          setEditWeekly((prev) => ({
                            ...prev,
                            [day]: { ...prev[day], available: e.target.checked },
                          }))
                        }
                      />
                    </label>
                    {cfg.available && (
                      <>
                        <select
                          value={cfg.shift}
                          onChange={(e) =>
                            setEditWeekly((prev) => ({
                              ...prev,
                              [day]: { ...prev[day], shift: e.target.value as ShiftOption },
                            }))
                          }
                          className="w-full px-1.5 py-1 rounded border border-slate-300 bg-white text-[11px]"
                        >
                          <option value="Day">Day</option>
                          <option value="Night">Night</option>
                          <option value="Both">Day &amp; Night</option>
                        </select>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            value={cfg.start || '07:00'}
                            onChange={(e) =>
                              setEditWeekly((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], start: e.target.value },
                              }))
                            }
                            className="w-full px-1 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                          />
                          <input
                            type="text"
                            value={cfg.end || '16:00'}
                            onChange={(e) =>
                              setEditWeekly((prev) => ({
                                ...prev,
                                [day]: { ...prev[day], end: e.target.value },
                              }))
                            }
                            className="w-full px-1 py-0.5 rounded border border-slate-300 bg-white text-[10px]"
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingInstaller(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingWeekly}
                onClick={handleSaveWeekly}
                className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold disabled:opacity-50"
              >
                {isSavingWeekly ? 'Saving...' : 'Save Weekly Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {overrideTarget.installer.name} — {overrideTarget.dateStr}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Set a date-specific availability override
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <input
                type="checkbox"
                checked={overrideTarget.isAvailable}
                onChange={(e) =>
                  setOverrideTarget({ ...overrideTarget, isAvailable: e.target.checked })
                }
              />
              <span>Available to work on {overrideTarget.dateStr}</span>
            </label>

            {overrideTarget.isAvailable && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Shift
                  </label>
                  <select
                    value={overrideTarget.shift}
                    onChange={(e) =>
                      setOverrideTarget({
                        ...overrideTarget,
                        shift: e.target.value as ShiftOption,
                      })
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Day">Day</option>
                    <option value="Night">Night</option>
                    <option value="Both">Day &amp; Night</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Start
                  </label>
                  <input
                    type="text"
                    value={overrideTarget.startTime}
                    onChange={(e) =>
                      setOverrideTarget({ ...overrideTarget, startTime: e.target.value })
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    End
                  </label>
                  <input
                    type="text"
                    value={overrideTarget.endTime}
                    onChange={(e) =>
                      setOverrideTarget({ ...overrideTarget, endTime: e.target.value })
                    }
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Note (e.g. PTO, Half-day, Available for night shift)
              </label>
              <input
                type="text"
                value={overrideTarget.note}
                onChange={(e) =>
                  setOverrideTarget({ ...overrideTarget, note: e.target.value })
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {overrideTarget.hasExistingOverride ? (
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => handleSaveDateOverride(true)}
                  className="px-3 py-2 rounded-xl border border-rose-200 text-rose-700 font-bold hover:bg-rose-50"
                >
                  Reset to Default
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideTarget(null)}
                  className="px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => handleSaveDateOverride(false)}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold disabled:opacity-50"
                >
                  {isSavingOverride ? 'Saving...' : 'Save Override'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
