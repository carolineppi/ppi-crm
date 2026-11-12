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
  Building2,
  Filter,
  ArrowRight,
  Paperclip,
  Check,
  CalendarDays,
  Layers,
  FolderArchive,
  ExternalLink,
  Upload,
  PlusCircle,
} from 'lucide-react';
import CalendarImportModal from './CalendarImportModal';
import CalendarAddBidModal from './CalendarAddBidModal';
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
  sticker: string;
  assignedEstimator: string | null;
  bidDueDate?: string | null; // YYYY-MM-DD
  bidDueTime?: string | null;
  rawAiDueDate?: string | null;
  normalizedAiDueDate?: string | null;
  scopeSummary?: string | null;
  projectName?: string | null;
  clientCompany?: string | null;
  projectAddress?: string | null;
  attachmentsCount?: number;
  [key: string]: any;
}

interface CalendarScheduleViewProps {
  bids: any[];
  estimators: string[];
  onSelectBid: (bid: any) => void;
  onAssignBid: (bidId: string, estimator: string, dueDate: string | null) => Promise<void>;
  onBidsChanged?: () => void;
  onNotify?: (message: string) => void;
}

/**
 * Returns Monday of the week for any given date
 */
function getMondayOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 is Sunday, 1 is Monday...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function CalendarScheduleView({
  bids,
  estimators,
  onSelectBid,
  onAssignBid,
  onBidsChanged,
  onNotify,
}: CalendarScheduleViewProps) {
  // 1. STRICT FILTER: Only ITBs in the calendar view
  const itbBids = useMemo(() => {
    return bids.filter((b) => {
      const isITB = b.sticker === 'ITB';
      if (!isITB) return false;
      if (b.sticker === 'Spam' || b.filterStatus === 'auto_filtered' || b.filterStatus === 'duplicate_folder') return false;
      return true;
    });
  }, [bids]);

  // Start on current week
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const [filterEstimator, setFilterEstimator] = useState<string>('ALL');
  const [showWeekends, setShowWeekends] = useState<boolean>(true);
  const [showUnscheduledDrawer, setShowUnscheduledDrawer] = useState<boolean>(false);
  const [isAssigningInline, setIsAssigningInline] = useState<Record<string, boolean>>({});
  const [draggedBidId, setDraggedBidId] = useState<string | null>(null);
  const [dragOverYmd, setDragOverYmd] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showAddBidModal, setShowAddBidModal] = useState<boolean>(false);

  const parseDueTimeMinutes = (timeStr?: string | null): number => {
    if (!timeStr) return 9999;
    const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return 9999;
    let hours = parseInt(match[1], 10);
    const mins = parseInt(match[2] || '0', 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  };

  const handleDropOnDay = async (e: React.DragEvent, targetYmd: string) => {
    e.preventDefault();
    setDragOverYmd(null);
    const bidId = e.dataTransfer.getData('text/plain') || draggedBidId;
    setDraggedBidId(null);
    if (!bidId) return;

    const bid = itbBids.find((b) => b.id === bidId);
    if (!bid) return;
    const currentYmd = bid.bidDueDate || bid.normalizedAiDueDate;
    if (currentYmd === targetYmd) return;

    setIsAssigningInline((prev) => ({ ...prev, [bid.id]: true }));
    try {
      await onAssignBid(bid.id, bid.assignedEstimator || '', targetYmd);
    } finally {
      setIsAssigningInline((prev) => ({ ...prev, [bid.id]: false }));
    }
  };

  // Navigation handlers
  const prevWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() - 7);
    setCurrentDate(next);
  };

  const nextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 7);
    setCurrentDate(next);
  };

  const jumpToToday = () => {
    setCurrentDate(new Date());
  };

  // 2. Generate the 5-day or 7-day Week Columns
  const mondayOfWeek = useMemo(() => getMondayOfWeek(currentDate), [currentDate]);

  const todayYmd = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  const weekDays = useMemo(() => {
    const days = [];
    const count = showWeekends ? 7 : 5;

    for (let i = 0; i < count; i++) {
      const d = new Date(mondayOfWeek);
      d.setDate(mondayOfWeek.getDate() + i);
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({
        date: d,
        ymd,
        dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayFullName: d.toLocaleDateString('en-US', { weekday: 'long' }),
        formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        dateNumber: d.getDate(),
        isToday: ymd === todayYmd,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      });
    }

    return days;
  }, [mondayOfWeek, showWeekends, todayYmd]);

  // Week range label (e.g. "Nov 9 – Nov 15, 2026")
  const weekRangeLabel = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[weekDays.length - 1].date;

    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const year = end.getFullYear();

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
    }
    return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
  }, [weekDays]);

  // 3. Group ITBs by YYYY-MM-DD & Compute Week Estimator Workload
  const { bidsByDate, unscheduledBids, weekEstimatorCounts, totalScheduledThisWeek } = useMemo(() => {
    const byDate: Record<string, CalendarBidItem[]> = {};
    const unscheduled: CalendarBidItem[] = [];
    const estimatorCounts: Record<string, number> = {
      Unassigned: 0,
      'Not Bidding': 0,
    };
    estimators.forEach((est) => {
      estimatorCounts[est] = 0;
    });

    const weekYmdSet = new Set(weekDays.map((w) => w.ymd));
    let scheduledThisWeek = 0;

    itbBids.forEach((bid) => {
      const effectiveDate = bid.bidDueDate || bid.normalizedAiDueDate;

      if (!effectiveDate) {
        unscheduled.push(bid);
        return;
      }

      byDate[effectiveDate] = byDate[effectiveDate] || [];
      byDate[effectiveDate].push(bid);

      // If bid falls within currently viewed week, increment workload stats
      if (weekYmdSet.has(effectiveDate)) {
        scheduledThisWeek++;
        const isNotBid = bid.assignedEstimator === 'Not Bidding' || bid.estimatorStatus === 'no_bid';
        const est = isNotBid ? 'Not Bidding' : (bid.assignedEstimator || 'Unassigned');
        estimatorCounts[est] = (estimatorCounts[est] || 0) + 1;
      }
    });

    return {
      bidsByDate: byDate,
      unscheduledBids: unscheduled,
      weekEstimatorCounts: estimatorCounts,
      totalScheduledThisWeek: scheduledThisWeek,
    };
  }, [itbBids, estimators, weekDays]);

  // Inline Quick Estimator Reassignment
  const handleInlineAssign = async (e: React.ChangeEvent<HTMLSelectElement>, bid: CalendarBidItem) => {
    const newEstimator = e.target.value;
    setIsAssigningInline((prev) => ({ ...prev, [bid.id]: true }));
    try {
      await onAssignBid(bid.id, newEstimator, bid.bidDueDate || bid.normalizedAiDueDate || null);
    } finally {
      setIsAssigningInline((prev) => ({ ...prev, [bid.id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Week Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Week Navigation Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={prevWeek}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors shadow-2xs"
              title="Previous Week"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={jumpToToday}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition-colors shadow-2xs"
            >
              This Week
            </button>
            <button
              onClick={nextWeek}
              className="p-1.5 hover:bg-white rounded-lg text-slate-700 transition-colors shadow-2xs"
              title="Next Week"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-600" />
              <span>{weekRangeLabel}</span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-700">
                {totalScheduledThisWeek} Bid{totalScheduledThisWeek === 1 ? '' : 's'} Due This Week
              </span>
              <span>•</span>
              <span>Only ITBs</span>
            </div>
          </div>
        </div>

        {/* Center / Right: View Toggle, Estimator Filter & Unscheduled Drawer Trigger */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* 5-Day vs 7-Day Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => setShowWeekends(false)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                !showWeekends
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5-Day (Mon–Fri)
            </button>
            <button
              type="button"
              onClick={() => setShowWeekends(true)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                showWeekends
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7-Day (Full Week)
            </button>
          </div>

          {/* Quick Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={currentDate.toISOString().slice(0, 10)}
              onChange={(e) => {
                if (e.target.value) {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setCurrentDate(new Date(y, m - 1, d));
                }
              }}
              className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              title="Jump to specific date"
            />
          </div>

          {/* Unscheduled Drawer Trigger */}
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

          {/* Import Google Calendar (.ics) */}
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs transition-colors"
            title="Import historical & upcoming bids from Google Calendar (.ics)"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Import .ics</span>
          </button>

          {/* Manual + Add Bid */}
          <button
            type="button"
            onClick={() => setShowAddBidModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
            title="Manually add a new bid to the calendar"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Bid</span>
          </button>
        </div>
      </div>

      {/* Estimator Workload Balance Bar for This Week */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 text-xs">
        {/* ALL Filter Tab */}
        <div
          onClick={() => setFilterEstimator('ALL')}
          className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
            filterEstimator === 'ALL'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70 text-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>All</span>
            </span>
            <span
              className={`font-mono font-black text-xs px-1.5 py-0.2 rounded ${
                filterEstimator === 'ALL' ? 'bg-white/20 text-white' : 'bg-white text-slate-900 border border-slate-200'
              }`}
            >
              {totalScheduledThisWeek}
            </span>
          </div>
          <p className={`text-[10px] mt-1 ${filterEstimator === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
            Full schedule
          </p>
        </div>

        {/* Each Named Estimator */}
        {estimators.map((est) => {
          const count = weekEstimatorCounts[est] || 0;
          const color = getEstimatorColor(est);
          const isSelected = filterEstimator === est;
          return (
            <div
              key={est}
              onClick={() => setFilterEstimator(est)}
              style={
                isSelected
                  ? {
                      borderColor: color.primaryColor,
                      backgroundColor: color.bgTint,
                      boxShadow: `0 0 0 2px ${color.primaryColor}`,
                    }
                  : {}
              }
              className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'shadow-xs font-bold'
                  : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color.primaryColor }}
                  />
                  <span className="truncate">{est.split(' ')[0]}</span>
                </span>
                <span className="font-mono font-black text-xs bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-900 shadow-2xs">
                  {count}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 truncate">
                {count === 0 ? 'No bids' : `${count} bid${count === 1 ? '' : 's'}`}
              </p>
            </div>
          );
        })}

        {/* Unassigned / Needs Estimator */}
        <div
          onClick={() => setFilterEstimator('Unassigned')}
          className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
            filterEstimator === 'Unassigned'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-300 shadow-xs'
              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
              <span>Needs Est.</span>
            </span>
            <span className="font-mono font-black text-xs bg-white px-1.5 py-0.2 rounded border border-slate-200 text-rose-700 shadow-2xs">
              {weekEstimatorCounts['Unassigned'] || 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 truncate">
            Unassigned
          </p>
        </div>

        {/* Not Bidding / Grey */}
        <div
          onClick={() => setFilterEstimator('Not Bidding')}
          style={
            filterEstimator === 'Not Bidding'
              ? {
                  borderColor: 'rgb(194, 194, 194)',
                  backgroundColor: 'rgba(194, 194, 194, 0.35)',
                  boxShadow: '0 0 0 2px rgb(194, 194, 194)',
                }
              : {}
          }
          className={`p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
            filterEstimator === 'Not Bidding'
              ? 'shadow-xs font-bold'
              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-700 flex items-center gap-1.5 truncate">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: 'rgb(194, 194, 194)' }}
              />
              <span>Not Bidding</span>
            </span>
            <span className="font-mono font-black text-xs bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-700 shadow-2xs">
              {weekEstimatorCounts['Not Bidding'] || 0}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1 truncate">
            Marked grey
          </p>
        </div>
      </div>

      {/* Main Week Columns View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Horizontal scroll wrapper for small screens */}
        <div className="overflow-x-auto">
          <div
            className={`grid divide-x divide-slate-200 min-w-[840px] ${
              showWeekends ? 'grid-cols-7' : 'grid-cols-5'
            }`}
          >
            {weekDays.map((day) => {
              const allDayBids = bidsByDate[day.ymd] || [];
              const dayBids = allDayBids
                .filter((b) => {
                  if (filterEstimator === 'ALL') return true;
                  if (filterEstimator === 'Unassigned') {
                    return (!b.assignedEstimator || b.assignedEstimator === '') && b.estimatorStatus !== 'no_bid';
                  }
                  if (filterEstimator === 'Not Bidding') {
                    return (
                      b.assignedEstimator === 'Not Bidding' ||
                      b.assignedEstimator === 'No Bid' ||
                      b.estimatorStatus === 'no_bid'
                    );
                  }
                  return b.assignedEstimator === filterEstimator;
                })
                .sort((a, b) => parseDueTimeMinutes(a.bidDueTime) - parseDueTimeMinutes(b.bidDueTime));

              const isDragTarget = dragOverYmd === day.ymd;

              return (
                <div
                  key={day.ymd}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverYmd !== day.ymd) setDragOverYmd(day.ymd);
                  }}
                  onDragLeave={() => {
                    if (dragOverYmd === day.ymd) setDragOverYmd(null);
                  }}
                  onDrop={(e) => handleDropOnDay(e, day.ymd)}
                  className={`flex flex-col min-h-[580px] max-h-[calc(100vh-280px)] transition-colors ${
                    isDragTarget
                      ? 'bg-blue-50/90 ring-2 ring-inset ring-blue-400'
                      : day.isToday
                      ? 'bg-blue-50/20'
                      : day.isWeekend
                      ? 'bg-slate-50/40'
                      : 'bg-white'
                  }`}
                >
                  {/* Column Header: Day Name, Date & Count */}
                  <div
                    className={`p-3 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-md ${
                      day.isToday
                        ? 'bg-blue-100/70 border-b-blue-300'
                        : day.isWeekend
                        ? 'bg-slate-100/80 text-slate-500'
                        : 'bg-slate-50/90 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold uppercase tracking-wider ${day.isToday ? 'text-blue-900 font-black' : 'text-slate-700'}`}>
                          {day.dayOfWeek}
                        </span>
                        {day.isToday && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-blue-600 text-white tracking-wider shadow-2xs">
                            Today
                          </span>
                        )}
                      </div>

                      {/* Day Bid Count Badge */}
                      <span
                        className={`text-[11px] font-mono font-bold px-1.5 py-0.2 rounded-full ${
                          dayBids.length > 0
                            ? day.isToday
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-200/90 text-slate-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {dayBids.length}
                      </span>
                    </div>

                    <div className="text-sm font-black text-slate-900 mt-0.5">
                      {day.formattedDate}
                    </div>
                  </div>

                  {/* Scrollable Job List for this Day */}
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                    {dayBids.length === 0 ? (
                      <div className="h-40 flex flex-col items-center justify-center text-center p-3 text-slate-300">
                        <CalendarIcon className="w-6 h-6 mb-1 opacity-40" />
                        <span className="text-[11px] font-medium text-slate-400">No bids due</span>
                      </div>
                    ) : (
                      dayBids.map((bid) => {
                        const isNotBidding =
                          bid.assignedEstimator === 'Not Bidding' ||
                          bid.assignedEstimator === 'No Bid' ||
                          bid.estimatorStatus === 'no_bid';
                        const estColor = getEstimatorColor(isNotBidding ? 'Not Bidding' : bid.assignedEstimator);
                        const isAssigningThis = isAssigningInline[bid.id];

                        return (
                          <div
                            key={bid.id}
                            draggable
                            onDragStart={(e) => {
                              setDraggedBidId(bid.id);
                              e.dataTransfer.setData('text/plain', bid.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              setDraggedBidId(null);
                              setDragOverYmd(null);
                            }}
                            style={{
                              borderLeftColor: estColor.primaryColor,
                              backgroundColor: isNotBidding ? 'rgba(241, 245, 249, 0.95)' : undefined,
                            }}
                            className={`p-3 rounded-xl border cursor-grab active:cursor-grabbing ${
                              draggedBidId === bid.id ? 'opacity-50 ring-2 ring-blue-400' : ''
                            } ${
                              isNotBidding
                                ? 'bg-slate-100/90 text-slate-600'
                                : 'bg-white hover:bg-slate-50/90'
                            } shadow-2xs hover:shadow-xs transition-all border-l-4 border-t-slate-200 border-r-slate-200 border-b-slate-200 flex flex-col justify-between gap-2 group relative`}
                          >
                            {/* Card Top Row: Bid Number & Review Button */}
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <span
                                onClick={() => onSelectBid(bid)}
                                className={`font-mono font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                                  isNotBidding
                                    ? 'bg-slate-200 text-slate-700 border-slate-300'
                                    : 'text-blue-900 bg-blue-50/80 border-blue-200/80 hover:bg-blue-100'
                                }`}
                                title="Click to view bid details"
                              >
                                {bid.bidNumber || 'Pending Bid #'}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectBid(bid);
                                  }}
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors shadow-2xs flex items-center gap-0.5"
                                  title="Reclassify this email if it is not an Invitation to Bid"
                                >
                                  <Layers className="w-2.5 h-2.5 text-amber-600" />
                                  <span>Reclassify</span>
                                </button>

                                {isNotBidding && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 border border-slate-300">
                                    Not Bidding
                                  </span>
                                )}

                                {Boolean(bid.attachmentsCount && bid.attachmentsCount > 0) && (
                                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5 font-mono">
                                    <Paperclip className="w-3 h-3 text-slate-400" />
                                    <span>{bid.attachmentsCount}</span>
                                  </span>
                                )}

                                {bid.googleDriveFolderUrl && (
                                  <a
                                    href={bid.googleDriveFolderUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-0.5 transition-colors"
                                    title="Open Google Drive Project Folder"
                                  >
                                    <FolderArchive className="w-2.5 h-2.5 text-blue-600" />
                                    <span>Drive</span>
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Project Name (Primary Clickable Title) */}
                            <h4
                              onClick={() => onSelectBid(bid)}
                              className={`text-xs font-bold transition-colors line-clamp-2 leading-snug cursor-pointer ${
                                isNotBidding
                                  ? 'text-slate-600 line-through decoration-slate-400'
                                  : 'text-slate-900 group-hover:text-blue-700'
                              }`}
                              title={bid.projectName || bid.subject}
                            >
                              {bid.projectName || bid.subject}
                            </h4>

                            {/* Contractor / Client Company */}
                            <div className="text-[11px] text-slate-600 flex items-center gap-1.5 truncate">
                              <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="font-semibold truncate">
                                {bid.clientCompany || bid.senderName}
                              </span>
                            </div>

                            {/* Project Address (if available) */}
                            {bid.projectAddress && (
                              <div className="text-[10px] text-slate-400 truncate">
                                📍 {bid.projectAddress}
                              </div>
                            )}

                            {/* Due Time & Handoff Readiness Indicators */}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {bid.bidDueTime && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5 text-indigo-600" />
                                  <span>{bid.bidDueTime}</span>
                                </span>
                              )}
                              {!isNotBidding && (
                                <>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                      bid.attachmentsCount && bid.attachmentsCount > 0
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200'
                                    }`}
                                    title={bid.attachmentsCount ? `${bid.attachmentsCount} document(s) attached` : 'No documents attached yet'}
                                  >
                                    {bid.attachmentsCount ? '✓ Docs' : '○ Docs'}
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                      bid.googleDriveFolderUrl
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-slate-50 text-slate-400 border-slate-200'
                                    }`}
                                    title={bid.googleDriveFolderUrl ? 'Google Drive folder linked' : 'Google Drive folder not linked yet'}
                                  >
                                    {bid.googleDriveFolderUrl ? '✓ Drive' : '○ Drive'}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Estimator Assignment & Inline Selector */}
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-[10px]">
                              <div className="flex-1 min-w-0">
                                <select
                                  value={isNotBidding ? 'Not Bidding' : (bid.assignedEstimator || '')}
                                  onChange={(e) => handleInlineAssign(e, bid)}
                                  disabled={isAssigningThis}
                                  style={
                                    bid.assignedEstimator || isNotBidding
                                      ? {
                                          backgroundColor: estColor.bgTint,
                                          borderColor: estColor.borderColor,
                                          color: estColor.textColor,
                                        }
                                      : undefined
                                  }
                                  className={`w-full text-[11px] font-bold py-1 px-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs ${
                                    !bid.assignedEstimator && !isNotBidding
                                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                                      : ''
                                  }`}
                                  title="Quick assign estimator or mark as Not Bidding"
                                >
                                  <option value="">⚠️ Assign Estimator...</option>
                                  {estimators.map((est) => (
                                    <option key={est} value={est}>
                                      {est}
                                    </option>
                                  ))}
                                  <option value="Not Bidding">🚫 Not Bidding (Mark Grey)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Unscheduled Bids Drawer / Tray (Only ITBs) */}
      {showUnscheduledDrawer && (
        <div className="bg-amber-50/70 p-5 rounded-2xl border border-amber-200 space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-700" />
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  Unscheduled Opportunities ({unscheduledBids.length})
                </h3>
                <p className="text-xs text-amber-800">
                  These ITBs do not yet have a confirmed due date on the calendar.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowUnscheduledDrawer(false)}
              className="text-xs font-semibold text-amber-800 hover:text-amber-950 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors"
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
                    draggable
                    onDragStart={(e) => {
                      setDraggedBidId(bid.id);
                      e.dataTransfer.setData('text/plain', bid.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggedBidId(null);
                      setDragOverYmd(null);
                    }}
                    className="p-3.5 bg-white rounded-xl border border-amber-200/80 shadow-2xs space-y-2.5 flex flex-col justify-between cursor-grab active:cursor-grabbing"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {bid.bidNumber || 'Pending Bid #'}
                        </span>
                        <span className="text-slate-400 font-mono">{bid.receivedAt}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 line-clamp-1">
                        {bid.projectName || bid.subject}
                      </h4>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        Contractor: {bid.clientCompany || bid.senderName}
                      </p>

                      {hasAiSuggestion && (
                        <div className="mt-2 p-2 rounded-lg bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-900 flex items-center justify-between">
                          <span className="flex items-center gap-1 font-semibold">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                            AI Suggested: {formatFriendlyDate(bid.normalizedAiDueDate)}
                          </span>
                          <button
                            onClick={() =>
                              onAssignBid(bid.id, bid.assignedEstimator || '', bid.normalizedAiDueDate || null)
                            }
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold text-[10px] hover:bg-indigo-700 shadow-2xs transition-colors"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => onSelectBid(bid)}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1"
                        title="Reclassify this email if not an ITB"
                      >
                        <Layers className="w-3 h-3 text-amber-600" />
                        <span>Reclassify</span>
                      </button>
                      <button
                        onClick={() => onSelectBid(bid)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <span>Schedule Date</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Google Calendar (.ics) Importer Modal */}
      <CalendarImportModal
        isOpen={showImportModal}
        estimators={estimators}
        onClose={() => setShowImportModal(false)}
        onImportComplete={({ createdCount, enrichedCount, skippedCount }) => {
          if (onNotify) {
            onNotify(
              `✔ Calendar import complete: ${createdCount} added, ${enrichedCount} matched & updated, ${skippedCount} skipped.`
            );
          }
          if (onBidsChanged) onBidsChanged();
        }}
      />

      {/* Manual Add Bid Modal */}
      <CalendarAddBidModal
        isOpen={showAddBidModal}
        estimators={estimators}
        defaultDueDate={todayYmd}
        onClose={() => setShowAddBidModal(false)}
        onCreated={(bidNumber) => {
          if (onNotify) {
            onNotify(`✔ Added manual bid ${bidNumber || ''} to calendar!`);
          }
          if (onBidsChanged) onBidsChanged();
        }}
      />
    </div>
  );
}
