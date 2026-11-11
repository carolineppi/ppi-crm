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
  ChevronLeft,
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
  Tag,
  Building2,
  AlertTriangle,
  Unlink,
  ArrowRightLeft,
  HelpCircle,
  Brain,
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
  projectAddress?: string | null;
  duplicateGroupId: string;
  isFlaggedDuplicate: boolean;
  duplicateReasons: string[];
  triageStatus: 'pending_triage' | 'in_triage' | 'ready_for_assignment' | 'assigned' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedEstimator: string | null;
  bidDueDate?: string | null;
  rawAiDueDate?: string | null;
  normalizedAiDueDate?: string | null;
  isDueDateRevised?: boolean;
  revisedDueDate?: string | null;
  isGcWonPrime?: boolean;
  attachmentsCount: number;
  attachments?: Array<{ filename: string; size?: number; contentType?: string; storageUrl?: string }>;

  // Email Body Content
  bodyText?: string | null;
  bodyHtml?: string | null;

  // Definitive Category Sticker (Human Label takes precedence over AI intent)
  sticker: string;
  isHumanLabeled?: boolean;
  humanLabel?: string | null;
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
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'human_only' | 'unverified_only'>('all');
  const [viewMode, setViewMode] = useState<'feed' | 'calendar'>('feed');
  const [isUsingLiveDb, setIsUsingLiveDb] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Pagination & Search States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');

  // Reset to page 1 whenever active filter or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, verificationFilter, feedSearchQuery]);

  // Review & Reclassification Modal State
  const [reviewingBid, setReviewingBid] = useState<DisplayBidRequest | null>(null);
  const [targetSticker, setTargetSticker] = useState<DisplayBidRequest['sticker']>('ITB');
  const [selectedBidNumberToLink, setSelectedBidNumberToLink] = useState<string>('');
  const [selectedEstimatorForITB, setSelectedEstimatorForITB] = useState<string>('');
  const [selectedDueDateForITB, setSelectedDueDateForITB] = useState<string>('');
  const [isGcWonPrimeCheckbox, setIsGcWonPrimeCheckbox] = useState(false);
  const [linkToExistingItb, setLinkToExistingItb] = useState(false);
  const [addendumRevisedDueDateInput, setAddendumRevisedDueDateInput] = useState('');
  const [bidSearchQuery, setBidSearchQuery] = useState('');
  const [isSavingReclassification, setIsSavingReclassification] = useState(false);
  const [showModalEmailBody, setShowModalEmailBody] = useState(true);

  // Standalone Link / Relink Modal State (for Calendar Manager)
  const [linkingBid, setLinkingBid] = useState<DisplayBidRequest | null>(null);
  const [targetBidNumberForLink, setTargetBidNumberForLink] = useState('');
  const [relinkSearchQuery, setRelinkSearchQuery] = useState('');
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);

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
          const isHuman = Boolean(
            r.is_human_labeled ||
            r.duplicate_resolution === 'human_verified' ||
            r.raw_payload?.is_labeled === true ||
            r.raw_payload?.human_verified === true
          );
          const rawHumanLabel = r.human_label || r.raw_payload?.human_label || r.raw_payload?.custom_category;

          let sticker: string = 'ITB';
          if (isHuman && rawHumanLabel) {
            // User's personal human label takes 100% authoritative precedence!
            sticker = rawHumanLabel;
          } else {
            if (r.email_intent === 'addendum_update') sticker = 'Addendum';
            else if (r.email_intent === 'bid_won') sticker = 'Won';
            else if (r.email_intent === 'bid_lost') sticker = 'Lost';
            else if (r.email_intent === 'spam_noise') sticker = 'Spam';
            else if (r.email_intent === 'general_inquiry') sticker = 'General';
          }

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
          const projectAddress = [r.project_address_street, r.project_address_city, r.project_address_state, r.project_address_zip]
            .filter(Boolean)
            .join(', ') || r.ai_analysis?.projectAddress || null;
          const isDueDateRevised = Boolean(r.is_due_date_revised);
          const revisedDueDate = r.revised_due_date ? normalizeDateToYyyyMmDd(r.revised_due_date) : null;
          const isGcWonPrime = Boolean(r.is_gc_won_prime);

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
            projectAddress,
            duplicateGroupId: r.duplicate_group_id || r.id,
            isFlaggedDuplicate: r.is_flagged_duplicate,
            duplicateReasons: r.duplicate_reasons || [],
            triageStatus: r.triage_status || 'pending_triage',
            priority: r.priority || 'normal',
            assignedEstimator: assignedName,
            bidDueDate,
            rawAiDueDate,
            normalizedAiDueDate,
            isDueDateRevised,
            revisedDueDate,
            isGcWonPrime,
            attachmentsCount: attachmentsList.length,
            attachments: attachmentsList,
            bodyText: r.email_body_text || r.raw_payload?.bodyText || r.raw_payload?.body || null,
            bodyHtml: r.email_body_html || r.raw_payload?.bodyHtml || null,
            sticker,
            isHumanLabeled: isHuman,
            humanLabel: rawHumanLabel || null,
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

  // Filter based on verification status, active sticker filter bar, and search query
  const filteredBids = bids.filter((b) => {
    // 1. Verification filter mode (All vs Human Verified Only vs AI Pending)
    if (verificationFilter === 'human_only' && !b.isHumanLabeled) return false;
    if (verificationFilter === 'unverified_only' && b.isHumanLabeled) return false;

    // 2. Sticker filter
    if (activeFilter === 'ALL') {
      if (b.sticker === 'Spam' || b.filterStatus === 'auto_filtered') return false;
    } else if (activeFilter === 'Won') {
      if (b.sticker !== 'Won' && b.sticker !== 'Contractor Awarded') return false;
    } else if (b.sticker !== activeFilter) {
      return false;
    }

    // 2. Search query filter
    if (feedSearchQuery.trim()) {
      const q = feedSearchQuery.toLowerCase();
      const matchSubject = b.subject?.toLowerCase().includes(q);
      const matchSender = b.senderName?.toLowerCase().includes(q) || b.senderEmail?.toLowerCase().includes(q);
      const matchOriginalSender = b.originalSenderName?.toLowerCase().includes(q) || b.originalSenderEmail?.toLowerCase().includes(q);
      const matchProject = b.projectName?.toLowerCase().includes(q);
      const matchClient = b.clientCompany?.toLowerCase().includes(q);
      const matchBidNum = b.bidNumber?.toLowerCase().includes(q) || b.matchedBidNumber?.toLowerCase().includes(q);
      const matchJobCode = b.jobCode?.toLowerCase().includes(q);

      if (!matchSubject && !matchSender && !matchOriginalSender && !matchProject && !matchClient && !matchBidNum && !matchJobCode) {
        return false;
      }
    }

    return true;
  });

  const groupedBids = filteredBids.reduce<Record<string, DisplayBidRequest[]>>((acc, bid) => {
    acc[bid.duplicateGroupId] = acc[bid.duplicateGroupId] || [];
    acc[bid.duplicateGroupId].push(bid);
    return acc;
  }, {});

  // Pagination Calculations (default 50 per page like standard email clients)
  const allGroupEntries = Object.entries(groupedBids);
  const totalGroups = allGroupEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalGroups / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalGroups);
  const paginatedGroupEntries = allGroupEntries.slice(startIndex, endIndex);

  const getPaginationPages = () => {
    const delta = 2;
    const range: (number | string)[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= safeCurrentPage - delta && i <= safeCurrentPage + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }
    return range;
  };

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
    setIsGcWonPrimeCheckbox(Boolean(bid.isGcWonPrime));
    setLinkToExistingItb(Boolean(bid.isFlaggedDuplicate && bid.matchedBidNumber));
    setAddendumRevisedDueDateInput(bid.revisedDueDate || '');
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
        if (linkToExistingItb && selectedBidNumberToLink) {
          payload.linkToBidNumber = selectedBidNumberToLink;
        } else {
          payload.assignedEstimator = selectedEstimatorForITB || null;
          payload.bidDueDate = selectedDueDateForITB || null;
        }
      } else if (targetSticker === 'Addendum') {
        payload.matchedBidNumber = selectedBidNumberToLink || null;
        if (addendumRevisedDueDateInput) {
          payload.acceptRevisedDueDate = true;
          payload.revisedDueDate = addendumRevisedDueDateInput;
        }
      } else if (targetSticker === 'Won') {
        payload.matchedBidNumber = selectedBidNumberToLink || null;
        payload.isGcWonPrime = isGcWonPrimeCheckbox;
      } else if (targetSticker === 'Lost') {
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

  // 4. Standalone Link / Relink Modal Open & Handlers
  const openLinkModal = (bid: DisplayBidRequest) => {
    setLinkingBid(bid);
    setTargetBidNumberForLink(bid.matchedBidNumber || (activeITBsWithNumbers[0]?.bidNumber || ''));
    setRelinkSearchQuery('');
  };

  const handleExecuteLink = async (sourceBidId: string, targetBidNumber: string) => {
    if (!targetBidNumber) {
      showToast('Please select an active project / bid number to link to.');
      return;
    }
    setIsLinkingLoading(true);
    try {
      const res = await fetch(`/api/bid-requests/${sourceBidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkToBidNumber: targetBidNumber }),
      });
      if (res.ok) {
        showToast(`✔ Linked to ${targetBidNumber}! Shared folder and estimator updated.`);
        setLinkingBid(null);
        if (reviewingBid) setReviewingBid(null);
        await fetchLiveBids();
      } else {
        const err = await res.json();
        showToast(`Failed to link: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    } finally {
      setIsLinkingLoading(false);
    }
  };

  // 5. Unlink Bid Handler (Calendar Manager Manual Intervention)
  const handleUnlinkBid = async (bidId: string) => {
    if (!confirm('Are you sure you want to unlink this email? It will become an independent bid folder with its own bid number.')) {
      return;
    }
    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlinkFromGroup: true }),
      });
      if (res.ok) {
        showToast('✔ Email unlinked and detached into its own project folder!');
        if (reviewingBid) setReviewingBid(null);
        await fetchLiveBids();
      } else {
        const err = await res.json();
        showToast(`Failed to unlink: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
  };

  // 6. Accept Revised Due Date Handler (from Addendum)
  const handleAcceptRevisedDueDate = async (bidId: string, revisedDueDate: string) => {
    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptRevisedDueDate: true, revisedDueDate }),
      });
      if (res.ok) {
        showToast(`✔ Calendar bid due date updated to ${formatFriendlyDate(revisedDueDate)}!`);
        await fetchLiveBids();
      } else {
        const err = await res.json();
        showToast(`Failed to update due date: ${err.error || 'Server error'}`);
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`);
    }
  };

  // Filter list of active ITBs for linking modal
  const filteredBidsForRelinking = activeITBsWithNumbers.filter((b) => {
    if (!linkingBid) return false;
    if (b.id === linkingBid.id) return false;
    if (!relinkSearchQuery.trim()) return true;
    const q = relinkSearchQuery.toLowerCase();
    return (
      b.bidNumber?.toLowerCase().includes(q) ||
      b.subject.toLowerCase().includes(q) ||
      b.senderName.toLowerCase().includes(q) ||
      b.clientCompany?.toLowerCase().includes(q) ||
      b.projectName?.toLowerCase().includes(q) ||
      b.jobCode?.toLowerCase().includes(q)
    );
  });

  // Sticker counts
  const countITB = bids.filter((b) => b.sticker === 'ITB').length;
  const countAddendum = bids.filter((b) => b.sticker === 'Addendum').length;
  const countRFI = bids.filter((b) => b.sticker === 'RFI/Forms').length;
  const countReminder = bids.filter((b) => b.sticker === 'Date Reminder').length;
  const countUnknown = bids.filter((b) => b.sticker === 'Unknown').length;
  const countWon = bids.filter((b) => b.sticker === 'Won' || b.sticker === 'Contractor Awarded').length;
  const countLost = bids.filter((b) => b.sticker === 'Lost').length;
  const countSpam = bids.filter((b) => b.sticker === 'Spam').length;
  const countHumanVerified = bids.filter((b) => b.isHumanLabeled).length;
  const countUnverified = bids.filter((b) => !b.isHumanLabeled).length;

  const renderStickerBadge = (sticker: string, bid: DisplayBidRequest) => {
    let badgeClass = 'bg-blue-600 text-white';
    let icon = null;
    let badgeText = sticker === 'ITB' ? 'ITB' : sticker;

    if (sticker === 'Addendum') {
      badgeClass = 'bg-purple-600 text-white';
      icon = <FileSpreadsheet className="w-3 h-3" />;
    } else if (sticker === 'Won') {
      if (bid.isGcWonPrime) {
        badgeClass = 'bg-amber-600 text-white shadow-xs';
        icon = <Trophy className="w-3 h-3 text-amber-200" />;
        badgeText = 'GC Won (Sub Pending)';
      } else {
        badgeClass = 'bg-emerald-600 text-white';
        icon = <Trophy className="w-3 h-3" />;
      }
    } else if (sticker === 'Contractor Awarded') {
      badgeClass = 'bg-amber-600 text-white shadow-xs';
      icon = <Trophy className="w-3 h-3 text-amber-200" />;
      badgeText = 'Contractor Awarded';
    } else if (sticker === 'RFI/Forms') {
      badgeClass = 'bg-cyan-600 text-white shadow-xs';
      icon = <Tag className="w-3 h-3 text-cyan-200" />;
    } else if (sticker === 'Date Reminder') {
      badgeClass = 'bg-indigo-600 text-white shadow-xs';
      icon = <Clock className="w-3 h-3 text-indigo-200" />;
    } else if (sticker === 'Unknown') {
      badgeClass = 'bg-slate-600 text-white shadow-xs';
      icon = <HelpCircle className="w-3 h-3 text-slate-200" />;
    } else if (sticker === 'Lost') {
      badgeClass = 'bg-rose-600 text-white';
      icon = <XCircle className="w-3 h-3" />;
    } else if (sticker === 'Spam') {
      badgeClass = 'bg-slate-500 text-white';
      icon = <ShieldAlert className="w-3 h-3" />;
    }

    return (
      <div className="inline-flex items-center gap-1.5 group flex-wrap">
        <span
          title={
            bid.isHumanLabeled
              ? `Personally verified by user: "${sticker}"`
              : `AI classified as ${sticker}`
          }
          className={`px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider shadow-sm flex items-center gap-1 ${badgeClass}`}
        >
          {icon}
          {badgeText}
        </span>

        {/* Human Verified Indicator */}
        {bid.isHumanLabeled && (
          <span
            title="Personally reviewed and verified by user"
            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-2xs"
          >
            <UserCheck className="w-3 h-3 text-emerald-600" />
            <span>User Verified</span>
          </span>
        )}

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

          <Link
            href="/label"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs"
            title="Mobile Data Labeling App (Optimized for Samsung Galaxy S24 FE)"
          >
            <Tag className="w-4 h-4 text-purple-600" />
            <span>Quick Labeler</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-purple-200/60 text-purple-900 font-mono">
              S24 FE
            </span>
          </Link>

          <Link
            href="/model"
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
            title="ML Multiclass Classification Model Lab & 80/20 Test Metrics"
          >
            <Brain className="w-4 h-4 text-emerald-600" />
            <span>ML Model Lab</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-200/60 text-emerald-950 font-mono">
              80/20 Test
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
          {/* QUICK CATEGORIZATION STICKER FILTER BAR & IN-FEED SEARCH */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 flex-wrap">
              {/* Human vs AI Verification Mode Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold mr-1">
                <button
                  type="button"
                  onClick={() => setVerificationFilter('all')}
                  className={`px-2 py-1 rounded-md transition-all ${
                    verificationFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({bids.length})
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationFilter('human_only')}
                  className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                    verificationFilter === 'human_only'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                  title="Show only emails personally verified by user"
                >
                  <UserCheck className="w-3 h-3" />
                  <span>👤 My Labels ({countHumanVerified})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVerificationFilter('unverified_only')}
                  className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 ${
                    verificationFilter === 'unverified_only'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                  title="Show only unverified AI emails needing human review"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>🤖 AI Only ({countUnverified})</span>
                </button>
              </div>

              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider pl-1 pr-1 hidden lg:inline">
                Stickers:
              </span>

              <button
                onClick={() => setActiveFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Categories
              </button>

              <button
                onClick={() => setActiveFilter('ITB')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'ITB'
                    ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <span>ITB</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countITB}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('RFI/Forms')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'RFI/Forms'
                    ? 'bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-300'
                    : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                }`}
              >
                <span>RFI/Forms</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countRFI}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('Addendum')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
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
                onClick={() => setActiveFilter('Date Reminder')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Date Reminder'
                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                <span>Date Reminder</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countReminder}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('Unknown')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Unknown'
                    ? 'bg-slate-700 text-white shadow-sm ring-2 ring-slate-400'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>Unknown</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countUnknown}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('Won')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Won'
                    ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <span>Won / Award</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countWon}
                </span>
              </button>

              <button
                onClick={() => setActiveFilter('Lost')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
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

              <button
                onClick={() => setActiveFilter('Spam')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Spam'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <span>Spam</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countSpam}
                </span>
              </button>
            </div>

            {/* In-Feed Search Input */}
            <div className="relative min-w-[260px] flex-shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={feedSearchQuery}
                onChange={(e) => setFeedSearchQuery(e.target.value)}
                placeholder="Search subject, GC, project..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
              {feedSearchQuery && (
                <button
                  type="button"
                  onClick={() => setFeedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Main Grouped Dispatch List */}
          <div id="dispatch-feed-list" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-6">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
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

              {/* Email-client style Top Pagination Controls */}
              <div className="flex items-center gap-3 self-end md:self-center">
                {/* Page Size Selector */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="hidden sm:inline">Per page:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="text-xs bg-slate-50 border border-slate-300 rounded px-2 py-1 font-medium text-slate-700 hover:bg-slate-100 cursor-pointer focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                {/* Range indicator (e.g., 1–50 of 384) */}
                <span className="text-xs font-semibold text-slate-700 font-mono">
                  {totalGroups === 0 ? '0 of 0' : `${startIndex + 1}–${endIndex} of ${totalGroups}`}
                </span>

                {/* Prev / Next Chevrons */}
                <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((p) => Math.max(1, p - 1));
                      const el = document.getElementById('dispatch-feed-list');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    disabled={safeCurrentPage <= 1}
                    title="Previous page"
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed border-r border-slate-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                      const el = document.getElementById('dispatch-feed-list');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    disabled={safeCurrentPage >= totalPages}
                    title="Next page"
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {totalGroups === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                {feedSearchQuery
                  ? `No emails found matching "${feedSearchQuery}" in ${activeFilter}.`
                  : `No emails found matching the "${activeFilter}" sticker.`}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {paginatedGroupEntries.map(([groupId, groupItems]) => {
                  const isExpanded = expandedGroups[groupId] ?? false;
                  const primary = groupItems.find((b) => !b.isFlaggedDuplicate) || groupItems[0];
                  const duplicates = groupItems.filter((b) => b.id !== primary.id);

                  // Multi-GC detection across all bidding contractors in this job folder
                  const uniqueGCs = Array.from(
                    new Set(
                      groupItems
                        .map((item) => item.clientCompany || item.originalSenderName || item.senderName)
                        .filter(Boolean)
                    )
                  );
                  const isMultiGCGroup = uniqueGCs.length > 1;

                  // Detect any unaccepted due date revision from an Addendum
                  const dueDateRevisionItem = groupItems.find(
                    (item) => item.isDueDateRevised && item.revisedDueDate
                  );

                  return (
                    <div key={groupId} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                      {/* Addendum Due Date Extension Alert Banner */}
                      {dueDateRevisionItem && (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
                          <div className="flex items-start sm:items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div>
                              <span className="font-bold text-amber-900">⏰ Addendum Due Date Extension Detected:</span>{' '}
                              <span>
                                An addendum revised the bid due date to{' '}
                                <strong className="text-amber-950 underline decoration-amber-500">
                                  {formatFriendlyDate(dueDateRevisionItem.revisedDueDate!)}
                                </strong>
                                .
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleAcceptRevisedDueDate(
                                dueDateRevisionItem.id,
                                dueDateRevisionItem.revisedDueDate!
                              )
                            }
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-colors self-start sm:self-auto flex-shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept & Update Calendar</span>
                          </button>
                        </div>
                      )}

                      {/* Multi-GC Sibling Banner */}
                      {isMultiGCGroup && (
                        <div className="p-3 bg-indigo-50/90 rounded-xl border border-indigo-200 text-xs text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-start sm:items-center gap-2">
                            <Building2 className="w-4 h-4 text-indigo-700 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <div>
                              <span className="font-bold text-indigo-900">Multi-GC Bidding Sibling Group:</span>{' '}
                              <span>
                                Multiple general contractors (<strong>{uniqueGCs.join(', ')}</strong>) are bidding this same facility. One takeoff covers all quotes.
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

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

                              {/* Multi-GC Indicator Badge */}
                              {isMultiGCGroup && (
                                <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-1 shadow-2xs">
                                  <Building2 className="w-3 h-3 text-indigo-700" /> Multi-GC ({uniqueGCs.length} Contractors)
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

                      {/* Link to Project (Calendar Manager Manual Intervention) */}
                      <button
                        type="button"
                        onClick={() => openLinkModal(primary)}
                        title="Link or merge this inquiry into an existing project folder (e.g. Multi-GC bidding)"
                        className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                      >
                        <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                        <span className="hidden sm:inline">Link / Move</span>
                      </button>
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

                          {/* Calendar Manager Link / Unlink Manual Controls */}
                          <div className="flex items-center justify-between pt-2 border-t border-amber-200/60 flex-wrap gap-2">
                            <div className="text-[11px] text-amber-800 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3 text-amber-600" />
                              <span>
                                Grouped under <strong>{primary.bidNumber || primary.subject.slice(0, 30)}</strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openLinkModal(dup)}
                                className="px-2.5 py-1 rounded bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                                title="Relink this email to a different project"
                              >
                                <ArrowRightLeft className="w-3 h-3 text-amber-700" />
                                <span>Relink / Move</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUnlinkBid(dup.id)}
                                className="px-2.5 py-1 rounded bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-2xs"
                                title="Unlink into standalone project"
                              >
                                <Unlink className="w-3 h-3 text-rose-600" />
                                <span>Unlink from Project</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination Bar */}
        {totalGroups > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
            <div className="text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{' '}
              <span className="font-bold text-slate-800">{endIndex}</span> of{' '}
              <span className="font-bold text-slate-800">{totalGroups}</span> project groups
              <span className="text-slate-400 ml-1">({filteredBids.length} total emails)</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {/* First Page */}
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(1);
                  const el = document.getElementById('dispatch-feed-list');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={safeCurrentPage <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors shadow-2xs"
                title="First Page"
              >
                First
              </button>

              {/* Prev Page */}
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  const el = document.getElementById('dispatch-feed-list');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={safeCurrentPage <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors shadow-2xs flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {/* Numbered Page Buttons */}
              <div className="flex items-center gap-1">
                {getPaginationPages().map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 font-bold">
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => {
                        setCurrentPage(Number(p));
                        const el = document.getElementById('dispatch-feed-list');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`min-w-[32px] h-8 px-2 rounded-lg font-bold text-xs transition-colors shadow-2xs ${
                        safeCurrentPage === p
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              {/* Next Page */}
              <button
                type="button"
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  const el = document.getElementById('dispatch-feed-list');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={safeCurrentPage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors shadow-2xs flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(totalPages);
                  const el = document.getElementById('dispatch-feed-list');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                disabled={safeCurrentPage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white disabled:cursor-not-allowed transition-colors shadow-2xs"
                title="Last Page"
              >
                Last
              </button>
            </div>
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
                {(reviewingBid.isFlaggedDuplicate || reviewingBid.matchedBidNumber) && (
                  <button
                    type="button"
                    onClick={() => handleUnlinkBid(reviewingBid.id)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs"
                  >
                    <Unlink className="w-3.5 h-3.5 text-rose-600" />
                    <span>Unlink from Group into Standalone Project</span>
                  </button>
                )}
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
            {/* If ITB: Enable Estimator Assignment OR Multi-GC Sibling Link */}
            {targetSticker === 'ITB' && (
              <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 text-xs space-y-3.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <Hash className="w-4 h-4 text-blue-600" />
                    <span>ITB Routing & Multi-GC Sibling Handling</span>
                  </div>

                  {/* Toggle between Standalone ITB vs Multi-GC Sibling */}
                  <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-blue-200 shadow-2xs">
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-blue-900">
                      <input
                        type="radio"
                        name="itbMode"
                        checked={!linkToExistingItb}
                        onChange={() => setLinkToExistingItb(false)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span>Standalone Project</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-indigo-900">
                      <input
                        type="radio"
                        name="itbMode"
                        checked={linkToExistingItb}
                        onChange={() => setLinkToExistingItb(true)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Multi-GC Sibling (Same Job Site)</span>
                    </label>
                  </div>
                </div>

                {!linkToExistingItb ? (
                  <>
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
                  </>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-indigo-900 text-[11px] leading-relaxed">
                      <strong>Multi-GC Sibling:</strong> Another contractor is bidding this same project. Attaching this ITB will group both contractors under the chosen BID folder so the same estimator handles the takeoff and doesn't quote it twice.
                    </p>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search active project folder to attach to..."
                        value={bidSearchQuery}
                        onChange={(e) => setBidSearchQuery(e.target.value)}
                        className="w-full text-xs pl-8 pr-3 py-1.5 border border-indigo-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto divide-y divide-indigo-100 border border-indigo-200 rounded-lg bg-white">
                      {filteredBidsForLinking.length === 0 ? (
                        <p className="p-3 text-slate-400 text-center text-xs">No active projects found.</p>
                      ) : (
                        filteredBidsForLinking.map((b) => {
                          const isChosen = selectedBidNumberToLink === b.bidNumber;
                          return (
                            <div
                              key={b.id}
                              onClick={() => setSelectedBidNumberToLink(b.bidNumber!)}
                              className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                                isChosen ? 'bg-indigo-100/80 text-indigo-950 font-bold' : 'hover:bg-indigo-50/50 text-slate-700'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono px-1.5 py-0.5 rounded bg-indigo-200 text-indigo-900 text-[10px]">
                                    {b.bidNumber}
                                  </span>
                                  <span className="truncate max-w-[280px]">{b.projectName || b.subject}</span>
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  Contractor: {b.clientCompany || b.senderName} • Estimator: {b.assignedEstimator || 'Unassigned'}
                                </p>
                              </div>
                              {isChosen && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* If Addendum: Link to Bid Folder + Due Date Revision */}
            {targetSticker === 'Addendum' && (
              <div className="p-4 bg-purple-50/70 rounded-xl border border-purple-200 text-xs space-y-3.5">
                <div className="flex items-center gap-1.5 font-bold text-purple-900">
                  <LinkIcon className="w-4 h-4 text-purple-600" />
                  <span>Addendum Workflow: Link to Bid Folder & Due Date Revision</span>
                </div>
                <p className="text-purple-800 text-[11px] leading-relaxed">
                  Addendums attach directly to an active bid folder so the estimator receives updated plans/scopes without creating separate bids.
                </p>

                {/* Due Date Extension Flag & Input */}
                <div className="p-3 bg-white rounded-lg border border-purple-200 space-y-2">
                  <label className="text-[11px] font-bold text-purple-950 uppercase tracking-wider flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-purple-600" />
                    Revised Bid Due Date (if modified in addendum):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={addendumRevisedDueDateInput}
                      onChange={(e) => setAddendumRevisedDueDateInput(e.target.value)}
                      className="text-xs border border-purple-300 rounded-lg p-2 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-purple-500 shadow-2xs"
                    />
                    {addendumRevisedDueDateInput ? (
                      <span className="text-[11px] font-semibold text-purple-700">
                        Will update calendar due date across project to {formatFriendlyDate(addendumRevisedDueDateInput)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Leave blank if no due date change</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-purple-950 uppercase tracking-wider">
                    Select Active Bid Folder to Attach To:
                  </label>
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

                  <div className="max-h-44 overflow-y-auto divide-y divide-purple-100 border border-purple-200 rounded-lg bg-white">
                    {filteredBidsForLinking.length === 0 ? (
                      <p className="p-3 text-slate-400 text-center text-xs">No matching active bids found.</p>
                    ) : (
                      filteredBidsForLinking.map((b) => {
                        const isChosen = selectedBidNumberToLink === b.bidNumber;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBidNumberToLink(b.bidNumber!)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isChosen ? 'bg-purple-100/70 text-purple-950 font-bold' : 'hover:bg-purple-50/50 text-slate-700'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono px-1.5 py-0.5 rounded bg-purple-200 text-purple-900 text-[10px]">
                                  {b.bidNumber}
                                </span>
                                <span className="truncate max-w-[280px]">{b.projectName || b.subject}</span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Client: {b.clientCompany || b.senderName} • Estimator: {b.assignedEstimator || 'Unassigned'}
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

            {/* If Won: Match to Bid + GC Won Prime Contract Option */}
            {targetSticker === 'Won' && (
              <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 text-xs space-y-3.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                  <span>Won Workflow: Match to Bid & Prime Award Status</span>
                </div>

                {/* GC Won Prime Contract Checkbox */}
                <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isGcWonPrimeCheckbox}
                      onChange={(e) => setIsGcWonPrimeCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-bold text-emerald-950 text-xs">
                        GC Won Prime Contract (Subcontractor Quote Pending)
                      </span>
                      <p className="text-[11px] text-emerald-800 leading-snug">
                        The general contractor won the overall project prime contract and Partition Plus is currently waiting or negotiating to be awarded our subcontractor package.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
                    Select Corresponding Active Bid Folder:
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search active bids by project, GC, or number..."
                      value={bidSearchQuery}
                      onChange={(e) => setBidSearchQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 border border-emerald-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-emerald-100 border border-emerald-200 rounded-lg bg-white">
                    {filteredBidsForLinking.length === 0 ? (
                      <p className="p-3 text-slate-400 text-center text-xs">No matching active bids found.</p>
                    ) : (
                      filteredBidsForLinking.map((b) => {
                        const isChosen = selectedBidNumberToLink === b.bidNumber;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBidNumberToLink(b.bidNumber!)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isChosen ? 'bg-emerald-100/70 text-emerald-950 font-bold' : 'hover:bg-emerald-50/50 text-slate-700'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 text-[10px]">
                                  {b.bidNumber}
                                </span>
                                <span className="truncate max-w-[280px]">{b.projectName || b.subject}</span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Client: {b.clientCompany || b.senderName} • Assigned: {b.assignedEstimator || 'Unassigned'}
                              </p>
                            </div>
                            {isChosen && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* If Lost: Match to Bid & Archive */}
            {targetSticker === 'Lost' && (
              <div className="p-4 bg-rose-50/70 rounded-xl border border-rose-200 text-xs space-y-3">
                <div className="flex items-center gap-1.5 font-bold text-rose-900">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Lost Workflow: Match to Bid & Archive</span>
                </div>
                <p className="text-rose-800 text-[11px] leading-relaxed">
                  This will close the selected bid folder as Lost and archive it from active estimating queues.
                </p>

                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search active bids by project, GC, or number..."
                      value={bidSearchQuery}
                      onChange={(e) => setBidSearchQuery(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 border border-rose-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-rose-100 border border-rose-200 rounded-lg bg-white">
                    {filteredBidsForLinking.length === 0 ? (
                      <p className="p-3 text-slate-400 text-center text-xs">No matching active bids found.</p>
                    ) : (
                      filteredBidsForLinking.map((b) => {
                        const isChosen = selectedBidNumberToLink === b.bidNumber;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBidNumberToLink(b.bidNumber!)}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                              isChosen ? 'bg-rose-100/70 text-rose-950 font-bold' : 'hover:bg-rose-50/50 text-slate-700'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px]">
                                  {b.bidNumber}
                                </span>
                                <span className="truncate max-w-[280px]">{b.projectName || b.subject}</span>
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Client: {b.clientCompany || b.senderName} • Assigned: {b.assignedEstimator || 'Unassigned'}
                              </p>
                            </div>
                            {isChosen && <Check className="w-4 h-4 text-rose-600 flex-shrink-0" />}
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
                disabled={
                  isSavingReclassification ||
                  (targetSticker !== 'ITB' && targetSticker !== 'Spam' && !selectedBidNumberToLink) ||
                  (targetSticker === 'ITB' && linkToExistingItb && !selectedBidNumberToLink)
                }
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingReclassification ? 'Updating Workflow...' : 'Save & Update Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STANDALONE PROJECT LINK / RELINK MODAL FOR CALENDAR MANAGER */}
      {linkingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Project Folder Linker
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Link Email into Existing Project
                </h3>
              </div>
              <button
                onClick={() => setLinkingBid(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Being Linked */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900 truncate">{linkingBid.subject}</div>
              <div className="text-slate-600">
                Sender: {linkingBid.senderName} ({linkingBid.senderEmail})
                {linkingBid.clientCompany ? ` • Contractor: ${linkingBid.clientCompany}` : ''}
              </div>
              {linkingBid.projectName && (
                <div className="text-slate-600">
                  Job Site: <strong>{linkingBid.projectName}</strong>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select the active project folder (<strong>BID-26-XXXX</strong>) to attach this email to. If multiple contractors are bidding on the same job, linking them together ensures the same estimator prices the project and doesn't duplicate takeoffs.
            </p>

            {/* Project Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by project name, GC contractor, or BID number..."
                value={relinkSearchQuery}
                onChange={(e) => setRelinkSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Project Selection List */}
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
              {filteredBidsForRelinking.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  No matching active bids found.
                </div>
              ) : (
                filteredBidsForRelinking.map((b) => {
                  const isChosen = targetBidNumberForLink === b.bidNumber;
                  return (
                    <div
                      key={b.id}
                      onClick={() => setTargetBidNumberForLink(b.bidNumber!)}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                        isChosen
                          ? 'bg-blue-50/80 text-blue-950 font-bold border-l-4 border-blue-600'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-bold">
                            {b.bidNumber}
                          </span>
                          <span className="font-semibold text-slate-900 truncate max-w-[340px]">
                            {b.projectName || b.subject}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          GC: {b.clientCompany || b.senderName} • Estimator: {b.assignedEstimator || 'Unassigned'} • Due: {b.bidDueDate ? formatFriendlyDate(b.bidDueDate) : 'No due date'}
                        </div>
                      </div>
                      {isChosen && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLinkingBid(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteLink(linkingBid.id, targetBidNumberForLink)}
                disabled={!targetBidNumberForLink || isLinkingLoading}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isLinkingLoading ? 'Linking...' : 'Confirm & Link into Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
