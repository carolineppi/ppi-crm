'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Inbox,
  Copy,
  Users,
  Paperclip,
  RefreshCw,
  Database,
  Trophy,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle,
  Sparkles,
  UserCheck,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Link as LinkIcon,
  XCircle,
  Hash,
  Edit3,
  X,
  Search,
  Check,
  Mail,
  FileText,
  Calendar as CalendarIcon,
  Clock,
  CalendarCheck,
  ExternalLink,
  Briefcase,
} from 'lucide-react';
import EmailDocumentViewer from '@/components/EmailDocumentViewer';
import CalendarScheduleView from '@/components/CalendarScheduleView';
import {
  normalizeDateToYyyyMmDd,
  formatFriendlyDate,
  getDueDateStatus,
  getEstimatorColor,
} from '@/lib/date-utils';

interface DisplayBidRequest {
  id: string;
  bidNumber: string | null;
  subject: string;
  senderEmail: string;
  senderName: string;
  receivedAt: string;
  jobCode: string | null;
  projectName?: string | null;
  clientCompany?: string | null;
  duplicateGroupId: string;
  isFlaggedDuplicate: boolean;
  duplicateReasons: string[];
  triageStatus: 'pending_triage' | 'in_triage' | 'ready_for_assignment' | 'assigned' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedEstimator: string | null;
  bidDueDate?: string | null;
  rawAiDueDate?: string | null;
  normalizedAiDueDate?: string | null;
  attachmentsCount: number;
  attachments?: Array<{ filename: string; size?: number; contentType?: string; storageUrl?: string }>;

  // Email Body Content
  bodyText?: string | null;
  bodyHtml?: string | null;

  // 5 Definitive Stickers
  sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam' | 'General';
  filterStatus: 'inbox' | 'auto_filtered' | 'promoted_to_job' | 'archived';

  // AI & Forwarding Enrichment
  isForwarded?: boolean;
  forwardedBy?: string | null;
  originalSenderEmail?: string | null;
  originalSenderName?: string | null;
  scopeSummary?: string | null;
  aiReasoning?: string | null;
  aiConfidence?: number | null;

