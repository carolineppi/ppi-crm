'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ArrowLeft,
  FolderArchive,
  RotateCcw,
  Columns,
  ListFilter,
  AlertCircle,
  Maximize2,
  Minimize2,
  Eye,
  CheckCircle2,
  Split,
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
  rawReceivedAt: string; // ISO timestamp
  receivedAt: string;    // Formatted: Time if today, Month DD (ex: Nov 11) if earlier
  jobCode: string | null;
  projectName?: string | null;
  clientCompany?: string | null;
  projectAddress?: string | null;
  duplicateGroupId: string;
  isFlaggedDuplicate: boolean;
  duplicateReasons: string[];
  duplicateResolution?: string | null;
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
  filterStatus: 'inbox' | 'auto_filtered' | 'promoted_to_job' | 'archived' | 'duplicate_folder';

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
  isAutoDispatched?: boolean;
}

interface CrossContractorMatch {
  bid: DisplayBidRequest;
  matchedOn: 'group' | 'job_code' | 'project_name' | 'project_address';
  contractorName: string;
  assignedEstimator: string | null;
  bidNumber?: string | null;
}

const ESTIMATORS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
];

const CATEGORIES = [
  'ITB',
  'Addendum / RFI',
  'Date Reminder',
  'Won',
  'Lost',
  'Spam',
];

/**
 * Format received date:
 * - If received today: list the time (e.g., 10:45 AM)
 * - If anything but today: list Month DD (ex: Nov 11)
 */
function formatReceivedDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = monthNames[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  return `${month} ${day}`;
}

