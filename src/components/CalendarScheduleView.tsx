'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  Users,
  Sparkles,
  CheckCircle,
  AlertCircle,
  FileText,
  Hash,
  Filter,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import {
  formatFriendlyDate,
  getDueDateStatus,
  getEstimatorColor,
  normalizeDateToYyyyMmDd,
} from '@/lib/date-utils';

export interface CalendarBidItem {
  id: string;
  bidNumber: string | null;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam' | 'General';
  assignedEstimator: string | null;
  bidDueDate?: string | null; // YYYY-MM-DD
  rawAiDueDate?: string | null;
  normalizedAiDueDate?: string | null;
  scopeSummary?: string | null;
  projectName?: string | null;
  clientCompany?: string | null;
  attachmentsCount?: number;
  [key: string]: any;
}

interface CalendarScheduleViewProps {
  bids: any[];
  estimators: string[];
  onSelectBid: (bid: any) => void;
  onAssignBid: (bidId: string, estimator: string, dueDate: string | null) => Promise<void>;
}

export default function CalendarScheduleView({
  bids,
  estimators,
  onSelectBid,
  onAssignBid,
}: CalendarScheduleViewProps) {
  // Determine starting month: pick the month with active bids, or current month (November 2026)
  const [currentDate, setCurrentDate] = useState(() => {
    // If bids have dates, default to November 2026 or current active month
    const validBid = bids.find((b) => b.bidDueDate);
    if (validBid && validBid.bidDueDate) {
      const [y, m] = validBid.bidDueDate.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  const [filterEstimator, setFilterEstimator] = useState<string>('ALL');
  const [showUnscheduledDrawer, setShowUnscheduledDrawer] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const jumpToToday = () => {
    setCurrentDate(new Date());
  };

  // 1. Group bids by YYYY-MM-DD
  const { bidsByDate, unscheduledBids, monthEstimatorCounts } = useMemo(() => {
    const byDate: Record<string, CalendarBidItem[]> = {};
    const unscheduled: CalendarBidItem[] = [];
    const estimatorCounts: Record<string, number> = {
      'Unassigned': 0,
    };
    estimators.forEach((est) => {
      estimatorCounts[est] = 0;
    });

    bids.forEach((bid) => {
      // We primarily track ITBs and active bids
      if (bid.sticker === 'Spam') return;

      const effectiveDate = bid.bidDueDate || bid.normalizedAiDueDate;

      if (!effectiveDate) {
        unscheduled.push(bid);
        return;
      }

      byDate[effectiveDate] = byDate[effectiveDate] || [];
      byDate[effectiveDate].push(bid);

      // If bid falls in currently viewed month, count it for workload summary
      const [bYear, bMonth] = effectiveDate.split('-').map(Number);
      if (bYear === year && bMonth === month + 1) {
        const est = bid.assignedEstimator || 'Unassigned';
        estimatorCounts[est] = (estimatorCounts[est] || 0) + 1;
      }
    });

    return { bidsByDate: byDate, unscheduledBids: unscheduled, monthEstimatorCounts: estimatorCounts };
  }, [bids, estimators, year, month]);

  // 2. Generate Calendar Matrix (Weeks x 7 Days)
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon...
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const ymd = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateNumber: dayNum,
        ymd,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let dayNum = 1; dayNum <= daysInCurrentMonth; dayNum++) {
      const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateNumber: dayNum,
        ymd,
        isCurrentMonth: true,
        isToday: ymd === todayYmd,
      });
    }

    // Next month padding days to complete full 7-day rows (up to 35 or 42)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextDate = new Date(year, month + 1, dayNum);
      const ymd = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateNumber: dayNum,
        ymd,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return days;
  }, [year, month]);

  // Total scheduled bids this month
  const totalScheduledInMonth = Object.values(monthEstimatorCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      {/* Top Header & Calendar Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Month Navigation */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={prevMonth}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors shadow-2xs"
              title="Previous Month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={jumpToToday}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-colors shadow-2xs"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors shadow-2xs"
              title="Next Month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-blue-600" />
              {monthName}
            </h2>
            <span className="text-xs text-slate-500 font-medium">
              {totalScheduledInMonth} Bid{totalScheduledInMonth === 1 ? '' : 's'} Due This Month
            </span>
          </div>
        </div>

        {/* Right: Estimator Filter Pills & Unscheduled Trigger */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-400 font-bold px-2 uppercase text-[10px] tracking-wider">
              Estimator:
            </span>

            <button
              onClick={() => setFilterEstimator('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                filterEstimator === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalScheduledInMonth})
            </button>

            {estimators.map((est) => {
              const count = monthEstimatorCounts[est] || 0;
              const color = getEstimatorColor(est);
              const isSelected = filterEstimator === est;
              return (
                <button
                  key={est}
                  onClick={() => setFilterEstimator(est)}
                  className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? `${color.pillBg} ${color.pillText} border ${color.pillBorder} shadow-xs font-bold ring-2 ring-blue-300`
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${color.dotBg}`} />
                  <span>{est.split(' ')[0]}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              );
            })}

            <button
              onClick={() => setFilterEstimator('Unassigned')}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
                filterEstimator === 'Unassigned'
                  ? 'bg-rose-100 text-rose-900 border border-rose-300 shadow-xs font-bold ring-2 ring-rose-300'
                  : 'text-slate-600 hover:bg-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Unassigned</span>
              <span className="text-[10px] opacity-75 font-mono">
                ({monthEstimatorCounts['Unassigned'] || 0})
              </span>
            </button>
          </div>

          {/* Unscheduled Inbound Drawer Trigger */}
          <button
            onClick={() => setShowUnscheduledDrawer(!showUnscheduledDrawer)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              unscheduledBids.length > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs'
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Unscheduled ({unscheduledBids.length})</span>
          </button>
        </div>
      </div>

      {/* Estimator Workload Balance Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-2 sm:grid-cols-5 gap-3">
        {estimators.map((est) => {
          const count = monthEstimatorCounts[est] || 0;
          const color = getEstimatorColor(est);
          return (
            <div
              key={est}
              onClick={() => setFilterEstimator(est)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                filterEstimator === est
                  ? `${color.pillBg} border-${color.pillBorder} ring-2 ring-blue-300 shadow-xs`
                  : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${color.dotBg}`} />
                  {est}
                </span>
                <span className="text-xs font-black text-slate-900 font-mono bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
                  {count}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                {count === 0 ? 'No bids scheduled' : `${count} bid${count === 1 ? '' : 's'} assigned this month`}
              </p>
            </div>
          );
        })}

        <div
          onClick={() => setFilterEstimator('Unassigned')}
          className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
            filterEstimator === 'Unassigned'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-300 shadow-xs'
              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Needs Estimator
            </span>
            <span className="text-xs font-black text-rose-700 font-mono bg-white px-2 py-0.5 rounded border border-slate-200 shadow-2xs">
              {monthEstimatorCounts['Unassigned'] || 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Scheduled dates with no estimator
          </p>
        </div>
      </div>

      {/* Main 7-Column Calendar Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Day-of-week Column Headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-xs font-bold text-slate-600">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-2.5 border-r border-slate-200 last:border-r-0 uppercase tracking-wider text-[11px]">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Day Cells */}
        <div className="grid grid-cols-7 divide-y divide-slate-200 border-b border-slate-200">
          {calendarDays.map((day, idx) => {
            const allDayBids = bidsByDate[day.ymd] || [];
            const dayBids = allDayBids.filter((b) => {
              if (filterEstimator === 'ALL') return true;
              if (filterEstimator === 'Unassigned') return !b.assignedEstimator;
              return b.assignedEstimator === filterEstimator;
            });

            return (
              <div
                key={idx}
                className={`min-h-[130px] p-2 border-r border-slate-200 last:border-r-0 flex flex-col transition-colors ${
                  day.isCurrentMonth ? 'bg-white' : 'bg-slate-50/40 text-slate-400'
                } ${day.isToday ? 'bg-blue-50/30' : ''}`}
              >
                {/* Cell Header: Date Number & Count Badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-bold rounded-full w-6 h-6 ${
                      day.isToday
                        ? 'bg-blue-600 text-white shadow-xs font-black'
                        : day.isCurrentMonth
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {day.dateNumber}
                  </span>

                  {dayBids.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                      {dayBids.length}
                    </span>
                  )}
                </div>

                {/* List of Bid Cards on this Day */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[140px] pr-0.5">
                  {dayBids.map((bid) => {
                    const estColor = getEstimatorColor(bid.assignedEstimator);
                    const isITB = bid.sticker === 'ITB';

                    return (
                      <div
                        key={bid.id}
                        onClick={() => onSelectBid(bid)}
                        className={`p-1.5 rounded-lg border text-left text-xs bg-white hover:bg-slate-50/80 cursor-pointer shadow-2xs transition-all hover:shadow-xs border-l-4 ${estColor.cardBorder} border-t-slate-200 border-r-slate-200 border-b-slate-200 group`}
                        title={`Click to review: ${bid.subject}`}
                      >
                        {/* Bid Number & Sticker */}
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-mono text-[10px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {bid.bidNumber || (isITB ? 'ITB (Pending #)' : bid.sticker)}
                          </span>
                          {bid.sticker !== 'ITB' && (
                            <span className="text-[9px] px-1 rounded uppercase font-bold bg-purple-100 text-purple-800">
                              {bid.sticker}
                            </span>
                          )}
                        </div>

                        {/* Subject Snippet */}
                        <p className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-tight">
                          {bid.projectName || bid.subject}
                        </p>

                        {/* Estimator Pill */}
                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${estColor.pillBg} ${estColor.pillText}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${estColor.dotBg}`} />
                            {bid.assignedEstimator ? bid.assignedEstimator.split(' ')[0] : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Unscheduled Bids Drawer / Tray */}
      {showUnscheduledDrawer && (
        <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-700" />
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  Unscheduled Inbound Opportunities ({unscheduledBids.length})
                </h3>
                <p className="text-xs text-amber-800">
                  These bids need a confirmed calendar due date and estimator assignment.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowUnscheduledDrawer(false)}
              className="text-xs font-semibold text-amber-800 hover:text-amber-950 px-2.5 py-1 rounded bg-amber-100"
            >
              Hide Unscheduled
            </button>
          </div>

          {unscheduledBids.length === 0 ? (
            <p className="text-xs text-amber-800 italic">
              All inbound opportunities are currently scheduled on the calendar!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {unscheduledBids.map((bid) => {
                const hasAiSuggestion = Boolean(bid.normalizedAiDueDate);
                return (
                  <div
                    key={bid.id}
                    className="p-3 bg-white rounded-xl border border-amber-200/80 shadow-2xs space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {bid.bidNumber || bid.sticker}
                        </span>
                        <span className="text-slate-400">{bid.receivedAt}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                        {bid.subject}
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        Client: {bid.senderName}
                      </p>

                      {hasAiSuggestion && (
                        <div className="mt-2 p-1.5 rounded bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-900 flex items-center justify-between">
                          <span className="flex items-center gap-1 font-semibold">
                            <Sparkles className="w-3 h-3 text-indigo-600" />
                            AI Suggested: {formatFriendlyDate(bid.normalizedAiDueDate)}
                          </span>
                          <button
                            onClick={() =>
                              onAssignBid(bid.id, bid.assignedEstimator || '', bid.normalizedAiDueDate || null)
                            }
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] hover:bg-indigo-700 shadow-2xs"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">
                        {bid.assignedEstimator ? `Assigned: ${bid.assignedEstimator}` : 'Unassigned'}
                      </span>
                      <button
                        onClick={() => onSelectBid(bid)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <span>Schedule</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