  // Matching Fields for Addendum / Won / Lost
  matchedBidNumber?: string | null;
  matchConfidence?: number | null;
  matchReason?: string | null;
  matchStatus?: string | null;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const ESTIMATORS = ['Steven Gross', 'Jaxson Farnholtz', 'Matt Magnani', 'Mariam Azab'];

export default function DispatchDashboard() {
  const [bids, setBids] = useState<DisplayBidRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam'>('ALL');
  const [viewMode, setViewMode] = useState<'feed' | 'calendar'>('feed');
  const [isUsingLiveDb, setIsUsingLiveDb] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Review & Reclassification Modal State
  const [reviewingBid, setReviewingBid] = useState<DisplayBidRequest | null>(null);
  const [targetSticker, setTargetSticker] = useState<DisplayBidRequest['sticker']>('ITB');
  const [selectedBidNumberToLink, setSelectedBidNumberToLink] = useState<string>('');
  const [selectedEstimatorForITB, setSelectedEstimatorForITB] = useState<string>('');
  const [selectedDueDateForITB, setSelectedDueDateForITB] = useState<string>('');
  const [bidSearchQuery, setBidSearchQuery] = useState('');
  const [isSavingReclassification, setIsSavingReclassification] = useState(false);
  const [showModalEmailBody, setShowModalEmailBody] = useState(true);

  const toggleEmailDropdown = (id: string) => {
    setExpandedEmails((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchLiveBids = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bid-requests');
      const data = await res.json();
      if (data.bidRequests && Array.isArray(data.bidRequests)) {
        const mapped: DisplayBidRequest[] = data.bidRequests.map((r: any) => {
          let sticker: DisplayBidRequest['sticker'] = 'ITB';
          if (r.email_intent === 'addendum_update') sticker = 'Addendum';
          else if (r.email_intent === 'bid_won') sticker = 'Won';
          else if (r.email_intent === 'bid_lost') sticker = 'Lost';
          else if (r.email_intent === 'spam_noise') sticker = 'Spam';

          const assignedName = r.raw_payload?.assigned_estimator_name || (r.assigned_estimator_id ? 'Assigned' : null);

          const attachmentsList = Array.isArray(r.attachments)
            ? r.attachments
            : Array.isArray(r.raw_payload?.attachments)
            ? r.raw_payload.attachments
            : [];

          const rawAiDueDate = r.ai_analysis?.bidDueDate || null;
          const normalizedAiDueDate = normalizeDateToYyyyMmDd(rawAiDueDate);
          const bidDueDate = r.bid_due_date ? normalizeDateToYyyyMmDd(r.bid_due_date) : null;
          const projectName = r.project_name || r.ai_analysis?.projectName || null;
          const clientCompany = r.client_company || r.ai_analysis?.clientCompany || null;

          return {
            id: r.id,
            bidNumber: r.bid_number || null,
            subject: r.email_subject,
            senderEmail: r.sender_email,
            senderName: r.sender_name || r.sender_email.split('@')[0],
            receivedAt: new Date(r.email_received_at || r.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            jobCode: r.job_code,
            projectName,
            clientCompany,
            duplicateGroupId: r.duplicate_group_id || r.id,
            isFlaggedDuplicate: r.is_flagged_duplicate,
            duplicateReasons: r.duplicate_reasons || [],
            triageStatus: r.triage_status || 'pending_triage',
            priority: r.priority || 'normal',
            assignedEstimator: assignedName,
            bidDueDate,
            rawAiDueDate,
            normalizedAiDueDate,
            attachmentsCount: attachmentsList.length,
            attachments: attachmentsList,
            bodyText: r.email_body_text || r.raw_payload?.bodyText || r.raw_payload?.body || null,
            bodyHtml: r.email_body_html || r.raw_payload?.bodyHtml || null,
            sticker,
            filterStatus: r.filter_status || 'inbox',

            isForwarded: r.is_forwarded,
            forwardedBy: r.forwarded_by,
            originalSenderEmail: r.original_sender_email,
            originalSenderName: r.original_sender_name,
            scopeSummary: r.scope_summary,
            aiReasoning: r.intent_explanation,
            aiConfidence: r.intent_confidence,

            matchedBidNumber: r.matched_bid_number,
            matchConfidence: r.match_confidence,
            matchReason: r.match_reason,
            matchStatus: r.match_status,
          };
        });
        setBids(mapped);
        setIsUsingLiveDb(true);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveBids();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'calendar') {
        setViewMode('calendar');
      }
    }
  }, []);

  // Distinct list of active ITBs that have generated Bid Numbers (for linking Addendums/Wons/Losses)
  const activeITBsWithNumbers = bids.filter(
    (b) => b.bidNumber && b.sticker === 'ITB'
  );

  const filteredBidsForLinking = activeITBsWithNumbers.filter((b) => {
    if (!bidSearchQuery.trim()) return true;
    const q = bidSearchQuery.toLowerCase();
    return (
      b.bidNumber?.toLowerCase().includes(q) ||
      b.subject.toLowerCase().includes(q) ||
      b.senderName.toLowerCase().includes(q) ||
      b.jobCode?.toLowerCase().includes(q)
    );
  });

  // Filter based on active sticker filter bar
  const filteredBids = bids.filter((b) => {
    if (activeFilter === 'ALL') {
      return b.sticker !== 'Spam' && b.filterStatus !== 'auto_filtered';
    }
    return b.sticker === activeFilter;
  });

  const groupedBids = filteredBids.reduce<Record<string, DisplayBidRequest[]>>((acc, bid) => {
    acc[bid.duplicateGroupId] = acc[bid.duplicateGroupId] || [];
    acc[bid.duplicateGroupId].push(bid);
    return acc;
  }, {});

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  // 1. Direct Estimator & Due Date Assignment (Persisted to Supabase)
  const handleAssignEstimatorAndDate = async (
    bidId: string,
    estimator?: string | null,
    dueDate?: string | null
  ) => {
    // Optimistic UI update
    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              ...(estimator !== undefined ? { assignedEstimator: estimator || null } : {}),
              ...(dueDate !== undefined ? { bidDueDate: dueDate || null } : {}),
              triageStatus: estimator ? 'assigned' : 'ready_for_assignment',
            }
          : b
      )
    );