export default function DispatchDashboard() {
  const [bids, setBids] = useState<DisplayBidRequest[]>([]);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [triageSubFilter, setTriageSubFilter] = useState<'all' | 'needs_action' | 'auto_dispatched'>('all');
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'human_only' | 'unverified_only'>('all');
  const [viewMode, setViewMode] = useState<'feed' | 'calendar'>('feed');
  const [layoutMode, setLayoutMode] = useState<'fullscreen' | 'split' | 'list'>('fullscreen');
  const [isSplitMaximized, setIsSplitMaximized] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [isUsingLiveDb, setIsUsingLiveDb] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedEmails, setExpandedEmails] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Pagination & Search States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [feedSearchQuery, setFeedSearchQuery] = useState('');

  // Reset to page 1 whenever active filter, triage sub-filter, verification filter, or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, triageSubFilter, verificationFilter, feedSearchQuery]);

  // Review & Reclassification Modal State
  const [reviewingBid, setReviewingBid] = useState<DisplayBidRequest | null>(null);
  const [targetSticker, setTargetSticker] = useState<string>('ITB');
  const [selectedBidNumberToLink, setSelectedBidNumberToLink] = useState<string>('');
  const [selectedEstimatorForITB, setSelectedEstimatorForITB] = useState<string>('');
  const [selectedDueDateForITB, setSelectedDueDateForITB] = useState<string>('');
  const [isGcWonPrimeCheckbox, setIsGcWonPrimeCheckbox] = useState(false);
  const [linkToExistingItb, setLinkToExistingItb] = useState(false);
  const [addendumRevisedDueDateInput, setAddendumRevisedDueDateInput] = useState('');
  const [bidSearchQuery, setBidSearchQuery] = useState('');
  const [isSavingReclassification, setIsSavingReclassification] = useState(false);
  const [showModalEmailBody, setShowModalEmailBody] = useState(true);

  // Standalone Link / Relink Modal State
  const [linkingBid, setLinkingBid] = useState<DisplayBidRequest | null>(null);
  const [targetBidNumberForLink, setTargetBidNumberForLink] = useState('');
  const [relinkSearchQuery, setRelinkSearchQuery] = useState('');
  const [isLinkingLoading, setIsLinkingLoading] = useState(false);

  // Duplicate Inspection & Comparison Modal State
  const [comparingDuplicateBid, setComparingDuplicateBid] = useState<{
    current: DisplayBidRequest;
    original: DisplayBidRequest;
  } | null>(null);

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
            // Unify Addendum, RFI/Forms, RFI / Scope into 'Addendum / RFI'
            if (
              rawHumanLabel === 'Addendum' ||
              rawHumanLabel === 'RFI/Forms' ||
              rawHumanLabel === 'RFI / Scope' ||
              rawHumanLabel === 'Scopes of Work' ||
              rawHumanLabel === 'Addendum / RFI'
            ) {
              sticker = 'Addendum / RFI';
            } else if (rawHumanLabel === 'General') {
              sticker = 'ITB';
            } else {
              sticker = rawHumanLabel;
            }
          } else {
            if (r.email_intent === 'addendum_update') sticker = 'Addendum / RFI';
            else if (r.email_intent === 'bid_won' || r.email_intent === 'contractor_awarded') sticker = 'Won';
            else if (r.email_intent === 'date_reminder') sticker = 'Date Reminder';
            else if (r.email_intent === 'bid_lost') sticker = 'Lost';
            else if (r.email_intent === 'spam_noise') sticker = 'Spam';
            else sticker = 'ITB';
          }

          const assignedName = r.assigned_estimator_name || r.raw_payload?.assigned_estimator_name || (r.assigned_estimator_id ? 'Assigned' : null);

          const attachmentsList = Array.isArray(r.attachments)
            ? r.attachments
            : Array.isArray(r.raw_payload?.attachments)
            ? r.raw_payload.attachments
            : [];

          const rawReceivedAt = r.email_received_at || r.created_at;
          const receivedAt = formatReceivedDate(rawReceivedAt);

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
            rawReceivedAt,
            receivedAt,
            jobCode: r.job_code,
            projectName,
            clientCompany,
            projectAddress,
            duplicateGroupId: r.duplicate_group_id || r.id,
            isFlaggedDuplicate: Boolean(r.is_flagged_duplicate),
            duplicateReasons: r.duplicate_reasons || [],
            duplicateResolution: r.duplicate_resolution || null,
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
            isAutoDispatched: Boolean(
              r.raw_payload?.auto_dispatched ||
              ((r.match_status === 'auto_matched' || r.match_status === 'confirmed') &&
                assignedName &&
                (r.matched_bid_number || r.matched_bid_id))
            ),
          };
        });
        setBids(mapped);
        setIsUsingLiveDb(true);
      }
    } catch (err) {
      console.error('Error fetching live bids:', err);
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

  // Distinct list of active ITBs with numbers
  const activeITBsWithNumbers = useMemo(() => {
    return bids.filter((b) => b.bidNumber && b.sticker === 'ITB');
  }, [bids]);

  // Set of all real, non-empty bid numbers existing in the database
  const validBidNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const b of bids) {
      if (b.bidNumber && b.bidNumber.trim()) {
        set.add(b.bidNumber.trim());
      }
    }
    return set;
  }, [bids]);

  // Sibling & Cross-Contractor Matching Engine:
  // Detects if the same project has been received from a DIFFERENT GC contractor
  const findCrossContractorMatches = useCallback((target: DisplayBidRequest): CrossContractorMatch[] => {
    if (!target) return [];
    const targetSender = (target.originalSenderEmail || target.senderEmail || '').toLowerCase();
    const targetCompany = (target.clientCompany || target.originalSenderName || target.senderName || '').toLowerCase().trim();
    const targetProject = (target.projectName || '').toLowerCase().trim();
    const targetAddress = (target.projectAddress || '').toLowerCase().trim();
    const targetJobCode = (target.jobCode || '').toLowerCase().trim();

    const matches: CrossContractorMatch[] = [];
    const seenIds = new Set<string>();

    for (const other of bids) {
      if (other.id === target.id) continue;
      if (seenIds.has(other.id)) continue;

      const otherSender = (other.originalSenderEmail || other.senderEmail || '').toLowerCase();
      const otherCompany = (other.clientCompany || other.originalSenderName || other.senderName || '').toLowerCase().trim();

      const isDifferentContractor =
        (targetSender && otherSender && targetSender !== otherSender) ||
        (targetCompany && otherCompany && targetCompany !== otherCompany && !targetCompany.includes(otherCompany) && !otherCompany.includes(targetCompany));

      if (!isDifferentContractor) continue;

      // Only assign bidNumber if that bid number actually exists in the active database
      const validNumber = other.bidNumber && validBidNumbers.has(other.bidNumber)
        ? other.bidNumber
        : other.matchedBidNumber && validBidNumbers.has(other.matchedBidNumber)
        ? other.matchedBidNumber
        : null;

      // 1. Same duplicate group id
      if (target.duplicateGroupId && other.duplicateGroupId && target.duplicateGroupId === other.duplicateGroupId) {
        seenIds.add(other.id);
        matches.push({
          bid: other,
          matchedOn: 'group',
          contractorName: other.clientCompany || other.originalSenderName || other.senderName,
          assignedEstimator: other.assignedEstimator,
          bidNumber: validNumber,
        });
        continue;
      }

      // 2. Same job code
      if (targetJobCode && other.jobCode && targetJobCode === other.jobCode.toLowerCase().trim()) {
        seenIds.add(other.id);
        matches.push({
          bid: other,
          matchedOn: 'job_code',
          contractorName: other.clientCompany || other.originalSenderName || other.senderName,
          assignedEstimator: other.assignedEstimator,
          bidNumber: validNumber,
        });
        continue;
      }

      // 3. Same project name (at least 6 characters)
      if (targetProject && targetProject.length >= 6 && other.projectName) {
        const otherProj = other.projectName.toLowerCase().trim();
        if (otherProj.length >= 6 && (targetProject === otherProj || targetProject.includes(otherProj) || otherProj.includes(targetProject))) {
          seenIds.add(other.id);
          matches.push({
            bid: other,
            matchedOn: 'project_name',
            contractorName: other.clientCompany || other.originalSenderName || other.senderName,
            assignedEstimator: other.assignedEstimator,
            bidNumber: validNumber,
          });
          continue;
        }
      }

      // 4. Same project address
      if (targetAddress && targetAddress.length >= 8 && other.projectAddress) {
        const otherAddr = other.projectAddress.toLowerCase().trim();
        if (otherAddr.length >= 8 && (targetAddress.slice(0, 16) === otherAddr.slice(0, 16))) {
          seenIds.add(other.id);
          matches.push({
            bid: other,
            matchedOn: 'project_address',
            contractorName: other.clientCompany || other.originalSenderName || other.senderName,
            assignedEstimator: other.assignedEstimator,
            bidNumber: validNumber,
          });
          continue;
        }
      }
    }

    return matches;
  }, [bids, validBidNumbers]);

  // Due Date Extension Detection Helper
  const checkDueDateExtension = (bid: DisplayBidRequest): { isExtension: boolean; revisedDate: string | null; reason: string } => {
    if (!bid) return { isExtension: false, revisedDate: null, reason: '' };
    if (bid.isDueDateRevised && bid.revisedDueDate) {
      return {
        isExtension: true,
        revisedDate: bid.revisedDueDate,
        reason: 'Addendum revised due date',
      };
    }
    const text = `${bid.subject} ${bid.bodyText || ''}`.slice(0, 1000);
    const extensionRegex = /(?:due\s*date|bid\s*date|bid\s*due|deadline|submittal\s*date)\s*(?:is\s*)?(?:extended|extended\s*to|moved\s*to|revised\s*to|changed\s*to|postponed\s*to)\s*([A-Za-z0-9\/\,\.\s\-]{4,25})/i;
    const match = text.match(extensionRegex);
    if (match && match[1]) {
      const parsed = normalizeDateToYyyyMmDd(match[1].trim());
      if (parsed && parsed !== bid.bidDueDate) {
        return {
          isExtension: true,
          revisedDate: parsed,
          reason: `Detected extension phrase in email: "${match[0].slice(0, 50)}"`,
        };
      }
    }
    return { isExtension: false, revisedDate: null, reason: '' };
  };

  /**
   * DUPLICATE DETECTION ENGINE:
   * Rule: The first/earliest received email is the ORIGINAL and is NEVER a duplicate.
   * Only emails received AFTER the first are marked as duplicate copies.
   */
  const checkDuplicateStatus = useCallback((bid: DisplayBidRequest): { isDuplicate: boolean; duplicateOfBid?: DisplayBidRequest; reason: string } => {
    if (!bid) return { isDuplicate: false, reason: '' };

    const bidTime = new Date(bid.rawReceivedAt || bid.receivedAt).getTime();

    // 1. If explicitly in duplicate folder
    if (bid.filterStatus === 'duplicate_folder' || bid.duplicateResolution === 'duplicate') {
      const original = bids.find(
        (b) =>
          b.id !== bid.id &&
          (b.duplicateGroupId === bid.duplicateGroupId || (b.subject === bid.subject && b.senderEmail === bid.senderEmail)) &&
          new Date(b.rawReceivedAt || b.receivedAt).getTime() <= bidTime
      );
      return { isDuplicate: true, duplicateOfBid: original, reason: 'Moved to Duplicates Folder' };
    }

    // 2. Check if this email was received AFTER an earlier identical email (same subject & sender)
    const earlierIdentical = bids.find(
      (b) =>
        b.id !== bid.id &&
        b.subject.trim().toLowerCase() === bid.subject.trim().toLowerCase() &&
        b.senderEmail.trim().toLowerCase() === bid.senderEmail.trim().toLowerCase() &&
        new Date(b.rawReceivedAt || b.receivedAt).getTime() < bidTime
    );
    if (earlierIdentical) {
      return {
        isDuplicate: true,
        duplicateOfBid: earlierIdentical,
        reason: `Duplicate copy received after original email (${earlierIdentical.receivedAt})`,
      };
    }

    // 3. If flagged as duplicate in database: verify if there is an earlier primary in the group
    if (bid.isFlaggedDuplicate) {
      const primary = bids.find(
        (b) =>
          b.duplicateGroupId === bid.duplicateGroupId &&
          b.id !== bid.id &&
          new Date(b.rawReceivedAt || b.receivedAt).getTime() < bidTime
      ) || bids.find((b) => b.duplicateGroupId === bid.duplicateGroupId && b.id !== bid.id && !b.isFlaggedDuplicate);

      if (primary) {
        return {
          isDuplicate: true,
          duplicateOfBid: primary,
          reason: `Duplicate copy in project bundle (Original: ${primary.bidNumber || primary.receivedAt})`,
        };
      }
    }

    return { isDuplicate: false, reason: '' };
  }, [bids]);

  // Main Queue Filter:
  // Duplicates are strictly isolated into the "Duplicates" folder!
  // The first/original copy always stays in the active inbox!
  const filteredBids = useMemo(() => {
    return bids.filter((b) => {
      // 1. Verification filter mode
      if (verificationFilter === 'human_only' && !b.isHumanLabeled) return false;
      if (verificationFilter === 'unverified_only' && b.isHumanLabeled) return false;

      // 2. Duplicate determination:
      // An email is only in the duplicate folder if it was explicitly moved or is a later duplicate copy
      const dupStatus = checkDuplicateStatus(b);
      const isDuplicateCopy = dupStatus.isDuplicate;

      if (activeFilter === 'Duplicates') {
        return isDuplicateCopy;
      }

      // In non-duplicate folders, exclude duplicate copies received after the original
      if (isDuplicateCopy) {
        return false;
      }

      // 3. Category / Folder filter
      if (activeFilter === 'ALL') {
        if (b.sticker === 'Spam' || b.filterStatus === 'auto_filtered') return false;
      } else if (activeFilter === 'Won') {
        if (b.sticker !== 'Won' && b.sticker !== 'Contractor Awarded') return false;
      } else if (activeFilter === 'Addendum / RFI') {
        if (b.sticker !== 'Addendum / RFI' && b.sticker !== 'Addendum' && b.sticker !== 'RFI/Forms' && b.sticker !== 'RFI / Scope') return false;
      } else if (activeFilter === 'Spam') {
        if (b.sticker !== 'Spam' && b.filterStatus !== 'auto_filtered') return false;
      } else if (b.sticker !== activeFilter) {
        return false;
      }

      // 3b. Triage Sub-Filter (Needs Action vs Dispatched to Estimators)
      if (triageSubFilter === 'needs_action') {
        if (b.sticker === 'ITB' && b.assignedEstimator) return false;
        if ((b.sticker === 'Addendum / RFI' || b.sticker === 'Addendum' || b.sticker === 'RFI/Forms' || b.sticker === 'RFI / Scope') && b.isAutoDispatched) return false;
      } else if (triageSubFilter === 'auto_dispatched') {
        if (!b.isAutoDispatched) return false;
      }

      // 4. Search query filter
      if (feedSearchQuery.trim()) {
        const q = feedSearchQuery.toLowerCase();
        const matchSubject = b.subject?.toLowerCase().includes(q);
        const matchSender = b.senderName?.toLowerCase().includes(q) || b.senderEmail?.toLowerCase().includes(q);
        const matchOriginalSender = b.originalSenderName?.toLowerCase().includes(q) || b.originalSenderEmail?.toLowerCase().includes(q);
        const matchProject = b.projectName?.toLowerCase().includes(q);
        const matchClient = b.clientCompany?.toLowerCase().includes(q);
        const matchBidNum = b.bidNumber?.toLowerCase().includes(q) || b.matchedBidNumber?.toLowerCase().includes(q);
        const matchJobCode = b.jobCode?.toLowerCase().includes(q);
        const matchAddress = b.projectAddress?.toLowerCase().includes(q);

        if (!matchSubject && !matchSender && !matchOriginalSender && !matchProject && !matchClient && !matchBidNum && !matchJobCode && !matchAddress) {
          return false;
        }
      }

      return true;
    });
  }, [bids, activeFilter, triageSubFilter, verificationFilter, feedSearchQuery, checkDuplicateStatus]);

  // Keep selected email active or default to the first email in the filtered queue (in split mode)
  useEffect(() => {
    if (layoutMode === 'split') {
      if (filteredBids.length > 0) {
        if (!selectedEmailId || !filteredBids.some((b) => b.id === selectedEmailId)) {
          setSelectedEmailId(filteredBids[0].id);
        }
      } else {
        setSelectedEmailId(null);
      }
    }
  }, [filteredBids, selectedEmailId, layoutMode]);

  // Currently selected email object
  const selectedBid = useMemo(() => {
    return bids.find((b) => b.id === selectedEmailId) || null;
  }, [bids, selectedEmailId]);

  // Lazy-fetch full email HTML body if not yet loaded when selecting an email
  useEffect(() => {
    if (!selectedBid || selectedBid.bodyHtml !== undefined) return;
    const bidId = selectedBid.id;

    fetch(`/api/bid-requests/${bidId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.bidRequest) {
          setBids((prev) =>
            prev.map((b) =>
              b.id === bidId
                ? {
                    ...b,
                    bodyHtml: data.bidRequest.email_body_html || data.bidRequest.raw_payload?.bodyHtml || null,
                    bodyText: b.bodyText || data.bidRequest.email_body_text || data.bidRequest.raw_payload?.bodyText || null,
                  }
                : b
            )
          );
        }
      })
      .catch((err) => console.error('Error fetching detail body:', err));
  }, [selectedBid]);

  // Sibling / Duplicate Grouping for Grouped List View
  const groupedBids = useMemo(() => {
    return filteredBids.reduce<Record<string, DisplayBidRequest[]>>((acc, bid) => {
      acc[bid.duplicateGroupId] = acc[bid.duplicateGroupId] || [];
      acc[bid.duplicateGroupId].push(bid);
      return acc;
    }, {});
  }, [filteredBids]);

  // Pagination for Queue List & Grouped View
  const totalItems = filteredBids.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedBids = filteredBids.slice(startIndex, endIndex);

  // Grouped entries pagination
  const allGroupEntries = Object.entries(groupedBids);
  const totalGroups = allGroupEntries.length;
  const totalGroupPages = Math.max(1, Math.ceil(totalGroups / itemsPerPage));
  const paginatedGroupEntries = allGroupEntries.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    Math.min(safeCurrentPage * itemsPerPage, totalGroups)
  );

  // Stepping through emails in the Reading Pane (Prev / Next)
  const currentEmailIndex = useMemo(() => {
    if (!selectedBid) return -1;
    return filteredBids.findIndex((b) => b.id === selectedBid.id);
  }, [filteredBids, selectedBid]);

  const handleSelectNextEmail = () => {
    if (currentEmailIndex < filteredBids.length - 1) {
      const nextBid = filteredBids[currentEmailIndex + 1];
      setSelectedEmailId(nextBid.id);
      const nextPageIndex = Math.floor((currentEmailIndex + 1) / itemsPerPage) + 1;
      if (nextPageIndex !== safeCurrentPage) {
        setCurrentPage(nextPageIndex);
      }
    }
  };

  const handleSelectPrevEmail = () => {
    if (currentEmailIndex > 0) {
      const prevBid = filteredBids[currentEmailIndex - 1];
      setSelectedEmailId(prevBid.id);
      const prevPageIndex = Math.floor((currentEmailIndex - 1) / itemsPerPage) + 1;
      if (prevPageIndex !== safeCurrentPage) {
        setCurrentPage(prevPageIndex);
      }
    }
  };

  // Keyboard navigation (Esc to close full-screen viewer)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'Escape') {
        if (comparingDuplicateBid) {
          setComparingDuplicateBid(null);
        } else if (layoutMode === 'fullscreen' && selectedEmailId) {
          setSelectedEmailId(null);
        } else if (isSplitMaximized) {
          setIsSplitMaximized(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, selectedEmailId, isSplitMaximized, comparingDuplicateBid]);

  // 1. Direct Estimator & Due Date Assignment
  const handleAssignEstimatorAndDate = async (
    bidId: string,
    estimator?: string | null,
    dueDate?: string | null
  ) => {
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
        await fetchLiveBids();
      } else {
        showToast('Error saving update to database');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error updating assignment');
    }
  };

  // 1b. Run Algorithmic Addendum & RFI Matching Engine
  const handleRunAutoMatch = async () => {
    setIsAutoMatching(true);
    try {
      const res = await fetch('/api/bid-requests/match-addendums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ ${data.message}`);
        await fetchLiveBids();
      } else {
        showToast(data.error || 'Auto-match run failed');
      }
    } catch {
      showToast('Network error running auto-matcher');
    } finally {
      setIsAutoMatching(false);
    }
  };

  // 2. Quick Category Sticker Change
  const handleQuickCategoryChange = async (bidId: string, newSticker: string) => {
    const normalized = (newSticker === 'Addendum' || newSticker === 'RFI/Forms' || newSticker === 'RFI / Scope')
      ? 'Addendum / RFI'
      : newSticker;

    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              sticker: normalized,
              isHumanLabeled: true,
              humanLabel: normalized,
            }
          : b
      )
    );

    showToast(`✔ Category set to [${normalized}] (User Verified)`);

    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSticker: normalized, isHumanLabeled: true }),
      });
      if (!res.ok) {
        showToast('Error saving category to server');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error saving category');
    }
  };

  // 3. Move Email to Duplicates Folder
  const handleMoveToDuplicates = async (bidId: string) => {
    const idx = filteredBids.findIndex((b) => b.id === bidId);
    if (idx < filteredBids.length - 1) {
      setSelectedEmailId(filteredBids[idx + 1].id);
    } else if (idx > 0) {
      setSelectedEmailId(filteredBids[idx - 1].id);
    } else {
      setSelectedEmailId(null);
    }

    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              filterStatus: 'duplicate_folder',
              duplicateResolution: 'duplicate',
              isFlaggedDuplicate: true,
            }
          : b
      )
    );

    showToast('📁 Moved email to Duplicates folder');

    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveToDuplicates: true }),
      });
      if (!res.ok) {
        showToast('Error saving to server');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error saving status');
    }
  };

  // 4. "Keep Email (Not a Duplicate)" Handler
  const handleKeepEmail = async (bidId: string) => {
    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              isFlaggedDuplicate: false,
              duplicateResolution: 'marked_distinct',
              filterStatus: 'inbox',
            }
          : b
      )
    );

    showToast('✔ Confirmed distinct email — kept in active queue');
    setComparingDuplicateBid(null);

    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unmarkDuplicate: true, keepEmail: true }),
      });
      if (!res.ok) {
        showToast('Error saving status on server');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error saving status');
    }
  };

  // 5. Restore Email from Duplicates Folder back into Inbox
  const handleRestoreFromDuplicates = async (bidId: string) => {
    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              filterStatus: 'inbox',
              duplicateResolution: 'marked_distinct',
              isFlaggedDuplicate: false,
            }
          : b
      )
    );

    showToast('↩ Restored email to Active Inbox');

    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoreFromDuplicates: true }),
      });
      if (!res.ok) {
        showToast('Error updating status on server');
        await fetchLiveBids();
      }
    } catch {
      showToast('Network error updating status');
    }
  };

  // 6. Link with Sibling Contractor Project
  const handleLinkToOtherContractor = async (
    sourceBidId: string,
    targetBidNumber: string,
    targetEstimator?: string
  ) => {
    if (!validBidNumbers.has(targetBidNumber)) {
      showToast(`Cannot link: Bid Number "${targetBidNumber}" does not exist.`);
      return;
    }
    try {
      const payload: any = { linkToBidNumber: targetBidNumber };
      if (targetEstimator) payload.assignedEstimator = targetEstimator;

      const res = await fetch(`/api/bid-requests/${sourceBidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast(`✔ Linked to ${targetBidNumber}! Shared folder and estimator updated.`);
        await fetchLiveBids();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to link bids');
      }
    } catch {
      showToast('Network error linking bids');
    }
  };

  // 7. Accept Revised Due Date (from Addendum)
  const handleAcceptRevisedDueDate = async (bidId: string, revisedDueDate: string) => {
    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? {
              ...b,
              bidDueDate: revisedDueDate,
              isDueDateRevised: false,
            }
          : b
      )
    );

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

  // 8. Open Human-in-the-Loop Review Modal
  const openReviewModal = (bid: DisplayBidRequest) => {
    setReviewingBid(bid);
    setTargetSticker(bid.sticker);
    setSelectedBidNumberToLink(
      bid.matchedBidNumber && validBidNumbers.has(bid.matchedBidNumber)
        ? bid.matchedBidNumber
        : ''
    );
    setSelectedEstimatorForITB(bid.assignedEstimator || '');
    setSelectedDueDateForITB(bid.bidDueDate || bid.normalizedAiDueDate || '');
    setIsGcWonPrimeCheckbox(Boolean(bid.isGcWonPrime));
    setLinkToExistingItb(Boolean(bid.isFlaggedDuplicate && bid.matchedBidNumber));
    setAddendumRevisedDueDateInput(bid.revisedDueDate || '');
    setBidSearchQuery('');
    setShowModalEmailBody(true);
  };

  // 9. Save Reclassification & Workflow Transition
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
      } else if (targetSticker === 'Addendum' || targetSticker === 'Addendum / RFI') {
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

  // 10. Standalone Link / Relink Modal Open & Handlers
  const openLinkModal = (bid: DisplayBidRequest) => {
    setLinkingBid(bid);
    setTargetBidNumberForLink(
      bid.matchedBidNumber && validBidNumbers.has(bid.matchedBidNumber)
        ? bid.matchedBidNumber
        : ''
    );
    setRelinkSearchQuery('');
  };

  const handleExecuteLink = async (sourceBidId: string, targetBidNumber: string) => {
    if (!targetBidNumber) {
      showToast('Please select an active project / bid number to link to.');
      return;
    }
    if (!validBidNumbers.has(targetBidNumber)) {
      showToast(`Cannot link: Bid Number "${targetBidNumber}" does not exist.`);
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

  // 11. Unlink Bid Handler
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

  // Filter list of active ITBs for reclassification modal
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

  // Accurate Counts for Category Tabs (excluding Duplicates from active folders)
  const isDuplicateItem = (b: DisplayBidRequest) => checkDuplicateStatus(b).isDuplicate;
  const countAllQueue = bids.filter((b) => b.sticker !== 'Spam' && b.filterStatus !== 'auto_filtered' && !isDuplicateItem(b)).length;
  const countITB = bids.filter((b) => b.sticker === 'ITB' && !isDuplicateItem(b)).length;
  const countAddendumRFI = bids.filter((b) => (b.sticker === 'Addendum / RFI' || b.sticker === 'Addendum' || b.sticker === 'RFI/Forms' || b.sticker === 'RFI / Scope') && !isDuplicateItem(b)).length;
  const countReminder = bids.filter((b) => b.sticker === 'Date Reminder' && !isDuplicateItem(b)).length;
  const countWon = bids.filter((b) => (b.sticker === 'Won' || b.sticker === 'Contractor Awarded') && !isDuplicateItem(b)).length;
  const countLost = bids.filter((b) => b.sticker === 'Lost' && !isDuplicateItem(b)).length;
  const countDuplicates = bids.filter((b) => isDuplicateItem(b)).length;
  const countSpam = bids.filter((b) => b.sticker === 'Spam' || b.filterStatus === 'auto_filtered').length;
  const countHumanVerified = bids.filter((b) => b.isHumanLabeled).length;
  const countUnverified = bids.filter((b) => !b.isHumanLabeled).length;

  // Counts for Sub-Triage Queue View
  const countDispatchedInFilter = bids.filter((b) => {
    if (isDuplicateItem(b)) return false;
    if (b.sticker === 'Spam' || b.filterStatus === 'auto_filtered') return false;
    if (activeFilter === 'Addendum / RFI' && (b.sticker !== 'Addendum / RFI' && b.sticker !== 'Addendum' && b.sticker !== 'RFI/Forms' && b.sticker !== 'RFI / Scope')) return false;
    if (activeFilter === 'ITB' && b.sticker !== 'ITB') return false;
    return b.isAutoDispatched;
  }).length;

  const countNeedsActionInFilter = bids.filter((b) => {
    if (isDuplicateItem(b)) return false;
    if (b.sticker === 'Spam' || b.filterStatus === 'auto_filtered') return false;
    if (activeFilter === 'Addendum / RFI' && (b.sticker !== 'Addendum / RFI' && b.sticker !== 'Addendum' && b.sticker !== 'RFI/Forms' && b.sticker !== 'RFI / Scope')) return false;
    if (activeFilter === 'ITB' && b.sticker !== 'ITB') return false;

    if (b.sticker === 'ITB') return !b.assignedEstimator;
    if (b.sticker === 'Addendum / RFI' || b.sticker === 'Addendum' || b.sticker === 'RFI/Forms' || b.sticker === 'RFI / Scope') {
      return !b.isAutoDispatched;
    }
    return false;
  }).length;

  // Selected email AI alerts
  const crossContractorMatches = useMemo(() => {
    return selectedBid ? findCrossContractorMatches(selectedBid) : [];
  }, [selectedBid, findCrossContractorMatches]);

  const dueDateExt = useMemo(() => {
    return selectedBid ? checkDueDateExtension(selectedBid) : { isExtension: false, revisedDate: null, reason: '' };
  }, [selectedBid]);

  const dupDetails = useMemo(() => {
    return selectedBid ? checkDuplicateStatus(selectedBid) : { isDuplicate: false, reason: '' };
  }, [selectedBid, checkDuplicateStatus]);

  const renderStickerBadge = (sticker: string, bid: DisplayBidRequest) => {
    let badgeClass = 'bg-blue-600 text-white';
    let icon = null;
    let badgeText = sticker === 'ITB' ? 'ITB' : sticker;

    if (
      sticker === 'Addendum / RFI' ||
      sticker === 'Addendum' ||
      sticker === 'RFI/Forms' ||
      sticker === 'RFI / Scope' ||
      sticker === 'Scopes of Work'
    ) {
      badgeClass = 'bg-purple-600 text-white';
      icon = <FileSpreadsheet className="w-3 h-3" />;
      badgeText = 'Addendum / RFI';
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
    } else if (sticker === 'Date Reminder') {
      badgeClass = 'bg-indigo-600 text-white shadow-xs';
      icon = <Clock className="w-3 h-3 text-indigo-200" />;
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
              ? `Personally verified by user: "${badgeText}"`
              : `AI classified as ${badgeText}`
          }
          className={`px-2 py-0.5 rounded font-black text-[10px] uppercase tracking-wider shadow-xs flex items-center gap-1 ${badgeClass}`}
        >
          {icon}
          {badgeText}
        </span>

        {/* Human Verified Indicator */}
        {bid.isHumanLabeled && (
          <span
            title="Personally reviewed and verified by user"
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-0.5 shadow-2xs"
          >
            <UserCheck className="w-2.5 h-2.5 text-emerald-600" />
            <span>Verified</span>
          </span>
        )}
      </div>
    );
  };

  /**
   * Reading Pane Render Component:
   * Displays full-screen email document alongside Top AI Intelligence Notes
   */
  const renderReadingPane = (isFullScreen: boolean) => {
    if (!selectedBid) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 bg-white">
          <Mail className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-600">No email selected</p>
          <p className="text-xs text-slate-400 mt-1">
            Choose an email from the queue to read and review.
          </p>
        </div>
      );
    }

    const hasValidMasterLink = Boolean(
      selectedBid.matchedBidNumber && validBidNumbers.has(selectedBid.matchedBidNumber)
    );

    return (
      <div className="flex-1 flex flex-col bg-slate-50/40 overflow-hidden w-full">
        {/* Top Action Toolbar */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          {/* Left Controls: Back to Queue & Prev/Next */}
          <div className="flex items-center gap-3">
            {/* Back to Queue Button (Prominent in Full-Screen Mode) */}
            {(layoutMode === 'fullscreen' || isSplitMaximized) && (
              <button
                type="button"
                onClick={() => {
                  if (isSplitMaximized) setIsSplitMaximized(false);
                  else setSelectedEmailId(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-200 shadow-2xs"
                title="Back to queue list (Esc)"
              >
                <ArrowLeft className="w-4 h-4 text-slate-700" />
                <span>Back to Queue</span>
              </button>
            )}

            {/* Stepper (Prev / Next) */}
            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
              <button
                type="button"
                onClick={handleSelectPrevEmail}
                disabled={currentEmailIndex <= 0}
                title="Previous email in queue"
                className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSelectNextEmail}
                disabled={currentEmailIndex >= filteredBids.length - 1}
                title="Next email in queue"
                className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-semibold text-slate-500 font-mono">
              {currentEmailIndex + 1} of {filteredBids.length}
            </span>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Category Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 font-bold hidden sm:inline">
                Category:
              </span>
              <select
                value={selectedBid.sticker}
                onChange={(e) => handleQuickCategoryChange(selectedBid.id, e.target.value)}
                className="text-xs font-bold border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimator Assignment Picker */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 font-bold hidden sm:inline">
                Estimator:
              </span>
              <select
                value={selectedBid.assignedEstimator || ''}
                onChange={(e) =>
                  handleAssignEstimatorAndDate(selectedBid.id, e.target.value || null, undefined)
                }
                className="text-xs font-medium border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned...</option>
                {ESTIMATORS.map((est) => (
                  <option key={est} value={est}>
                    {est}
                  </option>
                ))}
              </select>
            </div>

            {/* Bid Due Date Picker */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-slate-500 font-bold hidden sm:inline">
                Due:
              </span>
              <input
                type="date"
                value={selectedBid.bidDueDate || ''}
                onChange={(e) =>
                  handleAssignEstimatorAndDate(selectedBid.id, undefined, e.target.value || null)
                }
                className="text-xs font-medium border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Move to Duplicates / Restore Button */}
            {selectedBid.filterStatus !== 'duplicate_folder' ? (
              <button
                type="button"
                onClick={() => handleMoveToDuplicates(selectedBid.id)}
                className="p-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-amber-50 text-amber-800 hover:border-amber-300 text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
                title="Move this email into the Duplicates folder"
              >
                <FolderArchive className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden md:inline">Duplicates</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRestoreFromDuplicates(selectedBid.id)}
                className="p-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 text-blue-800 hover:border-blue-300 text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
                title="Restore email to main inbox queue"
              >
                <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                <span>Restore to Inbox</span>
              </button>
            )}

            {/* Link to Master Bid Button */}
            <button
              type="button"
              onClick={() => openLinkModal(selectedBid)}
              className="p-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
              title="Link or relink to master project folder"
            >
              <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden md:inline">Link</span>
            </button>

            {/* Full Review Modal Trigger */}
            <button
              type="button"
              onClick={() => openReviewModal(selectedBid)}
              className="p-1.5 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
              title="Full classification & workflow editor"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden md:inline">Edit</span>
            </button>

            {/* Maximize / Minimize Button (In Split Mode) */}
            {layoutMode === 'split' && (
              <button
                type="button"
                onClick={() => setIsSplitMaximized(!isSplitMaximized)}
                className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors shadow-2xs flex items-center"
                title={isSplitMaximized ? 'Restore 2-Pane Split' : 'Take up Whole Screen (Maximize)'}
              >
                {isSplitMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Reading Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TOP AI INTELLIGENCE & TRIAGE BANNER */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-slate-700/80 shadow-md space-y-4">
            {/* Title & Status Badges */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  AI Intelligence & Triage Notes
                </span>

                {/* Assigned Bid Number or Verified Master Bid Link */}
                {selectedBid.sticker === 'ITB' ? (
                  <span className="font-mono bg-blue-500/20 text-blue-300 border border-blue-400/40 px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-blue-400" />
                    {selectedBid.bidNumber ? `Bid #: ${selectedBid.bidNumber}` : 'Assigning Bid #'}
                  </span>
                ) : hasValidMasterLink ? (
                  <span className="font-mono bg-purple-500/20 text-purple-300 border border-purple-400/40 px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    <LinkIcon className="w-3.5 h-3.5 text-purple-400" />
                    Attached to Master: {selectedBid.matchedBidNumber}
                  </span>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-mono bg-slate-700/60 text-slate-300 border border-slate-600 px-2 py-0.5 rounded-lg text-xs font-medium flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-slate-400" />
                      {selectedBid.matchedBidNumber
                        ? `Unlinked (Bid ${selectedBid.matchedBidNumber} not found)`
                        : 'Not Linked to Master Bid'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openLinkModal(selectedBid)}
                      className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow-2xs transition-colors"
                    >
                      Link Now
                    </button>
                  </div>
                )}

                {/* Category Sticker Badge */}
                <span
                  className={`px-2.5 py-0.5 rounded font-black text-xs uppercase tracking-wider ${
                    selectedBid.sticker === 'ITB'
                      ? 'bg-blue-600 text-white'
                      : selectedBid.sticker === 'Addendum / RFI'
                      ? 'bg-purple-600 text-white'
                      : selectedBid.sticker === 'Won'
                      ? 'bg-emerald-600 text-white'
                      : selectedBid.sticker === 'Lost'
                      ? 'bg-rose-600 text-white'
                      : selectedBid.sticker === 'Spam'
                      ? 'bg-slate-700 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}
                >
                  {selectedBid.sticker}
                </span>

                {/* Human Verified Indicator */}
                {selectedBid.isHumanLabeled && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-400" />
                    User Verified
                  </span>
                )}
              </div>

              {/* Received Date & Time Details */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-slate-300">Received:</span>
                <strong
                  className="text-white bg-white/10 px-2 py-0.5 rounded font-semibold cursor-help"
                  title={new Date(selectedBid.rawReceivedAt).toLocaleString()}
                >
                  {selectedBid.receivedAt}
                </strong>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300">Estimator:</span>
                <strong className="text-white bg-white/10 px-2 py-0.5 rounded font-semibold">
                  {selectedBid.assignedEstimator || 'Unassigned'}
                </strong>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300">Due:</span>
                <strong className="text-white bg-white/10 px-2 py-0.5 rounded font-semibold">
                  {selectedBid.bidDueDate ? formatFriendlyDate(selectedBid.bidDueDate) : 'No Date Set'}
                </strong>
              </div>
            </div>

            {/* ALERT 1: Multi-Contractor Job Alert */}
            {crossContractorMatches.length > 0 && (
              <div className="p-3.5 bg-indigo-500/15 rounded-xl border border-indigo-400/30 text-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <Building2 className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>Multi-Contractor Job Alert</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                        {crossContractorMatches.length} Other GC{crossContractorMatches.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-indigo-200">
                      This same project was also submitted by{' '}
                      <strong className="text-white">
                        {crossContractorMatches.map((m) => m.contractorName).join(', ')}
                      </strong>
                      .
                      {crossContractorMatches[0].assignedEstimator && (
                        <>
                          {' '}Currently assigned to{' '}
                          <strong className="text-amber-300">
                            {crossContractorMatches[0].assignedEstimator}
                          </strong>{' '}
                          under{' '}
                          <strong className="font-mono text-white">
                            {crossContractorMatches[0].bidNumber || 'Pending'}
                          </strong>
                          .
                        </>
                      )}
                      {' '}One takeoff covers all quotes — link them to avoid double estimating!
                    </p>
                  </div>
                </div>
                {crossContractorMatches[0].bidNumber && validBidNumbers.has(crossContractorMatches[0].bidNumber) && (
                  <button
                    type="button"
                    onClick={() =>
                      handleLinkToOtherContractor(
                        selectedBid.id,
                        crossContractorMatches[0].bidNumber!,
                        crossContractorMatches[0].assignedEstimator || undefined
                      )
                    }
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0 transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Link to {crossContractorMatches[0].bidNumber}</span>
                  </button>
                )}
              </div>
            )}

            {/* ALERT 2: Due Date Extension Alert */}
            {dueDateExt.isExtension && dueDateExt.revisedDate && (
              <div className="p-3.5 bg-amber-500/15 rounded-xl border border-amber-400/30 text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>⏰ Bid Due Date Extension Detected</span>
                    </div>
                    <p className="text-amber-200">
                      An addendum or notice revised the bid deadline to{' '}
                      <strong className="text-amber-300 underline font-semibold">
                        {formatFriendlyDate(dueDateExt.revisedDate)}
                      </strong>
                      {selectedBid.bidDueDate && (
                        <> (previously set to {formatFriendlyDate(selectedBid.bidDueDate)})</>
                      )}
                      .
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAcceptRevisedDueDate(selectedBid.id, dueDateExt.revisedDate!)}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept Revised Due Date</span>
                </button>
              </div>
            )}

            {/* ALERT 3: Duplicate Alert with Comparison Modal Option & Keep Email Button */}
            {dupDetails.isDuplicate && (
              <div className="p-3.5 bg-rose-500/15 rounded-xl border border-rose-400/30 text-rose-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <Copy className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>Duplicate Copy Detected (Received After First)</span>
                    </div>
                    <p className="text-rose-200">
                      {dupDetails.reason}
                      {dupDetails.duplicateOfBid && (
                        <>
                          {' '}— Original email received:{' '}
                          <strong className="text-white">
                            {dupDetails.duplicateOfBid.receivedAt} ({dupDetails.duplicateOfBid.senderName})
                          </strong>
                        </>
                      )}
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto flex-shrink-0">
                  {/* Option to Open Supposed Original in Comparison Modal */}
                  {dupDetails.duplicateOfBid && (
                    <button
                      type="button"
                      onClick={() =>
                        setComparingDuplicateBid({
                          current: selectedBid,
                          original: dupDetails.duplicateOfBid!,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-colors border border-white/20"
                      title="Inspect original email side-by-side with this copy"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-300" />
                      <span>Compare with Original</span>
                    </button>
                  )}

                  {/* Keep Email (Not a Duplicate) Button */}
                  <button
                    type="button"
                    onClick={() => handleKeepEmail(selectedBid.id)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                    title="Confirm this is NOT a duplicate and keep in active inbox"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Keep Email (Not Duplicate)</span>
                  </button>

                  {/* Move to Duplicates Folder Button */}
                  {selectedBid.filterStatus !== 'duplicate_folder' && (
                    <button
                      type="button"
                      onClick={() => handleMoveToDuplicates(selectedBid.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
                      title="Move to Duplicates folder"
                    >
                      <FolderArchive className="w-3.5 h-3.5" />
                      <span>Move to Duplicates</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ALERT 4: Auto-Dispatched Addendum / RFI to Estimator */}
            {selectedBid.isAutoDispatched ? (
              <div className="p-3.5 bg-emerald-500/15 rounded-xl border border-emerald-400/30 text-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs space-y-0.5">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>🚀 Auto-Dispatched to Estimator: {selectedBid.assignedEstimator}</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 font-mono">
                        {selectedBid.matchedBidNumber}
                      </span>
                    </div>
                    <p className="text-emerald-200">
                      This Addendum was automatically matched to master project{' '}
                      <strong className="text-white font-mono underline">{selectedBid.matchedBidNumber}</strong>
                      {selectedBid.matchReason ? ` (${selectedBid.matchReason})` : ''} and delivered directly to {selectedBid.assignedEstimator}&apos;s portal. No manual triage required.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openLinkModal(selectedBid)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700/60 hover:bg-emerald-600 text-white font-bold text-xs border border-emerald-500/40 transition-colors"
                  >
                    Re-link / Adjust
                  </button>
                </div>
              </div>
            ) : (
              (selectedBid.sticker === 'Addendum / RFI' || selectedBid.sticker === 'Addendum') && hasValidMasterLink && !selectedBid.assignedEstimator && (
                <div className="p-3.5 bg-purple-500/15 rounded-xl border border-purple-400/30 text-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>Matched to Master Bid {selectedBid.matchedBidNumber}</span>
                        <span className="px-2 py-0.2 rounded-full text-[10px] bg-purple-500/30 text-purple-200 border border-purple-400/30 font-mono">
                          Awaiting Estimator Assignment
                        </span>
                      </div>
                      <p className="text-purple-200">
                        This Addendum is linked to <strong className="text-white font-mono">{selectedBid.matchedBidNumber}</strong>. Once the master ITB is assigned an estimator by the Calendar Manager, this Addendum will automatically route to them.
                      </p>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Scope Summary & Project Context Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  AI Scope Summary:
                </span>
                <p className="text-slate-200 leading-relaxed text-[11px]">
                  {selectedBid.scopeSummary ||
                    'General construction ITB document. Division 10 toilet partitions & accessories scope.'}
                </p>
              </div>

              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-1">
                <span className="font-bold text-blue-300 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                  Project & Contractor Details:
                </span>
                <div className="text-slate-200 text-[11px] space-y-0.5">
                  <div>
                    GC / Sender:{' '}
                    <strong className="text-white">
                      {selectedBid.clientCompany || selectedBid.originalSenderName || selectedBid.senderName}
                    </strong>
                  </div>
                  {selectedBid.projectName && (
                    <div>
                      Project Name:{' '}
                      <strong className="text-white">{selectedBid.projectName}</strong>
                    </div>
                  )}
                  {selectedBid.projectAddress && (
                    <div>
                      Address:{' '}
                      <strong className="text-white">{selectedBid.projectAddress}</strong>
                    </div>
                  )}
                  {selectedBid.jobCode && (
                    <div>
                      Job Code:{' '}
                      <span className="font-mono text-amber-300">{selectedBid.jobCode}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* HIGH FIDELITY EMAIL DOCUMENT VIEWER (Full Screen Sizing) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
            <EmailDocumentViewer
              id={selectedBid.id}
              subject={selectedBid.subject}
              senderName={selectedBid.senderName}
              senderEmail={selectedBid.senderEmail}
              receivedAt={selectedBid.receivedAt}
              isForwarded={selectedBid.isForwarded}
              forwardedBy={selectedBid.forwardedBy}
              originalSenderName={selectedBid.originalSenderName}
              originalSenderEmail={selectedBid.originalSenderEmail}
              bodyText={selectedBid.bodyText}
              bodyHtml={selectedBid.bodyHtml}
              attachments={selectedBid.attachments}
              maxHeight="min-h-[750px] h-[calc(100vh-260px)]"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 border border-slate-700">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 rounded-2xl p-5 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                Calendar Manager Dispatch & Email Queue
              </h2>
              {isUsingLiveDb && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Live ({bids.length})
                </span>
              )}
            </div>
            <p className="text-blue-200 text-xs sm:text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0" />
              <strong>Intelligent Inbound Queue:</strong> Inspect full-screen emails alongside top AI notes — multi-contractor job alerts, due date extensions, duplicate filtering, and instant estimator assignment.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchLiveBids}
              disabled={isLoading}
              title="Refresh Live Data"
              className="p-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <Link
              href="/estimator"
              className="px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30"
            >
              <Briefcase className="w-3.5 h-3.5 text-indigo-300" />
              <span>Estimators ({bids.filter((b) => b.assignedEstimator).length})</span>
            </Link>

            <Link
              href="/label"
              className="px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30"
              title="Mobile Data Labeling App"
            >
              <Tag className="w-3.5 h-3.5 text-purple-300" />
              <span>Labeler</span>
            </Link>

            <Link
              href="/model"
              className="px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/30"
              title="ML Multiclass Classification Model Lab"
            >
              <Brain className="w-3.5 h-3.5 text-emerald-300" />
              <span>ML Lab (87.3%)</span>
            </Link>
          </div>
        </div>
      </div>

      {/* VIEW SWITCHER & LAYOUT MODE BAR */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewMode('feed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'feed'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Inbound Queue</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
              {countAllQueue}
            </span>
          </button>

          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'calendar'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Calendar Schedule View</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
              {bids.filter((b) => (b.bidDueDate || b.normalizedAiDueDate) && b.sticker !== 'Spam').length}
            </span>
          </button>
        </div>

        {/* Layout Switcher (Full Screen Viewer vs Split 2-Pane vs Grouped Cards) */}
        {viewMode === 'feed' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold hidden md:inline">Layout:</span>
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              {/* Full-Screen Email Viewer (Gmail Default) */}
              <button
                type="button"
                onClick={() => {
                  setLayoutMode('fullscreen');
                  setIsSplitMaximized(false);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  layoutMode === 'fullscreen'
                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Full-Screen Email Viewer (Gmail standard: Click email to take up whole screen)"
              >
                <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Full Screen Viewer</span>
              </button>

              {/* Split 2-Pane */}
              <button
                type="button"
                onClick={() => {
                  setLayoutMode('split');
                  setIsSplitMaximized(false);
                  if (!selectedEmailId && filteredBids.length > 0) {
                    setSelectedEmailId(filteredBids[0].id);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  layoutMode === 'split'
                    ? 'bg-white text-blue-700 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Split 2-Pane View (Side-by-side queue and reader)"
              >
                <Columns className="w-3.5 h-3.5 text-blue-600" />
                <span>Split 2-Pane</span>
              </button>

              {/* Grouped Cards */}
              <button
                type="button"
                onClick={() => setLayoutMode('list')}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                  layoutMode === 'list'
                    ? 'bg-white text-slate-900 shadow-2xs font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Grouped Cards View: Overview of Projects and Sibling Inquiries"
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Grouped Cards</span>
              </button>
            </div>
          </div>
        )}
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
          {/* CATEGORY & FOLDER FILTER TABS + SEARCH BAR */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 flex-wrap">
              {/* Human vs AI Verification Mode Filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold mr-1">
                <button
                  type="button"
                  onClick={() => setVerificationFilter('all')}
                  className={`px-2 py-1 rounded-lg transition-all ${
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
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
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
                  className={`px-2 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    verificationFilter === 'unverified_only'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-700 hover:bg-blue-50'
                  }`}
                  title="Show only unverified AI emails needing review"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>🤖 AI Only ({countUnverified})</span>
                </button>
              </div>

              {/* Main Queue Tab */}
              <button
                onClick={() => setActiveFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>All Queue</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countAllQueue}
                </span>
              </button>

              {/* ITB Tab */}
              <button
                onClick={() => setActiveFilter('ITB')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'ITB'
                    ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <span>ITB</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countITB}
                </span>
              </button>

              {/* Unified Addendum / RFI Tab */}
              <button
                onClick={() => setActiveFilter('Addendum / RFI')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Addendum / RFI'
                    ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-300'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Addendum / RFI</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countAddendumRFI}
                </span>
              </button>

              {/* Date Reminder Tab */}
              <button
                onClick={() => setActiveFilter('Date Reminder')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Date Reminder'
                    ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                <span>Date Reminder</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countReminder}
                </span>
              </button>

              {/* Won / Award Tab */}
              <button
                onClick={() => setActiveFilter('Won')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Won'
                    ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Won</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countWon}
                </span>
              </button>

              {/* Lost Tab */}
              <button
                onClick={() => setActiveFilter('Lost')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Lost'
                    ? 'bg-rose-600 text-white shadow-xs ring-2 ring-rose-300'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                }`}
              >
                <span>Lost</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countLost}
                </span>
              </button>

              {/* Dedicated Duplicates Folder Tab */}
              <button
                onClick={() => setActiveFilter('Duplicates')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Duplicates'
                    ? 'bg-amber-600 text-white shadow-xs ring-2 ring-amber-300'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
                title="Emails filtered or flagged as exact duplicates"
              >
                <FolderArchive className="w-3.5 h-3.5 text-amber-700" />
                <span>📁 Duplicates</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countDuplicates}
                </span>
              </button>

              {/* Spam Tab */}
              <button
                onClick={() => setActiveFilter('Spam')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                  activeFilter === 'Spam'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Spam</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-black">
                  {countSpam}
                </span>
              </button>
            </div>

            {/* In-Feed Search Input */}
            <div className="relative min-w-[240px] flex-shrink-0">
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

          {/* SUB-FILTER & AUTO-MATCH ACTION BAR */}
          {(activeFilter === 'ALL' || activeFilter === 'Addendum / RFI' || activeFilter === 'ITB') && (
            <div className="bg-white p-2.5 px-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                  Queue View:
                </span>
                <button
                  type="button"
                  onClick={() => setTriageSubFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                    triageSubFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Items
                </button>
                <button
                  type="button"
                  onClick={() => setTriageSubFilter('needs_action')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    triageSubFilter === 'needs_action'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                  title="Show only items needing Calendar Manager action (unassigned ITBs, unlinked Addendums)"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Needs Triage</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 font-bold">
                    {countNeedsActionInFilter}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTriageSubFilter('auto_dispatched')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                    triageSubFilter === 'auto_dispatched'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                  }`}
                  title="Addendums & RFIs automatically linked and dispatched directly to estimators"
                >
                  <span>🚀 Dispatched to Estimators</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 font-bold">
                    {countDispatchedInFilter}
                  </span>
                </button>
              </div>

              {/* Action: Run Auto-Match */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunAutoMatch}
                  disabled={isAutoMatching}
                  className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Run algorithmic multi-tier matcher across all Addendums & RFIs to link them to master ITBs"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAutoMatching ? 'animate-spin' : ''}`} />
                  <span>{isAutoMatching ? 'Matching Addendums...' : '⚡ Auto-Match Addendums'}</span>
                </button>
              </div>
            </div>
          )}

          {/* VIEW MODE 1: FULL SCREEN VIEWER (GMAIL STANDARD) */}
          {layoutMode === 'fullscreen' ? (
            selectedBid ? (
              /* When an email is selected, it takes up the WHOLE screen! */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[calc(100vh-180px)] w-full animate-in fade-in">
                {renderReadingPane(true)}
              </div>
            ) : (
              /* Full-Width Email Queue List */
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {/* List Header with Pagination */}
                <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 text-xs bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">
                      {activeFilter === 'ALL' && 'Inbound Opportunity Queue'}
                      {activeFilter === 'ITB' && 'ITBs Needing Estimator Assignment'}
                      {activeFilter === 'Addendum / RFI' && 'Addendums & RFIs'}
                      {activeFilter === 'Duplicates' && 'Duplicates Folder (Copies Received After Original)'}
                      {activeFilter !== 'ALL' && activeFilter !== 'ITB' && activeFilter !== 'Addendum / RFI' && activeFilter !== 'Duplicates' && activeFilter}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-700 font-semibold font-mono">
                      {totalItems}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500">
                      {totalItems === 0 ? '0 of 0' : `${startIndex + 1}–${endIndex} of ${totalItems}`}
                    </span>
                    <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={safeCurrentPage <= 1}
                        title="Previous page"
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={safeCurrentPage >= totalPages}
                        title="Next page"
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Full-Width Email Rows */}
                <div className="divide-y divide-slate-100">
                  {paginatedBids.length === 0 ? (
                    <div className="p-16 text-center text-slate-400 text-sm">
                      {feedSearchQuery
                        ? `No emails found matching "${feedSearchQuery}".`
                        : `No emails in ${activeFilter}.`}
                    </div>
                  ) : (
                    paginatedBids.map((bid) => {
                      const hasMultiGC = findCrossContractorMatches(bid).length > 0;
                      const hasDueExt = checkDueDateExtension(bid).isExtension;
                      const isDupItem = checkDuplicateStatus(bid).isDuplicate;

                      return (
                        <div
                          key={bid.id}
                          onClick={() => setSelectedEmailId(bid.id)}
                          className="p-4 hover:bg-blue-50/40 cursor-pointer transition-colors flex items-center justify-between gap-4 text-xs group"
                        >
                          {/* Left: Sender & Badges */}
                          <div className="flex items-center gap-3 min-w-[220px] max-w-[260px] flex-shrink-0">
                            {renderStickerBadge(bid.sticker, bid)}
                            <span className="font-bold text-slate-900 truncate">
                              {bid.clientCompany || bid.originalSenderName || bid.senderName}
                            </span>
                          </div>

                          {/* Center: Subject & Snippet */}
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            {bid.bidNumber && (
                              <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded flex-shrink-0">
                                {bid.bidNumber}
                              </span>
                            )}
                            {bid.matchedBidNumber && (
                              <span
                                title={bid.matchReason || `Matched to ${bid.matchedBidNumber}`}
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 flex items-center gap-1 ${
                                  bid.isAutoDispatched
                                    ? 'text-purple-900 bg-purple-100 border border-purple-300'
                                    : 'text-indigo-900 bg-indigo-100 border border-indigo-200'
                                }`}
                              >
                                <span>{bid.isAutoDispatched ? '🚀' : '🔗'} {bid.matchedBidNumber}</span>
                              </span>
                            )}
                            <span className="font-medium text-slate-800 truncate group-hover:text-blue-900">
                              {bid.subject}
                            </span>

                            {/* Alert Badges */}
                            <div className="hidden lg:flex items-center gap-1.5 ml-2 flex-shrink-0">
                              {bid.isAutoDispatched && (
                                <span
                                  title={`Dispatched to ${bid.assignedEstimator}`}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-0.5"
                                >
                                  <span>🚀 Dispatched</span>
                                </span>
                              )}
                              {hasMultiGC && (
                                <span
                                  title="Multiple GCs bidding this same project"
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-0.5"
                                >
                                  <Building2 className="w-2.5 h-2.5 text-indigo-700" />
                                  <span>Multi-GC</span>
                                </span>
                              )}

                              {hasDueExt && (
                                <span
                                  title="Due date extension detected"
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5"
                                >
                                  <Clock className="w-2.5 h-2.5 text-amber-700" />
                                  <span>Due Ext</span>
                                </span>
                              )}

                              {isDupItem && (
                                <span
                                  title="Duplicate copy received after original"
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200 flex items-center gap-0.5"
                                >
                                  <Copy className="w-2.5 h-2.5 text-rose-700" />
                                  <span>Dup</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: Estimator, Attachments & Received Date */}
                          <div className="flex items-center gap-4 flex-shrink-0 text-slate-500">
                            {bid.assignedEstimator && (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border hidden sm:inline ${getEstimatorColor(
                                  bid.assignedEstimator
                                )}`}
                              >
                                {bid.assignedEstimator.split(' ')[0]}
                              </span>
                            )}

                            {bid.attachmentsCount > 0 && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                                <Paperclip className="w-3 h-3 text-slate-400" />
                                <span>{bid.attachmentsCount}</span>
                              </span>
                            )}

                            <span
                              className="font-mono text-xs font-semibold text-slate-600 min-w-[55px] text-right"
                              title={new Date(bid.rawReceivedAt).toLocaleString()}
                            >
                              {bid.receivedAt}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )
          ) : layoutMode === 'split' ? (
            /* VIEW MODE 2: SPLIT 2-PANE (SIDE-BY-SIDE OR MAXIMIZED) */
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[720px] max-h-[88vh]">
              {/* LEFT COLUMN: EMAIL QUEUE LIST (Hidden when Maximized) */}
              {!isSplitMaximized && (
                <div className="w-full lg:w-[410px] xl:w-[460px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-slate-50/50">
                  {/* Mini Header */}
                  <div className="p-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Inbox className="w-4 h-4 text-blue-600" />
                      <span>Queue</span>
                      <span className="text-slate-400 font-normal">({totalItems})</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-500">
                        {totalItems === 0 ? '0 of 0' : `${startIndex + 1}–${endIndex} of ${totalItems}`}
                      </span>
                      <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          disabled={safeCurrentPage <= 1}
                          className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 border-r border-slate-200"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          disabled={safeCurrentPage >= totalPages}
                          className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Email Items List */}
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {paginatedBids.map((bid) => {
                      const isSelected = selectedEmailId === bid.id;
                      const hasMultiGC = findCrossContractorMatches(bid).length > 0;
                      const hasDueExt = checkDueDateExtension(bid).isExtension;
                      const isDupItem = checkDuplicateStatus(bid).isDuplicate;

                      return (
                        <div
                          key={bid.id}
                          onClick={() => setSelectedEmailId(bid.id)}
                          className={`p-3.5 cursor-pointer transition-all text-xs relative ${
                            isSelected
                              ? 'bg-blue-50/90 border-l-4 border-blue-600 shadow-2xs'
                              : 'bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`truncate font-bold ${isSelected ? 'text-blue-950 font-black' : 'text-slate-900'}`}>
                              {bid.clientCompany || bid.originalSenderName || bid.senderName}
                            </span>
                            <span
                              className="text-[10px] text-slate-500 font-mono flex-shrink-0"
                              title={new Date(bid.rawReceivedAt).toLocaleString()}
                            >
                              {bid.receivedAt}
                            </span>
                          </div>

                          <p className={`truncate text-xs mb-1.5 ${isSelected ? 'text-blue-900 font-semibold' : 'text-slate-800 font-medium'}`}>
                            {bid.subject}
                          </p>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {renderStickerBadge(bid.sticker, bid)}

                            {bid.bidNumber && (
                              <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                                {bid.bidNumber}
                              </span>
                            )}

                            {bid.matchedBidNumber && (
                              <span
                                title={bid.matchReason || `Matched to ${bid.matchedBidNumber}`}
                                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                  bid.isAutoDispatched
                                    ? 'text-purple-900 bg-purple-100 border border-purple-300'
                                    : 'text-indigo-900 bg-indigo-100 border border-indigo-200'
                                }`}
                              >
                                <span>{bid.isAutoDispatched ? '🚀' : '🔗'} {bid.matchedBidNumber}</span>
                              </span>
                            )}

                            {hasMultiGC && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-0.5">
                                <Building2 className="w-2.5 h-2.5 text-indigo-700" />
                                <span>Multi-GC</span>
                              </span>
                            )}

                            {hasDueExt && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5 text-amber-700" />
                                <span>Due Ext</span>
                              </span>
                            )}

                            {isDupItem && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200 flex items-center gap-0.5">
                                <Copy className="w-2.5 h-2.5 text-rose-700" />
                                <span>Dup</span>
                              </span>
                            )}

                            {bid.assignedEstimator && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getEstimatorColor(bid.assignedEstimator)}`}>
                                {bid.assignedEstimator.split(' ')[0]}
                              </span>
                            )}

                            {bid.attachmentsCount > 0 && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5 ml-auto">
                                <Paperclip className="w-2.5 h-2.5 text-slate-400" />
                                <span>{bid.attachmentsCount}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* RIGHT READING PANE */}
              {renderReadingPane(isSplitMaximized)}
            </div>
          ) : (
            /* VIEW MODE 3: GROUPED CARDS VIEW (PROJECT BUNDLES) */
            <div id="dispatch-feed-list" className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-6">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {activeFilter === 'ALL' && 'All Inbound Opportunities & Projects'}
                    {activeFilter === 'ITB' && 'New ITBs (Invitations to Bid) — Assign to Estimators'}
                    {activeFilter === 'Addendum / RFI' && 'Addendums & RFIs — Linked to Existing Bid Folders'}
                    {activeFilter === 'Won' && 'Won Bids — Ready for Active Job Phase Promotion'}
                    {activeFilter === 'Lost' && 'Lost / Cancelled Opportunities'}
                    {activeFilter === 'Duplicates' && 'Duplicates Folder — Excluded from Active Queue'}
                    {activeFilter === 'Spam' && 'Auto-Filtered Noise & Solicitations'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Grouped by project sibling bundles and multi-GC opportunities.
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  <span className="text-xs font-semibold text-slate-700 font-mono">
                    {totalGroups === 0 ? '0 of 0' : `${(safeCurrentPage - 1) * itemsPerPage + 1}–${Math.min(safeCurrentPage * itemsPerPage, totalGroups)} of ${totalGroups}`}
                  </span>
                  <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={safeCurrentPage <= 1}
                      title="Previous page"
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed border-r border-slate-200 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalGroupPages, p + 1))}
                      disabled={safeCurrentPage >= totalGroupPages}
                      title="Next page"
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {paginatedGroupEntries.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  {feedSearchQuery
                    ? `No emails found matching "${feedSearchQuery}".`
                    : `No emails found in ${activeFilter}.`}
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {paginatedGroupEntries.map(([groupId, groupItems]) => {
                    const isExpanded = expandedGroups[groupId] ?? false;
                    const primary = groupItems.find((b) => !b.isFlaggedDuplicate) || groupItems[0];
                    const duplicates = groupItems.filter((b) => b.id !== primary.id);

                    const uniqueGCs = Array.from(
                      new Set(
                        groupItems
                          .map((item) => item.clientCompany || item.originalSenderName || item.senderName)
                          .filter(Boolean)
                      )
                    );
                    const isMultiGCGroup = uniqueGCs.length > 1;
                    const dueDateRevisionItem = groupItems.find((item) => item.isDueDateRevised && item.revisedDueDate);

                    return (
                      <div key={groupId} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
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
                              onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))}
                              className="mt-1 text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-5 h-5 text-slate-600" />
                              ) : (
                                <ChevronRight className="w-5 h-5" />
                              )}
                            </button>

                            <div className="space-y-2 flex-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                {renderStickerBadge(primary.sticker, primary)}

                                {primary.sticker === 'ITB' && primary.bidNumber && (
                                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                                    <Hash className="w-3 h-3 text-blue-600" /> {primary.bidNumber}
                                  </span>
                                )}

                                {primary.sticker !== 'ITB' && primary.matchedBidNumber && validBidNumbers.has(primary.matchedBidNumber) && (
                                  <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                                    <LinkIcon className="w-3 h-3 text-purple-600" /> Attached to {primary.matchedBidNumber}
                                  </span>
                                )}

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
                                <span title={new Date(primary.rawReceivedAt).toLocaleString()}>
                                  Received: {primary.receivedAt}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="flex items-center gap-1">
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {primary.attachmentsCount} Attachment{primary.attachmentsCount > 1 ? 's' : ''}
                                </span>
                              </div>

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

                          <div className="flex items-center gap-3">
                            {primary.sticker === 'ITB' && (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
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
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => openLinkModal(primary)}
                              title="Link or merge this inquiry into an existing project folder"
                              className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                            >
                              <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                              <span className="hidden sm:inline">Link / Move</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* POPUP MODAL: DUPLICATE ASSESSMENT & ORIGINAL COMPARISON */}
      {comparingDuplicateBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col p-6 animate-in zoom-in-95 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" /> Duplicate Verification & Original Comparison
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  Compare Supposed Original vs Received Duplicate
                </h3>
                <p className="text-xs text-slate-500">
                  Assess if this is an identical copy or a distinct request with new details. If distinct, keep the email in the active queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setComparingDuplicateBid(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Side-by-Side Comparison Columns */}
            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pr-1">
              {/* Column 1: Supposed Original Email (Received First) */}
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3 flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                  <span className="px-2.5 py-0.5 rounded font-black text-[10px] uppercase tracking-wider bg-emerald-600 text-white flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Original (Received First)
                  </span>
                  <span
                    className="font-mono text-emerald-900 font-bold"
                    title={new Date(comparingDuplicateBid.original.rawReceivedAt).toLocaleString()}
                  >
                    {comparingDuplicateBid.original.receivedAt}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">
                    {comparingDuplicateBid.original.subject}
                  </div>
                  <div className="text-slate-600">
                    From: <strong>{comparingDuplicateBid.original.senderName}</strong> &lt;{comparingDuplicateBid.original.senderEmail}&gt;
                  </div>
                  {comparingDuplicateBid.original.bidNumber && (
                    <div className="text-blue-700 font-mono font-bold">
                      Bid Number: {comparingDuplicateBid.original.bidNumber}
                    </div>
                  )}
                  {comparingDuplicateBid.original.attachmentsCount > 0 && (
                    <div className="text-slate-600 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      <span>{comparingDuplicateBid.original.attachmentsCount} Attachment(s)</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-white p-3 rounded-lg border border-emerald-200 overflow-y-auto max-h-[280px] font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text text-slate-800">
                  {comparingDuplicateBid.original.bodyText || comparingDuplicateBid.original.scopeSummary || '(No body text available)'}
                </div>
              </div>

              {/* Column 2: Current Duplicate Email (Received Later) */}
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200 space-y-3 flex flex-col">
                <div className="flex items-center justify-between pb-2 border-b border-rose-200">
                  <span className="px-2.5 py-0.5 rounded font-black text-[10px] uppercase tracking-wider bg-rose-600 text-white flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Duplicate Copy (Received Later)
                  </span>
                  <span
                    className="font-mono text-rose-900 font-bold"
                    title={new Date(comparingDuplicateBid.current.rawReceivedAt).toLocaleString()}
                  >
                    {comparingDuplicateBid.current.receivedAt}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">
                    {comparingDuplicateBid.current.subject}
                  </div>
                  <div className="text-slate-600">
                    From: <strong>{comparingDuplicateBid.current.senderName}</strong> &lt;{comparingDuplicateBid.current.senderEmail}&gt;
                  </div>
                  {comparingDuplicateBid.current.attachmentsCount > 0 && (
                    <div className="text-slate-600 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      <span>{comparingDuplicateBid.current.attachmentsCount} Attachment(s)</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-white p-3 rounded-lg border border-rose-200 overflow-y-auto max-h-[280px] font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text text-slate-800">
                  {comparingDuplicateBid.current.bodyText || comparingDuplicateBid.current.scopeSummary || '(No body text available)'}
                </div>
              </div>
            </div>

            {/* Modal Footer Decision Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setComparingDuplicateBid(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {/* KEEP EMAIL BUTTON: Confirms Distinct */}
                <button
                  type="button"
                  onClick={() => handleKeepEmail(comparingDuplicateBid.current.id)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Keep Email (Not a Duplicate)</span>
                </button>

                {/* MOVE TO DUPLICATES BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    handleMoveToDuplicates(comparingDuplicateBid.current.id);
                    setComparingDuplicateBid(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <FolderArchive className="w-4 h-4" />
                  <span>Confirm & Move to Duplicates</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HUMAN-IN-THE-LOOP REVIEW & RECLASSIFICATION MODAL */}
      {reviewingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col p-6 animate-in zoom-in-95">
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

            <div className="overflow-y-auto pr-1 py-4 space-y-5 flex-1 text-xs">
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-1">
                <h4 className="font-bold text-slate-900 text-sm leading-snug">
                  {reviewingBid.subject}
                </h4>
                <div className="text-slate-600">
                  From: <strong>{reviewingBid.senderName}</strong> &lt;{reviewingBid.senderEmail}&gt; • Received: {reviewingBid.receivedAt}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Select Correct Category:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORIES.map((cat) => {
                    const isSelected = targetSticker === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setTargetSticker(cat)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/70 text-blue-900 font-bold shadow-xs ring-2 ring-blue-200'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs">{cat}</span>
                          {isSelected && <Check className="w-4 h-4 text-blue-600" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {targetSticker === 'ITB' && (
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3">
                  <h5 className="font-bold text-blue-950 text-xs">ITB Assignment Details</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Assign Estimator:
                      </label>
                      <select
                        value={selectedEstimatorForITB}
                        onChange={(e) => setSelectedEstimatorForITB(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
                      >
                        <option value="">Choose Estimator...</option>
                        {ESTIMATORS.map((est) => (
                          <option key={est} value={est}>
                            {est}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Bid Due Date:
                      </label>
                      <input
                        type="date"
                        value={selectedDueDateForITB}
                        onChange={(e) => setSelectedDueDateForITB(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}

              {(targetSticker === 'Addendum / RFI' || targetSticker === 'Addendum' || targetSticker === 'Won' || targetSticker === 'Lost') && (
                <div className="p-4 bg-purple-50/60 rounded-xl border border-purple-200 space-y-3">
                  <h5 className="font-bold text-purple-950 text-xs">
                    Link to Master Project (Active BID-26-XXXX)
                  </h5>
                  <input
                    type="text"
                    value={bidSearchQuery}
                    onChange={(e) => setBidSearchQuery(e.target.value)}
                    placeholder="Search active master bids..."
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                  />
                  <select
                    value={selectedBidNumberToLink}
                    onChange={(e) => setSelectedBidNumberToLink(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
                  >
                    <option value="">Select active project...</option>
                    {filteredBidsForLinking.map((b) => (
                      <option key={b.id} value={b.bidNumber!}>
                        {b.bidNumber} — {b.projectName || b.subject.slice(0, 45)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

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
                disabled={isSavingReclassification}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingReclassification ? 'Saving...' : 'Save Reclassification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STANDALONE LINK / RELINK MODAL */}
      {linkingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col p-6 animate-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  Calendar Manager Project Linking
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  Link Email into Active Project Folder
                </h3>
              </div>
              <button
                onClick={() => setLinkingBid(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Select the active project folder (<strong>BID-26-XXXX</strong>) to attach this email to. If multiple contractors are bidding on the same job, linking them together ensures the same estimator prices the project and doesn't duplicate takeoffs.
            </p>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search active bids by project name, GC contractor, or BID number..."
                value={relinkSearchQuery}
                onChange={(e) => setRelinkSearchQuery(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

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
