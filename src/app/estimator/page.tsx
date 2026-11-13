'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Calendar as CalendarIcon,
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Paperclip,
  Building,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Briefcase,
  Layers,
  ArrowUpDown,
  Trophy,
  XCircle,
} from 'lucide-react';
import EstimatorJobModal from '@/components/EstimatorJobModal';
import {
  formatFriendlyDate,
  getDueDateStatus,
  normalizeDateToYyyyMmDd,
  getEstimatorColor,
} from '@/lib/date-utils';

const ESTIMATORS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
  'Jennifer MacPherson',
];

interface JobItem {
  id: string;
  bidNumber?: string | null;
  projectName: string;
  clientCompany: string;
  projectAddress?: string | null;
  jobCode?: string | null;
  assignedEstimator?: string | null;
  estimatorStatus: 'unassigned' | 'assigned' | 'declined' | 'in_progress' | 'bid_submitted' | 'won' | 'lost' | 'no_bid';
  bidDueDate?: string | null;
  bidDueTime?: string | null;
  googleDriveFolderUrl?: string | null;
  scopeSummary?: string | null;
  receivedAt: string;
  subject: string;
  senderEmail: string;
  senderName: string;
  attachmentsCount: number;
  duplicateCount: number;
  sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam' | 'Date Reminder' | string;
  isForwarded?: boolean;
  forwardedBy?: string | null;
  originalSenderName?: string | null;
  originalSenderEmail?: string | null;
}