    try {
      const payload: any = {};
      if (estimator !== undefined) payload.assignedEstimator = estimator || null;
      if (dueDate !== undefined) payload.bidDueDate = dueDate || null;

      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast('✔ Assignment & Due Date updated in calendar');
      } else {
        showToast('Error saving update to database');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error updating assignment');
    }
  };

  // 2. Open Human-in-the-Loop Review Modal
  const openReviewModal = (bid: DisplayBidRequest) => {
    setReviewingBid(bid);
    setTargetSticker(bid.sticker);
    setSelectedBidNumberToLink(bid.matchedBidNumber || (activeITBsWithNumbers[0]?.bidNumber || ''));
    setSelectedEstimatorForITB(bid.assignedEstimator || '');
    setSelectedDueDateForITB(bid.bidDueDate || bid.normalizedAiDueDate || '');
    setBidSearchQuery('');
    setShowModalEmailBody(true);
  };

  // 3. Save Reclassification & Workflow Transition
  const handleSaveReclassification = async () => {
    if (!reviewingBid) return;
    setIsSavingReclassification(true);

    try {
      const payload: any = {
        newSticker: targetSticker,
      };

      if (targetSticker === 'ITB') {
        payload.assignedEstimator = selectedEstimatorForITB || null;
        payload.bidDueDate = selectedDueDateForITB || null;
      } else if (targetSticker === 'Addendum' || targetSticker === 'Won' || targetSticker === 'Lost') {
        payload.matchedBidNumber = selectedBidNumberToLink || null;
      }

      const res = await fetch(`/api/bid-requests/${reviewingBid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast(`✔ Reclassified to [${targetSticker}] and workflow updated!`);
        setReviewingBid(null);
        await fetchLiveBids();
      } else {
        const err = await res.json();
        showToast(`Failed to update: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setIsSavingReclassification(false);
    }
  };

  // Sticker counts
  const countITB = bids.filter((b) => b.sticker === 'ITB').length;
  const countAddendum = bids.filter((b) => b.sticker === 'Addendum').length;
  const countWon = bids.filter((b) => b.sticker === 'Won').length;
  const countLost = bids.filter((b) => b.sticker === 'Lost').length;
  const countSpam = bids.filter((b) => b.sticker === 'Spam').length;

  const renderStickerBadge = (sticker: DisplayBidRequest['sticker'], bid: DisplayBidRequest) => {
    let badgeClass = 'bg-blue-600 text-white';
    let icon = null;

    if (sticker === 'Addendum') {
      badgeClass = 'bg-purple-600 text-white';
      icon = <FileSpreadsheet className="w-3 h-3" />;
    } else if (sticker === 'Won') {
      badgeClass = 'bg-emerald-600 text-white';
      icon = <Trophy className="w-3 h-3" />;
    } else if (sticker === 'Lost') {
      badgeClass = 'bg-rose-600 text-white';
      icon = <XCircle className="w-3 h-3" />;
    } else if (sticker === 'Spam') {
      badgeClass = 'bg-slate-500 text-white';
      icon = <ShieldAlert className="w-3 h-3" />;
    }

    return (
      <div className="inline-flex items-center gap-1 group">
        <span className={`px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider shadow-sm flex items-center gap-1 ${badgeClass}`}>
          {icon}
          {sticker === 'ITB' ? 'ITB' : sticker}
        </span>
        <button
          onClick={() => openReviewModal(bid)}
          title="Calendar Manager: Review or Change Classification"
          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors border border-slate-300 text-[10px] font-semibold flex items-center gap-0.5"
        >
          <Edit3 className="w-3 h-3" />
          <span>Edit</span>
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 border border-slate-700">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold tracking-tight">
                Calendar Manager Dispatch Dashboard
              </h2>
              {isUsingLiveDb && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Supabase Live ({bids.length} Ingested)
                </span>
              )}
            </div>
            <p className="text-blue-200 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <strong>Human-in-the-Loop Triage:</strong> Review and adjust AI classifications anytime. ITBs generate Bid Numbers and assign estimators; Addendums & Awards link directly to existing project folders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLiveBids}
              disabled={isLoading}
              title="Refresh Live Data"
              className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-2 text-xs font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* VIEW SWITCHER TABS: INBOUND FEED vs CALENDAR SCHEDULE VIEW */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('feed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'feed'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Inbound Dispatch Feed</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
              {bids.filter((b) => b.sticker !== 'Spam').length}
            </span>
          </button>

          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'calendar'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Calendar Schedule View</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 font-mono">
              {bids.filter((b) => (b.bidDueDate || b.normalizedAiDueDate) && b.sticker !== 'Spam').length} Scheduled
            </span>
          </button>

          <Link
            href="/estimator"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-2xs"
          >
            <Briefcase className="w-4 h-4 text-indigo-600" />
            <span>Estimator Portal</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-200/60 text-indigo-900 font-mono">
              {bids.filter((b) => b.assignedEstimator).length} Assigned
            </span>
          </Link>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 pr-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Auto-suggests bid due dates directly from email bodies</span>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarScheduleView
          bids={bids}
          estimators={ESTIMATORS}
          onSelectBid={openReviewModal}
          onAssignBid={handleAssignEstimatorAndDate}
        />
      ) : (
        <>
          {/* QUICK CATEGORIZATION STICKER FILTER BAR */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-2 pr-1">
            Filter by Sticker:
          </span>

          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Active ({bids.filter((b) => b.sticker !== 'Spam').length})
          </button>

          <button
            onClick={() => setActiveFilter('ITB')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'ITB'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span>ITB (Invitation to Bid)</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
              {countITB}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('Addendum')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'Addendum'
                ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-300'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
            }`}
          >
            <span>Addendum</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
              {countAddendum}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('Won')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'Won'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <span>Won</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
              {countWon}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('Lost')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'Lost'
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <span>Lost</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
              {countLost}
            </span>
          </button>
        </div>

        <button
          onClick={() => setActiveFilter('Spam')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            activeFilter === 'Spam'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          <span>Spam / Noise</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
            {countSpam}
          </span>
        </button>
      </div>

      {/* Main Grouped Dispatch List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {activeFilter === 'ALL' && 'All Active Inbound Opportunities'}
              {activeFilter === 'ITB' && 'New ITBs (Invitations to Bid) — Assign to Estimators'}
              {activeFilter === 'Addendum' && 'Addendums & Drawings — Linked to Existing Bid Folders'}
              {activeFilter === 'Won' && 'Won Bids — Ready for Active Job Phase Promotion'}
              {activeFilter === 'Lost' && 'Lost / Cancelled Opportunities'}
              {activeFilter === 'Spam' && 'Auto-Filtered Noise & Vendor Solicitations'}
            </h3>
            <p className="text-xs text-slate-500">
              {activeFilter === 'ITB' && 'Every unique ITB receives an internal Bid Number (BID-26-XXXX) and requires an assigned estimator.'}
              {activeFilter !== 'ITB' && activeFilter !== 'Spam' && 'These do not get assigned separately. They attach directly to an active Bid Number.'}
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {Object.keys(groupedBids).length} Project Group{Object.keys(groupedBids).length === 1 ? '' : 's'}
          </span>
        </div>

        {Object.keys(groupedBids).length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No emails found matching the &quot;{activeFilter}&quot; sticker.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {Object.entries(groupedBids).map(([groupId, groupItems]) => {
              const isExpanded = expandedGroups[groupId] ?? false;
              const primary = groupItems.find((b) => !b.isFlaggedDuplicate) || groupItems[0];
              const duplicates = groupItems.filter((b) => b.id !== primary.id);

              return (
                <div key={groupId} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <button
                        onClick={() => toggleGroup(groupId)}
                        className="mt-1 text-slate-400 hover:text-slate-600 focus:outline-none"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>

                      <div className="space-y-2 flex-1">
                        {/* Categorization Sticker + Bid # + Subject */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          {renderStickerBadge(primary.sticker, primary)}

                          {/* Internal Bid Number for ITBs */}
                          {primary.sticker === 'ITB' && primary.bidNumber && (
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                              <Hash className="w-3 h-3 text-blue-600" /> {primary.bidNumber}
                            </span>
                          )}

                          {/* Matched Bid Number for Addendum / Won / Lost */}
                          {primary.sticker !== 'ITB' && primary.matchedBidNumber && (
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3 text-purple-600" /> Attached to {primary.matchedBidNumber}
                            </span>
                          )}

                          {primary.jobCode && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-800">
                              {primary.jobCode}
                            </span>
                          )}

                          <span className="font-semibold text-slate-900 text-base">
                            {primary.subject}
                          </span>

                          {duplicates.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              {duplicates.length} Related Inquiry
                            </span>
                          )}
                        </div>

                        {/* Forwarded Header / GC Details */}
                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          {primary.isForwarded ? (
                            <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-medium border border-indigo-100">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                              GC / Client: <strong>{primary.originalSenderName || primary.senderName}</strong> &lt;{primary.originalSenderEmail || primary.senderEmail}&gt;
                              <span className="text-indigo-400 font-normal">↳ (via {primary.forwardedBy || 'Coworker'})</span>
                            </span>
                          ) : (
                            <span>Sender: <strong>{primary.senderName}</strong> &lt;{primary.senderEmail}&gt;</span>
                          )}

                          <span className="text-slate-400">•</span>
                          <span>Received: {primary.receivedAt}</span>
                          <span className="text-slate-400">•</span>
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3.5 h-3.5" />
                            {primary.attachmentsCount} Attachment{primary.attachmentsCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* AI Matching Info (for Addendum, Won, Lost) */}
                        {primary.sticker !== 'ITB' && primary.matchedBidNumber && (
                          <div className="p-2.5 bg-purple-50/70 rounded-lg border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
                              <span>
                                <strong>Linked Bid Folder:</strong> Attached to <strong>{primary.matchedBidNumber}</strong> {primary.matchReason ? `(${primary.matchReason})` : ''}
                              </span>
                            </div>
                            <button
                              onClick={() => openReviewModal(primary)}
                              className="text-[11px] font-bold text-purple-700 hover:text-purple-900 underline"
                            >
                              Change Link
                            </button>
                          </div>
                        )}

                        {/* AI Scope Summary Card */}
                        {primary.scopeSummary && (
                          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                            <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                              <Sparkles className="w-3.5 h-3.5" />
                              AI Scope Summary:
                            </div>
                            <p className="leading-relaxed">{primary.scopeSummary}</p>
                          </div>
                        )}

                        {/* View Email Content Dropdown Button */}
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleEmailDropdown(primary.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors shadow-2xs"
                          >
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            <span>{expandedEmails[primary.id] ? 'Hide Document / PDF' : 'View Email Document / PDF'}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedEmails[primary.id] ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {/* Expandable Document / PDF Viewer on Card */}
                        {expandedEmails[primary.id] && (
                          <div className="mt-2.5 animate-in fade-in slide-in-from-top-1">
                            <EmailDocumentViewer
                              id={primary.id}
                              subject={primary.subject}
                              senderName={primary.senderName}
                              senderEmail={primary.senderEmail}
                              receivedAt={primary.receivedAt}
                              isForwarded={primary.isForwarded}
                              forwardedBy={primary.forwardedBy}
                              originalSenderName={primary.originalSenderName}
                              originalSenderEmail={primary.originalSenderEmail}
                              bodyText={primary.bodyText}
                              bodyHtml={primary.bodyHtml}
                              attachments={primary.attachments}
                              maxHeight="h-[480px]"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Operational Action Column */}
                    <div className="flex items-center gap-3">
                      {/* RULE: ONLY ITBs ARE ASSIGNED TO ESTIMATORS & SCHEDULED ON CALENDAR */}
                      {primary.sticker === 'ITB' && (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                          {/* Estimator Selector */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 font-semibold">Estimator:</span>
                            <select
                              value={primary.assignedEstimator || ''}
                              onChange={(e) => handleAssignEstimatorAndDate(primary.id, e.target.value, undefined)}
                              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 shadow-2xs"
                            >
                              <option value="">Assign Estimator...</option>
                              {ESTIMATORS.map((est) => (
                                <option key={est} value={est}>
                                  {est}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Calendar Bid Due Date */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
                              Due:
                            </span>
                            <input
                              type="date"
                              value={primary.bidDueDate || ''}
                              onChange={(e) => handleAssignEstimatorAndDate(primary.id, undefined, e.target.value)}
                              className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 shadow-2xs"
                            />

                            {/* AI Suggestion Chip if not yet confirmed */}
                            {!primary.bidDueDate && primary.normalizedAiDueDate && (
                              <button
                                type="button"
                                onClick={() => handleAssignEstimatorAndDate(primary.id, undefined, primary.normalizedAiDueDate)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 shadow-2xs transition-colors"
                                title={`Accept AI detected date: ${primary.rawAiDueDate || primary.normalizedAiDueDate}`}
                              >
                                <Sparkles className="w-3 h-3 text-indigo-600" />
                                <span>Accept AI: {formatFriendlyDate(primary.normalizedAiDueDate).split(',')[1]}</span>
                              </button>
                            )}

                            {primary.bidDueDate && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getDueDateStatus(primary.bidDueDate).badgeClass}`}>
                                {getDueDateStatus(primary.bidDueDate).label}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* WON: PROMOTE TO ACTIVE JOB */}
                      {primary.sticker === 'Won' && (
                        <button className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Promote to Active Job
                        </button>
                      )}

                      {/* ADDENDUM: AUTO-LINKED NOTICE */}
                      {primary.sticker === 'Addendum' && (
                        <div className="text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                            Attached to Folder
                          </span>
                        </div>
                      )}

                      {/* LOST: ARCHIVED NOTICE */}
                      {primary.sticker === 'Lost' && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          Closed / Archived
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Duplicate Children View */}
                  {isExpanded && duplicates.length > 0 && (
                    <div className="mt-4 ml-8 pl-4 border-l-2 border-amber-300 space-y-3">
                      <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                        <Copy className="w-3.5 h-3.5 text-amber-600" />
                        Related Inquiries / Coworker Forwards Grouped Under This Bid
                      </p>

                      {duplicates.map((dup) => (
                        <div
                          key={dup.id}
                          className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-slate-800 flex items-center gap-2">
                              {renderStickerBadge(dup.sticker, dup)}
                              <span className="text-amber-700">↳</span>
                              {dup.subject}
                            </div>
                            <span className="text-slate-400">{dup.receivedAt}</span>
                          </div>

                          <div className="text-slate-600 flex items-center gap-3">
                            <span>From: {dup.senderEmail}</span>
                            <span>Attachments: {dup.attachmentsCount}</span>
                          </div>

                          {dup.scopeSummary && (
                            <p className="text-[11px] text-slate-600 bg-white/70 p-2 rounded border border-amber-100">
                              {dup.scopeSummary}
                            </p>
                          )}

                          <div>
                            <button
                              type="button"
                              onClick={() => toggleEmailDropdown(dup.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:text-amber-950 underline"
                            >
                              <FileText className="w-3 h-3 text-amber-700" />
                              <span>{expandedEmails[dup.id] ? 'Hide Document / PDF' : 'View Email Document / PDF'}</span>
                              <ChevronDown className={`w-3 h-3 transition-transform ${expandedEmails[dup.id] ? 'rotate-180' : ''}`} />
                            </button>
                          </div>

                          {expandedEmails[dup.id] && (
                            <div className="mt-2 animate-in fade-in">
                              <EmailDocumentViewer
                                id={dup.id}
                                subject={dup.subject}
                                senderName={dup.senderName}
                                senderEmail={dup.senderEmail}
                                receivedAt={dup.receivedAt}
                                isForwarded={dup.isForwarded}
                                forwardedBy={dup.forwardedBy}
                                originalSenderName={dup.originalSenderName}
                                originalSenderEmail={dup.originalSenderEmail}
                                bodyText={dup.bodyText}
                                bodyHtml={dup.bodyHtml}
                                attachments={dup.attachments}
                                maxHeight="h-[320px]"
                                compact
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* HUMAN-IN-THE-LOOP REVIEW & RECLASSIFICATION MODAL */}
      {reviewingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col p-6 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Calendar Manager Review
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Change Classification & Adjust Workflow
                </h3>
              </div>
              <button
                onClick={() => setReviewingBid(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="overflow-y-auto pr-1 py-4 space-y-5 flex-1">
              {/* Email Details & Raw Content Accordion */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden text-xs">
                <div className="p-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-sm leading-snug">
                      {reviewingBid.subject}
                    </h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700 flex-shrink-0">
                      Current: {reviewingBid.sticker}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600 flex-wrap">
                    {reviewingBid.isForwarded ? (
                      <span className="inline-flex items-center gap-1 text-indigo-700 font-medium">
                        <UserCheck className="w-3 h-3 text-indigo-500" />
                        Client/GC: <strong>{reviewingBid.originalSenderName || reviewingBid.senderName}</strong> &lt;{reviewingBid.originalSenderEmail || reviewingBid.senderEmail}&gt;
                        <span className="text-indigo-400 font-normal">↳ (via {reviewingBid.forwardedBy || 'Coworker'})</span>
                      </span>
                    ) : (
                      <span>From: <strong>{reviewingBid.senderName}</strong> &lt;{reviewingBid.senderEmail}&gt;</span>
                    )}
                    <span className="text-slate-400">•</span>
                    <span>Received: {reviewingBid.receivedAt}</span>
                    {reviewingBid.attachments && reviewingBid.attachments.length > 0 && (
                      <>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-700 font-medium flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          {reviewingBid.attachments.length} attachment{reviewingBid.attachments.length > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>

                  {reviewingBid.scopeSummary && (
                    <div className="mt-2 p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-lg text-slate-700">
                      <span className="font-semibold text-indigo-900 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-600" /> AI Scope Summary:
                      </span>
                      <p className="mt-0.5 text-[11px] leading-relaxed">{reviewingBid.scopeSummary}</p>
                    </div>
                  )}

                  {reviewingBid.attachments && reviewingBid.attachments.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-600 font-semibold flex items-center gap-1 text-[11px]">
                        <Paperclip className="w-3 h-3 text-blue-600" />
                        Attached Files ({reviewingBid.attachments.length}):
                      </span>
                      {reviewingBid.attachments.map((att, idx) => {
                        const fileUrl =
                          att.storageUrl ||
                          `/api/bid-requests/${reviewingBid.id}/attachments/${encodeURIComponent(att.filename)}`;
                        return (
                          <a
                            key={idx}
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 text-[11px] font-medium transition-colors shadow-2xs group"
                            title={`Open / preview ${att.filename}`}
                          >
                            <FileText className="w-3 h-3 text-blue-600" />
                            <span className="truncate max-w-[180px]">{att.filename}</span>
                            <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600 opacity-60" />
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Email Document / PDF Accordion Dropdown */}
                <div className="border-t border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowModalEmailBody(!showModalEmailBody)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-blue-700 font-bold">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Email Document / PDF Preview (Original Structure)
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      {showModalEmailBody ? 'Hide Document Preview' : 'Show Document Preview'}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showModalEmailBody ? 'rotate-180' : ''}`} />
                    </span>
                  </button>

                  {showModalEmailBody && (
                    <div className="p-3 border-t border-slate-200 animate-in fade-in">
                      <EmailDocumentViewer
                        id={reviewingBid.id}
                        subject={reviewingBid.subject}
                        senderName={reviewingBid.senderName}
                        senderEmail={reviewingBid.senderEmail}
                        receivedAt={reviewingBid.receivedAt}
                        isForwarded={reviewingBid.isForwarded}
                        forwardedBy={reviewingBid.forwardedBy}
                        originalSenderName={reviewingBid.originalSenderName}
                        originalSenderEmail={reviewingBid.originalSenderEmail}
                        bodyText={reviewingBid.bodyText}
                        bodyHtml={reviewingBid.bodyHtml}
                        attachments={reviewingBid.attachments}
                        maxHeight="h-[440px]"
                      />
                    </div>
                  )}
                </div>
              </div>

            {/* 1. Sticker Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Correct Sticker:
              </label>
              <div className="grid grid-cols-5 gap-2">
                {(['ITB', 'Addendum', 'Won', 'Lost', 'Spam'] as const).map((s) => {
                  const isSelected = targetSticker === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTargetSticker(s)}
                      className={`py-2 px-1 text-center rounded-lg text-xs font-bold border transition-all ${
                        isSelected
                          ? s === 'ITB'
                            ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300'
                            : s === 'Addendum'
                            ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-300'
                            : s === 'Won'
                            ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300'
                            : s === 'Lost'
                            ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300'
                            : 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-300'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. DYNAMIC WORKFLOW SECTION BASED ON SELECTED STICKER */}
            {/* If ITB: Enable Estimator Assignment & Confirm Bid # & Due Date */}
            {targetSticker === 'ITB' && (
              <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 text-xs space-y-3.5">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <Hash className="w-4 h-4 text-blue-600" />
                  <span>ITB Workflow: Internal Bid Number, Estimator & Calendar Due Date</span>
                </div>
                <p className="text-blue-800 text-[11px] leading-relaxed">
                  This opportunity will be registered as a standalone bid (assigned its own <strong>BID-26-XXXX</strong> number). Confirm the bid due date to place it on the calendar and assign an estimator.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Estimator Assignment */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 text-blue-600" />
                      Assign Estimator:
                    </label>
                    <select
                      value={selectedEstimatorForITB}
                      onChange={(e) => setSelectedEstimatorForITB(e.target.value)}
                      className="w-full text-xs border border-blue-300 rounded-lg p-2 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    >
                      <option value="">Leave Unassigned (Needs Assignment)</option>
                      {ESTIMATORS.map((est) => (
                        <option key={est} value={est}>
                          {est}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Calendar Bid Due Date */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3 text-blue-600" />
                      Assign Calendar Due Date:
                    </label>
                    <input
                      type="date"
                      value={selectedDueDateForITB}
                      onChange={(e) => setSelectedDueDateForITB(e.target.value)}
                      className="w-full text-xs border border-blue-300 rounded-lg p-2 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 shadow-2xs"
                    />
                  </div>
                </div>

                {/* AI Detected Due Date Suggestion Chip */}
                {reviewingBid.normalizedAiDueDate && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <span>
                        <strong>AI Detected Due Date in Email:</strong>{' '}
                        <span className="font-semibold text-indigo-800">
                          {formatFriendlyDate(reviewingBid.normalizedAiDueDate)}
                        </span>
                        {reviewingBid.rawAiDueDate && reviewingBid.rawAiDueDate !== reviewingBid.normalizedAiDueDate && (
                          <span className="text-slate-500 text-[10px]"> ({reviewingBid.rawAiDueDate})</span>
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDueDateForITB(reviewingBid.normalizedAiDueDate || '')}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shadow-2xs transition-colors"
                    >
                      Use Suggested Date
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* If Addendum, Won, or Lost: Select Existing Bid Number */}
            {(targetSticker === 'Addendum' || targetSticker === 'Won' || targetSticker === 'Lost') && (
              <div className="p-4 bg-purple-50/70 rounded-xl border border-purple-200 text-xs space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-purple-900">
                  <LinkIcon className="w-4 h-4 text-purple-600" />
                  <span>
                    {targetSticker === 'Addendum' && 'Addendum Workflow: Link to Existing Bid Folder'}
                    {targetSticker === 'Won' && 'Won Workflow: Match to Bid & Prepare for Job Promotion'}
                    {targetSticker === 'Lost' && 'Lost Workflow: Match to Bid & Archive'}
                  </span>
                </div>
                <p className="text-purple-800 text-[11px] leading-relaxed">
                  {targetSticker === 'Addendum' &&
                    'This email will be attached directly to the chosen bid folder. No separate estimator assignment will be created.'}
                  {targetSticker === 'Won' &&
                    'This will mark the selected bid as WON and unlock the Promote to Active Job transition.'}
                  {targetSticker === 'Lost' &&
                    'This will close the selected bid as Lost and archive it from active estimating.'}
                </p>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-purple-950 uppercase tracking-wider">
                      Select Active Bid to Attach To:
                    </label>
                    <span className="text-[10px] text-purple-600 font-medium">
                      {activeITBsWithNumbers.length} Active Bids
                    </span>
                  </div>

                  {/* Search box if many bids */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search active bids by project, GC, or number..."
                      value={bidSearchQuery}
                      onChange={(e) => setBidSearchQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 border border-purple-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Bid Selection Dropdown / Radio list */}
                  <div className="max-h-44 overflow-y-auto divide-y divide-purple-100 border border-purple-200 rounded-lg bg-white">
                    {filteredBidsForLinking.length === 0 ? (
                      <p className="p-3 text-slate-400 text-center text-xs">
                        No matching active bids found.
                      </p>
                    ) : (
                      filteredBidsForLinking.map((b) => {
                        const isChosen = selectedBidNumberToLink === b.bidNumber;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBidNumberToLink(b.bidNumber!)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isChosen
                                ? 'bg-purple-100/70 text-purple-950 font-bold'
                                : 'hover:bg-purple-50/50 text-slate-700'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono px-1.5 py-0.5 rounded bg-purple-200 text-purple-900 text-[10px]">
                                  {b.bidNumber}
                                </span>
                                <span className="truncate max-w-[280px]">
                                  {b.subject}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Client: {b.senderName} • Assigned: {b.assignedEstimator || 'Unassigned'}
                              </p>
                            </div>
                            {isChosen && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* If Spam: Notice */}
              {targetSticker === 'Spam' && (
                <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 text-xs text-slate-700 space-y-1">
                  <p className="font-bold text-slate-900">Spam / Noise Workflow:</p>
                  <p className="text-[11px] leading-relaxed">
                    This email will be removed from your active dispatch queue and archived into the <strong>Spam / Noise</strong> tab.
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReviewingBid(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReclassification}
                disabled={isSavingReclassification || (targetSticker !== 'ITB' && targetSticker !== 'Spam' && !selectedBidNumberToLink)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingReclassification ? 'Updating Workflow...' : 'Save & Update Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
