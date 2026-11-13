'use client';

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export interface CalendarDaySummary {
  confirmedCount: number;
  pendingCount: number;
  limit: number;
  overrideNote: string | null;
  jobs: Array<{
    ticketId: string;
    jobId: string;
    jobNumber: string | null;
    projectName: string;
    status: string;
    workShift: string;
    isPriority: boolean;
  }>;
}

interface InstallCalendarMicroViewProps {
  calendarSummary: Record<string, CalendarDaySummary>;
  defaultDailyLimit: number;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  compact?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatYmd(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export default function InstallCalendarMicroView({
  calendarSummary,
  defaultDailyLimit,
  selectedDate,
  onSelectDate,
  compact = true,
}: InstallCalendarMicroViewProps) {
  const initialDate = useMemo(() => {
    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      const [y, m] = selectedDate.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, []);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const cells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const list: Array<{ day: number | null; dateStr: string | null }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      list.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ day: d, dateStr: formatYmd(viewYear, viewMonth, d) });
    }
    return list;
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectedDayInfo = selectedDate ? calendarSummary[selectedDate] : undefined;
  const selectedLimit = selectedDayInfo?.limit ?? defaultDailyLimit;
  const selectedConfirmed = selectedDayInfo?.confirmedCount ?? 0;
  const selectedPending = selectedDayInfo?.pendingCount ?? 0;
  const selectedIsFull = selectedConfirmed >= selectedLimit;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-700">
            Install Calendar Availability
          </div>
          <div className="text-[10px] text-slate-500">
            Default limit: <strong>{defaultDailyLimit}</strong> jobs/day • Click a day to select
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrevMonth}
            className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
            title="Previous month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-bold text-slate-800 min-w-[110px] text-center">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
            title="Next month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-600">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Open
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Near/Pending Full
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500" /> At Capacity (Full)
        </span>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[10px] font-bold uppercase text-slate-400 py-0.5">
            {w}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.day || !cell.dateStr) {
            return <div key={`empty-${idx}`} className={compact ? 'h-11' : 'h-16'} />;
          }

          const info = calendarSummary[cell.dateStr];
          const confirmed = info?.confirmedCount ?? 0;
          const pending = info?.pendingCount ?? 0;
          const limit = info?.limit ?? defaultDailyLimit;
          const isSelected = selectedDate === cell.dateStr;
          const isFull = confirmed >= limit;
          const isNearFull = !isFull && confirmed + pending >= limit;

          let bgClass = 'bg-white border-slate-200 hover:border-blue-400 text-slate-800';
          let badgeClass = 'text-emerald-700 bg-emerald-50';
          if (isFull) {
            bgClass = 'bg-rose-50 border-rose-300 hover:border-rose-500 text-rose-900';
            badgeClass = 'text-rose-800 bg-rose-200/70 font-black';
          } else if (isNearFull) {
            bgClass = 'bg-amber-50 border-amber-300 hover:border-amber-500 text-amber-900';
            badgeClass = 'text-amber-800 bg-amber-200/70 font-bold';
          }

          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr!)}
              className={`${
                compact ? 'h-11 p-1' : 'h-16 p-1.5'
              } rounded-lg border text-left flex flex-col justify-between transition relative ${bgClass} ${
                isSelected ? 'ring-2 ring-blue-600 border-blue-600 z-10' : ''
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-bold leading-none">{cell.day}</span>
                {pending > 0 && (
                  <span
                    className="text-[9px] font-bold text-amber-700"
                    title={`${pending} pending request(s)`}
                  >
                    +{pending}p
                  </span>
                )}
              </div>
              <div
                className={`text-[9px] px-1 rounded text-center leading-tight ${badgeClass}`}
              >
                {confirmed}/{limit}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail strip */}
      {selectedDate && (
        <div
          className={`p-2.5 rounded-lg border text-xs space-y-1 ${
            selectedIsFull
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold flex items-center gap-1.5">
              {selectedIsFull ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              <span>
                {selectedDate}: {selectedConfirmed}/{selectedLimit} confirmed
                {selectedPending > 0 ? ` • ${selectedPending} pending` : ''}
              </span>
            </span>
            {selectedIsFull && (
              <span className="px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px] font-black uppercase">
                Day Full
              </span>
            )}
          </div>
          {selectedDayInfo?.overrideNote && (
            <div className="text-[11px] text-slate-600 italic">
              Calendar note: {selectedDayInfo.overrideNote}
            </div>
          )}
          {selectedDayInfo && selectedDayInfo.jobs.length > 0 && (
            <div className="pt-1 space-y-0.5">
              {selectedDayInfo.jobs.map((j) => (
                <div
                  key={j.ticketId}
                  className="flex items-center justify-between text-[11px] text-slate-600"
                >
                  <span className="truncate">
                    • {j.jobNumber ? `${j.jobNumber} — ` : ''}
                    {j.projectName} ({j.workShift})
                  </span>
                  <span className="shrink-0 ml-2 inline-flex items-center gap-1 text-[10px] font-semibold">
                    {j.status === 'confirmed' ? (
                      <span className="text-emerald-700">Confirmed</span>
                    ) : (
                      <span className="text-amber-700 inline-flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> Pending
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