export default function EstimatorWorkspacePage() {
  const [bids, setBids] = useState<JobItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEstimator, setSelectedEstimator] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'dueDate' | 'received' | 'projectName'>('dueDate');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load saved estimator from localStorage or default to ALL
  useEffect(() => {
    const saved = localStorage.getItem('ppi_current_estimator');
    if (saved && (ESTIMATORS.includes(saved) || saved === 'ALL')) {
      setSelectedEstimator(saved);
    } else {
      setSelectedEstimator('ALL');
    }
  }, []);

  const handleSelectEstimator = (name: string) => {
    setSelectedEstimator(name);
    localStorage.setItem('ppi_current_estimator', name);
  };

  const fetchBids = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bid-requests');
      const data = await res.json();
      if (data.bidRequests && Array.isArray(data.bidRequests)) {
        // Group child addendums / duplicates count by duplicate_group_id
        const groupCounts: Record<string, number> = {};
        data.bidRequests.forEach((r: any) => {
          if (r.duplicate_group_id) {
            groupCounts[r.duplicate_group_id] = (groupCounts[r.duplicate_group_id] || 0) + 1;
          }
        });

        // Filter: Keep anything assigned to an estimator or primary ITB records
        const mapped: JobItem[] = data.bidRequests
          .filter((r: any) => {
            const rawAssigned = r.assigned_estimator_name || r.raw_payload?.assigned_estimator_name;
            const hasEstimator = Boolean(
              rawAssigned &&
              rawAssigned !== 'Not Bidding' &&
              rawAssigned !== 'No Bid'
            );
            if (hasEstimator) return true;
            return !r.is_flagged_duplicate || r.email_intent === 'invitation_to_bid';
          })
          .map((r: any) => {
            const isHuman = Boolean(
              r.is_human_labeled ||
              r.duplicate_resolution === 'human_verified' ||
              r.raw_payload?.is_labeled === true ||
              r.raw_payload?.human_verified === true
            );
            const rawHumanLabel = r.human_label || r.raw_payload?.human_label || r.raw_payload?.custom_category;

            let sticker: string = 'ITB';
            if (isHuman && rawHumanLabel) {
              if (
                rawHumanLabel === 'Addendum' ||
                rawHumanLabel === 'RFI/Forms' ||
                rawHumanLabel === 'RFI / Scope' ||
                rawHumanLabel === 'Scopes of Work' ||
                rawHumanLabel === 'Addendum / RFI'
              ) {
                sticker = 'Addendum';
              } else if (rawHumanLabel === 'Won') {
                sticker = 'Won';
              } else if (rawHumanLabel === 'Lost') {
                sticker = 'Lost';
              } else if (rawHumanLabel === 'Spam') {
                sticker = 'Spam';
              } else if (rawHumanLabel === 'Date Reminder') {
                sticker = 'Date Reminder';
              } else {
                sticker = rawHumanLabel;
              }
            } else {
              if (r.email_intent === 'addendum_update') sticker = 'Addendum';
              else if (r.email_intent === 'bid_won' || r.email_intent === 'contractor_awarded') sticker = 'Won';
              else if (r.email_intent === 'bid_lost') sticker = 'Lost';
              else if (r.email_intent === 'spam_noise') sticker = 'Spam';
              else if (r.email_intent === 'date_reminder') sticker = 'Date Reminder';
              else sticker = 'ITB';
            }

            const rawAssigned =
              r.assigned_estimator_name ||
              r.raw_payload?.assigned_estimator_name ||
              null;

            const assignedName =
              rawAssigned && rawAssigned !== 'Not Bidding' && rawAssigned !== 'No Bid'
                ? rawAssigned
                : null;

            const rawAtts = Array.isArray(r.attachments)
              ? r.attachments
              : Array.isArray(r.raw_payload?.attachments)
              ? r.raw_payload.attachments
              : [];

            const totalInGroup = r.duplicate_group_id ? groupCounts[r.duplicate_group_id] || 1 : 1;

            return {
              id: r.id,
              bidNumber: r.bid_number || null,
              projectName: r.project_name || r.ai_analysis?.projectName || r.email_subject || 'Untitled Project',
              clientCompany: r.client_company || r.ai_analysis?.clientCompany || 'Direct Client',
              projectAddress: [r.project_address_city, r.project_address_state].filter(Boolean).join(', ') || null,
              jobCode: r.job_code,
              assignedEstimator: assignedName,
              estimatorStatus: r.estimator_status || 'assigned',
              bidDueDate: r.bid_due_date,
              bidDueTime: r.bid_due_time || r.raw_payload?.bid_due_time || null,
              googleDriveFolderUrl: r.google_drive_folder_url || null,
              scopeSummary: r.scope_summary || r.ai_analysis?.scopeSummary || null,
              receivedAt: new Date(r.email_received_at || r.created_at).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }),
              subject: r.email_subject || 'Untitled Email',
              senderEmail: r.sender_email || '',
              senderName: r.sender_name || r.sender_email?.split('@')[0] || 'Unknown Sender',
              attachmentsCount: rawAtts.length,
              duplicateCount: Math.max(0, totalInGroup - 1),
              sticker: sticker as any,
              isForwarded: Boolean(r.is_forwarded),
              forwardedBy: r.forwarded_by,
              originalSenderName: r.original_sender_name,
              originalSenderEmail: r.original_sender_email,
            };
          });

        setBids(mapped);
      }
    } catch (err) {
      console.error('Failed to load bids for estimator:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBids();
  }, []);

  const handleUpdateStatus = async (jobId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/bid-requests/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimatorStatus: newStatus }),
      });
      if (res.ok) {
        setBids((prev) =>
          prev.map((b) => (b.id === jobId ? { ...b, estimatorStatus: newStatus as any } : b))
        );
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const openJobModal = (jobId: string) => {
    setActiveJobId(jobId);
    setIsModalOpen(true);
  };

  // Counts per estimator
  const estimatorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ESTIMATORS.forEach((est) => {
      counts[est] = bids.filter((b) => b.assignedEstimator === est).length;
    });
    counts['ALL'] = bids.filter((b) => Boolean(b.assignedEstimator)).length;
    return counts;
  }, [bids]);

  // Filter bids by active estimator
  const estimatorBids = bids.filter((b) => {
    if (selectedEstimator === 'ALL') return Boolean(b.assignedEstimator);
    return b.assignedEstimator === selectedEstimator;
  });

  // Calculate metrics
  const totalAssigned = estimatorBids.length;
  const inProgressCount = estimatorBids.filter((b) => b.estimatorStatus === 'in_progress').length;
  const submittedCount = estimatorBids.filter((b) => b.estimatorStatus === 'bid_submitted').length;
  const wonCount = estimatorBids.filter((b) => b.estimatorStatus === 'won').length;
  const dueSoonCount = estimatorBids.filter((b) => {
    if (!b.bidDueDate) return false;
    const ymd = normalizeDateToYyyyMmDd(b.bidDueDate);
    if (!ymd) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (new Date(ymd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;

  // Filter by status & search
  const filteredBids = estimatorBids.filter((b) => {
    if (statusFilter === 'in_progress' && b.estimatorStatus !== 'in_progress') return false;
    if (statusFilter === 'bid_submitted' && b.estimatorStatus !== 'bid_submitted') return false;
    if (statusFilter === 'won' && b.estimatorStatus !== 'won') return false;
    if (statusFilter === 'due_soon') {
      if (!b.bidDueDate) return false;
      const ymd = normalizeDateToYyyyMmDd(b.bidDueDate);
      if (!ymd) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = (new Date(ymd).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      if (diff < 0 || diff > 7) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        b.projectName.toLowerCase().includes(q) ||
        b.clientCompany.toLowerCase().includes(q) ||
        (b.bidNumber && b.bidNumber.toLowerCase().includes(q)) ||
        (b.jobCode && b.jobCode.toLowerCase().includes(q)) ||
        (b.scopeSummary && b.scopeSummary.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  // Sort bids
  filteredBids.sort((a, b) => {
    if (sortBy === 'dueDate') {
      if (!a.bidDueDate && !b.bidDueDate) return 0;
      if (!a.bidDueDate) return 1;
      if (!b.bidDueDate) return -1;
      return new Date(a.bidDueDate).getTime() - new Date(b.bidDueDate).getTime();
    }
    if (sortBy === 'received') {
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    }
    return a.projectName.localeCompare(b.projectName);
  });

  const activeColor = getEstimatorColor(selectedEstimator);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 p-3 sm:p-6 lg:p-8 space-y-6">
      {/* Top Banner Navigation */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 rounded-2xl px-5 py-4 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span>👷 Estimator Portal — Assigned Jobs & Takeoffs</span>
          </h1>
        </div>

        {/* Global Navigation Tabs to Dispatch & Calendar */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Dispatch Feed</span>
          </Link>

          <Link
            href="/?view=calendar"
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Calendar Schedule</span>
          </Link>

          <Link
            href="/pricing"
            className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-400/30"
          >
            <span>💰 Price Book</span>
          </Link>

          <button
            onClick={fetchBids}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1 border border-white/10"
            title="Refresh Bids"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Estimator Profile Switcher Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1">
            <UserCheck className="w-4 h-4 text-blue-600" />
            Estimator Account:
          </span>

          <button
            onClick={() => handleSelectEstimator('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedEstimator === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>All Estimators</span>
            <span
              className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                selectedEstimator === 'ALL'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {estimatorCounts['ALL'] || 0}
            </span>
          </button>

          {ESTIMATORS.map((est) => {
            const isSelected = selectedEstimator === est;
            const color = getEstimatorColor(est);
            const count = estimatorCounts[est] || 0;
            const initials = est
              .split(' ')
              .map((n) => n[0])
              .join('');

            return (
              <button
                key={est}
                onClick={() => handleSelectEstimator(est)}
                style={
                  isSelected
                    ? {
                        backgroundColor: color.bgTint,
                        borderColor: color.borderColor,
                        color: color.textColor,
                      }
                    : undefined
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  isSelected
                    ? `border-2 shadow-xs ring-2 ring-blue-300/40`
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span
                  style={isSelected ? { backgroundColor: color.primaryColor } : undefined}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white ${
                    isSelected ? '' : 'bg-slate-400'
                  }`}
                >
                  {initials}
                </span>
                <span>{est}</span>
                <span
                  style={
                    isSelected
                      ? { backgroundColor: color.primaryColor, color: '#ffffff' }
                      : undefined
                  }
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                    isSelected
                      ? 'text-white'
                      : count > 0
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Viewing: <strong className="text-slate-900">{selectedEstimator === 'ALL' ? 'All Estimators' : selectedEstimator}</strong>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Assigned
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">{totalAssigned}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-2xs bg-amber-50/30">
          <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Due This Week
          </span>
          <span className="text-2xl font-black text-amber-900 mt-1 block">{dueSoonCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
          <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            In Progress
          </span>
          <span className="text-2xl font-black text-blue-900 mt-1 block">{inProgressCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 shadow-2xs bg-purple-50/30">
          <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider block flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
            Submitted
          </span>
          <span className="text-2xl font-black text-purple-900 mt-1 block">{submittedCount}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs bg-emerald-50/30">
          <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-emerald-600" />
            Won / Awarded
          </span>
          <span className="text-2xl font-black text-emerald-900 mt-1 block">{wonCount}</span>
        </div>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { key: 'ALL', label: `All Active (${totalAssigned})` },
            { key: 'due_soon', label: `Due Soon (${dueSoonCount})` },
            { key: 'in_progress', label: `In Progress (${inProgressCount})` },
            { key: 'bid_submitted', label: `Submitted (${submittedCount})` },
            { key: 'won', label: `Won (${wonCount})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === tab.key
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search project, GC, code..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="text-xs border border-slate-300 rounded-xl px-2.5 py-1.5 bg-white text-slate-700 font-semibold"
            >
              <option value="dueDate">Sort: Due Date</option>
              <option value="received">Sort: Date Received</option>
              <option value="projectName">Sort: Project Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Jobs Feed */}
      {filteredBids.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {totalAssigned === 0
                ? `No jobs currently assigned to ${selectedEstimator}`
                : 'No bids match your current filter'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {totalAssigned === 0
                ? 'The Calendar Manager can assign incoming bid requests from the Inbound Dispatch Feed or Calendar Schedule.'
                : 'Try adjusting your search terms or clearing the status filter.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBids.map((job) => {
            const due = getDueDateStatus(job.bidDueDate);
            const isOverdue = due?.isOverdue;

            let cardStatusBorder = 'border-l-blue-600';
            if (job.estimatorStatus === 'in_progress') cardStatusBorder = 'border-l-amber-500';
            else if (job.estimatorStatus === 'bid_submitted') cardStatusBorder = 'border-l-purple-600';
            else if (job.estimatorStatus === 'won') cardStatusBorder = 'border-l-emerald-600';
            else if (job.estimatorStatus === 'lost') cardStatusBorder = 'border-l-rose-500';
            else if (job.estimatorStatus === 'declined') cardStatusBorder = 'border-l-rose-600';

            return (
              <div
                key={job.id}
                className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${cardStatusBorder} shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group`}
              >
                {/* Card Top Header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {job.bidNumber || 'PENDING'}
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {job.bidDueTime && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {job.bidDueTime}
                        </span>
                      )}
                      {due && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${due.badgeClass}`}>
                          {due.label}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                      {job.projectName}
                    </h3>

                    <div className="flex items-center gap-1 text-xs text-slate-600 mt-1 font-medium truncate">
                      <Building className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">
                        {job.isForwarded && job.originalSenderName ? (
                          <>
                            <strong>{job.originalSenderName}</strong>
                            <span className="text-slate-400 text-[11px] font-normal"> (via coworker)</span>
                          </>
                        ) : (
                          job.clientCompany
                        )}
                      </span>
                    </div>

                    {job.projectAddress && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        📍 {job.projectAddress}
                      </div>
                    )}
                  </div>

                  {/* AI Scope Snippet */}
                  {job.scopeSummary && (
                    <p className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 line-clamp-2 leading-relaxed">
                      <span className="font-bold text-slate-800">Scope:</span> {job.scopeSummary}
                    </p>
                  )}

                  {/* Badges for Attachments & Related Updates */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                      <Paperclip className="w-3 h-3 text-blue-600" />
                      {job.attachmentsCount} Drawing{job.attachmentsCount !== 1 ? 's' : ''}
                    </span>

                    {job.duplicateCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                        <Layers className="w-3 h-3 text-amber-600" />
                        {job.duplicateCount} Update{job.duplicateCount > 1 ? 's' : ''} / Addenda
                      </span>
                    )}

                    <span className="text-slate-400 text-[10px] ml-auto">
                      Rec'd: {job.receivedAt}
                    </span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="p-3 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between gap-2">
                  {/* Quick Status Dropdown */}
                  <select
                    value={job.estimatorStatus}
                    onChange={(e) => handleUpdateStatus(job.id, e.target.value)}
                    className="text-[11px] font-semibold rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-800 shadow-2xs"
                  >
                    <option value="assigned">🔵 Assigned</option>
                    <option value="in_progress">🟡 In Progress</option>
                    <option value="bid_submitted">🟣 Bid Submitted</option>
                    <option value="won">🟢 Won / Awarded</option>
                    <option value="lost">🔴 Lost</option>
                    <option value="declined">🚫 Refuse (Reassign)</option>
                    <option value="no_bid">⚪ No Bid</option>
                  </select>

                  {/* Primary CTA */}
                  <button
                    onClick={() => openJobModal(job.id)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1 group-hover:bg-blue-600"
                  >
                    <span>Open Job Folder</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Estimator Job Dossier Modal */}
      <EstimatorJobModal
        bidId={activeJobId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setActiveJobId(null);
        }}
        onJobUpdated={fetchBids}
      />
    </div>
  );
}
