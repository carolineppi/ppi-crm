'use client';

import React, { useState, useEffect } from 'react';
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
  Link as LinkIcon,
  XCircle,
  Hash,
} from 'lucide-react';

interface DisplayBidRequest {
  id: string;
  bidNumber: string | null;
  subject: string;
  senderEmail: string;
  senderName: string;
  receivedAt: string;
  jobCode: string | null;
  duplicateGroupId: string;
  isFlaggedDuplicate: boolean;
  duplicateReasons: string[];
  triageStatus: 'pending_triage' | 'in_triage' | 'ready_for_assignment' | 'assigned' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedEstimator: string | null;
  attachmentsCount: number;

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

const FALLBACK_DATA: DisplayBidRequest[] = [
  {
    id: 'bid_101',
    bidNumber: 'BID-26-0001',
    subject: 'FW: St. Jude Medical Clinic - Interior Finish Package',
    senderEmail: 'sjenkins@apexcontractors.com',
    senderName: 'Sarah Jenkins (Apex Contractors)',
    receivedAt: 'Today at 8:15 AM',
    jobCode: '26-0208ST',
    duplicateGroupId: 'group_apex_001',
    isFlaggedDuplicate: false,
    duplicateReasons: [],
    triageStatus: 'ready_for_assignment',
    priority: 'high',
    assignedEstimator: null,
    attachmentsCount: 2,
    sticker: 'ITB',
    filterStatus: 'inbox',
    isForwarded: true,
    forwardedBy: 'John Coworker <john.coworker@ppi.com>',
    originalSenderEmail: 'sjenkins@apexcontractors.com',
    originalSenderName: 'Sarah Jenkins',
    scopeSummary: 'Custom casework, reception desk, and solid surface counter surfaces as part of the interior finish package. Bid due Nov 20.',
    aiReasoning: 'New RFP forwarded by coworker from external GC Apex Contractors. Requires estimator assignment.',
    aiConfidence: 0.98,
  },
  {
    id: 'bid_102',
    bidNumber: null,
    subject: 'Addendum #1: St. Jude Medical Clinic - Casework Elevations',
    senderEmail: 'sjenkins@apexcontractors.com',
    senderName: 'Sarah Jenkins (Apex Contractors)',
    receivedAt: 'Today at 8:42 AM',
    jobCode: '26-0208ST',
    duplicateGroupId: 'group_apex_001',
    isFlaggedDuplicate: true,
    duplicateReasons: [
      'Identical attachment checksum matched (Apex_Plans_v2.pdf)',
      'Exact job code match: 26-0208ST',
    ],
    triageStatus: 'ready_for_assignment',
    priority: 'normal',
    assignedEstimator: null,
    attachmentsCount: 1,
    sticker: 'Addendum',
    filterStatus: 'inbox',
    isForwarded: false,
    scopeSummary: 'Revised casework elevation drawings in Addendum #1 for ongoing St. Jude Clinic bid.',
    aiReasoning: 'Scope revision for existing bid. Auto-matched to BID-26-0001.',
    aiConfidence: 0.95,
    matchedBidNumber: 'BID-26-0001',
    matchConfidence: 0.97,
    matchReason: 'Matches project name St. Jude Clinic and contractor Apex Contractors',
    matchStatus: 'confirmed',
  },
  {
    id: 'bid_103',
    bidNumber: null,
    subject: 'Notice of Award: St. Jude Medical Clinic - Subcontract Agreement',
    senderEmail: 'contracts@apexcontractors.com',
    senderName: 'Contracts Dept (Apex)',
    receivedAt: 'Today at 7:50 AM',
    jobCode: '26-0208ST',
    duplicateGroupId: 'group_apex_001',
    isFlaggedDuplicate: false,
    duplicateReasons: [],
    triageStatus: 'assigned',
    priority: 'urgent',
    assignedEstimator: 'Steven Gross',
    attachmentsCount: 1,
    sticker: 'Won',
    filterStatus: 'inbox',
    scopeSummary: 'Official Notice of Award and Subcontract agreement for signature.',
    aiReasoning: 'Award letter received. Matched to BID-26-0001 to promote to Active Job phase.',
    aiConfidence: 0.99,
    matchedBidNumber: 'BID-26-0001',
    matchConfidence: 0.99,
    matchReason: 'Award matches active bid BID-26-0001',
    matchStatus: 'confirmed',
  },
];

const ESTIMATORS = ['Steven Gross', 'Jaxson Farnholtz', 'Matt Magnani', 'Mariam Azab'];

export default function DispatchDashboard() {
  const [bids, setBids] = useState<DisplayBidRequest[]>(FALLBACK_DATA);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam'>('ALL');
  const [isUsingLiveDb, setIsUsingLiveDb] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    group_apex_001: true,
  });
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  const fetchLiveBids = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/bid-requests');
      const data = await res.json();
      if (data.bidRequests && data.bidRequests.length > 0) {
        const mapped: DisplayBidRequest[] = data.bidRequests.map((r: any) => {
          // Map DB intent to definitive sticker
          let sticker: DisplayBidRequest['sticker'] = 'ITB';
          if (r.email_intent === 'addendum_update') sticker = 'Addendum';
          else if (r.email_intent === 'bid_won') sticker = 'Won';
          else if (r.email_intent === 'bid_lost') sticker = 'Lost';
          else if (r.email_intent === 'spam_noise') sticker = 'Spam';

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
            duplicateGroupId: r.duplicate_group_id || r.id,
            isFlaggedDuplicate: r.is_flagged_duplicate,
            duplicateReasons: r.duplicate_reasons || [],
            triageStatus: r.triage_status || 'pending_triage',
            priority: r.priority || 'normal',
            assignedEstimator: r.assigned_estimator_id ? 'Assigned' : null,
            attachmentsCount: Array.isArray(r.attachments) ? r.attachments.length : 0,
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
  }, []);

  // Filter based on active sticker filter
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

  const handleAssignEstimator = (bidId: string, estimator: string) => {
    setBids((prev) =>
      prev.map((b) =>
        b.id === bidId
          ? { ...b, assignedEstimator: estimator, triageStatus: 'assigned' }
          : b
      )
    );
  };

  // Sticker counts
  const countITB = bids.filter((b) => b.sticker === 'ITB').length;
  const countAddendum = bids.filter((b) => b.sticker === 'Addendum').length;
  const countWon = bids.filter((b) => b.sticker === 'Won').length;
  const countLost = bids.filter((b) => b.sticker === 'Lost').length;
  const countSpam = bids.filter((b) => b.sticker === 'Spam').length;

  const renderStickerBadge = (sticker: DisplayBidRequest['sticker']) => {
    switch (sticker) {
      case 'ITB':
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-blue-600 text-white shadow-sm flex items-center gap-1">
            ITB
          </span>
        );
      case 'Addendum':
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-purple-600 text-white shadow-sm flex items-center gap-1">
            <FileSpreadsheet className="w-3 h-3" /> Addendum
          </span>
        );
      case 'Won':
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-emerald-600 text-white shadow-sm flex items-center gap-1">
            <Trophy className="w-3 h-3" /> Won
          </span>
        );
      case 'Lost':
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-rose-600 text-white shadow-sm flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Lost
          </span>
        );
      case 'Spam':
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-slate-500 text-white shadow-sm flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Spam
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded font-black text-[11px] uppercase tracking-wider bg-slate-600 text-white">
            General
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
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
                  <Database className="w-3 h-3" /> Supabase Live ({bids.length} Loaded)
                </span>
              )}
            </div>
            <p className="text-blue-200 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <strong>AI Triage Active:</strong> ITBs generate internal Bid Numbers and get assigned to estimators. Addendums, Wons, and Losses auto-match to existing bid folders.
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

        {simulationLog && (
          <div className="mt-4 p-3 rounded-lg bg-white/10 text-xs text-blue-100 font-mono flex items-center justify-between">
            <span>{simulationLog}</span>
            <button onClick={() => setSimulationLog(null)} className="text-white/60 hover:text-white">✕</button>
          </div>
        )}
      </div>

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
              {activeFilter !== 'ITB' && activeFilter !== 'Spam' && 'These do not get assigned separately. AI matches them to existing internal bid numbers.'}
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
                          {renderStickerBadge(primary.sticker)}

                          {/* Internal Bid Number for ITBs */}
                          {primary.sticker === 'ITB' && primary.bidNumber && (
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-900 border border-blue-200 flex items-center gap-1">
                              <Hash className="w-3 h-3 text-blue-600" /> {primary.bidNumber}
                            </span>
                          )}

                          {/* Matched Bid Number for Addendum / Won / Lost */}
                          {primary.sticker !== 'ITB' && primary.matchedBidNumber && (
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3 text-purple-600" /> Linked to {primary.matchedBidNumber}
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
                                <strong>AI Bid Match:</strong> Matched to <strong>{primary.matchedBidNumber}</strong> ({Math.round((primary.matchConfidence || 0.95) * 100)}% match) — {primary.matchReason || 'Project & scope match'}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-200 text-purple-800">
                              Folder Linked
                            </span>
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
                      </div>
                    </div>

                    {/* Operational Action Column */}
                    <div className="flex items-center gap-3">
                      {/* RULE: ONLY ITBs ARE ASSIGNED TO ESTIMATORS */}
                      {primary.sticker === 'ITB' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">Estimator:</span>
                          <select
                            value={primary.assignedEstimator || ''}
                            onChange={(e) => handleAssignEstimator(primary.id, e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 shadow-sm"
                          >
                            <option value="">Assign Estimator...</option>
                            {ESTIMATORS.map((est) => (
                              <option key={est} value={est}>
                                {est}
                              </option>
                            ))}
                          </select>
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
                              {renderStickerBadge(dup.sticker)}
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
    </div>
  );
}
