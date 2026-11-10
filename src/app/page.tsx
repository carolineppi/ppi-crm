'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Copy,
  Users,
  AlertCircle,
  Paperclip,
  RefreshCw,
  Database,
  Trophy,
  FileSpreadsheet,
  ShieldAlert,
  CheckCircle,
  Sparkles,
  ArrowRight,
  UserCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface DisplayBidRequest {
  id: string;
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
  emailIntent: 'invitation_to_bid' | 'bid_won' | 'bid_lost' | 'addendum_update' | 'bid_confirmation' | 'spam_noise' | 'general_inquiry';
  filterStatus: 'inbox' | 'auto_filtered' | 'promoted_to_job' | 'archived';

  // AI & Forwarding Enrichment
  isForwarded?: boolean;
  forwardedBy?: string | null;
  originalSenderEmail?: string | null;
  originalSenderName?: string | null;
  scopeSummary?: string | null;
  recommendedAction?: string | null;
  aiReasoning?: string | null;
  aiConfidence?: number | null;
}

const FALLBACK_DATA: DisplayBidRequest[] = [
  {
    id: 'bid_101',
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
    emailIntent: 'invitation_to_bid',
    filterStatus: 'inbox',
    isForwarded: true,
    forwardedBy: 'John Coworker <john.coworker@ppi.com>',
    originalSenderEmail: 'sjenkins@apexcontractors.com',
    originalSenderName: 'Sarah Jenkins',
    scopeSummary: 'Custom casework, reception desk, and solid surface counter surfaces as part of the interior finish package. Bid due Nov 20.',
    recommendedAction: 'CREATE_NEW_BID',
    aiReasoning: 'Forwarded by coworker from external GC Apex Contractors. Clear ITB with drawings attached.',
    aiConfidence: 0.98,
  },
  {
    id: 'bid_102',
    subject: 'FW: 26-0208ST - St. Jude Medical Clinic - Addendum #1',
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
    triageStatus: 'pending_triage',
    priority: 'normal',
    assignedEstimator: null,
    attachmentsCount: 1,
    emailIntent: 'addendum_update',
    filterStatus: 'inbox',
    isForwarded: true,
    forwardedBy: 'Another Coworker <mike@ppi.com>',
    scopeSummary: 'Revised casework elevation drawings in Addendum #1.',
    recommendedAction: 'ATTACH_TO_EXISTING_BID',
    aiReasoning: 'Addendum containing updated drawings for existing project 26-0208ST. Auto-linked without separate assignment.',
    aiConfidence: 0.95,
  },
  {
    id: 'bid_103',
    subject: '26-0228JF - TEST CAROLINE - Notice of Award / Subcontract Agreement',
    senderEmail: 'contracts@lonestarbuilders.com',
    senderName: 'Caroline Vance',
    receivedAt: 'Today at 7:50 AM',
    jobCode: '26-0228JF',
    duplicateGroupId: 'group_lonestar_002',
    isFlaggedDuplicate: false,
    duplicateReasons: [],
    triageStatus: 'assigned',
    priority: 'urgent',
    assignedEstimator: 'Jaxson Farnholtz',
    attachmentsCount: 1,
    emailIntent: 'bid_won',
    filterStatus: 'inbox',
    scopeSummary: 'Official Notice of Award and Subcontract agreement for signature.',
    recommendedAction: 'PROMOTE_TO_JOB',
    aiReasoning: 'Award letter received. Eligible to promote to Active Job phase.',
    aiConfidence: 0.99,
  },
];

const ESTIMATORS = ['Steven Gross', 'Jaxson Farnholtz', 'Matt Magnani', 'Mariam Azab'];

export default function DispatchDashboard() {
  const [bids, setBids] = useState<DisplayBidRequest[]>(FALLBACK_DATA);
  const [activeTab, setActiveTab] = useState<'actionable' | 'won' | 'addendums' | 'spam'>('actionable');
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
        const mapped: DisplayBidRequest[] = data.bidRequests.map((r: any) => ({
          id: r.id,
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
          emailIntent: r.email_intent || 'invitation_to_bid',
          filterStatus: r.filter_status || 'inbox',

          isForwarded: r.is_forwarded,
          forwardedBy: r.forwarded_by,
          originalSenderEmail: r.original_sender_email,
          originalSenderName: r.original_sender_name,
          scopeSummary: r.scope_summary,
          recommendedAction: r.recommended_action,
          aiReasoning: r.intent_explanation,
          aiConfidence: r.intent_confidence,
        }));
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

  const filteredBids = bids.filter((b) => {
    if (activeTab === 'actionable') {
      return b.filterStatus !== 'auto_filtered' && b.emailIntent !== 'spam_noise' && b.emailIntent !== 'bid_won';
    }
    if (activeTab === 'won') {
      return b.emailIntent === 'bid_won';
    }
    if (activeTab === 'addendums') {
      return b.emailIntent === 'addendum_update';
    }
    if (activeTab === 'spam') {
      return b.filterStatus === 'auto_filtered' || b.emailIntent === 'spam_noise';
    }
    return true;
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

  const handleSimulateWebhook = async (type: 'itb_forwarded' | 'won' | 'addendum' | 'spam') => {
    setIsSimulating(true);

    const payloads = {
      itb_forwarded: {
        messageId: `sim_itb_${Date.now()}`,
        subject: 'FW: Riverside High School - Casework Bid Request',
        sender: 'Mike Coworker <mike.pm@ppi.com>',
        bodyText: `Hey Estimating, forwarding this over for pricing.

---------- Forwarded message ---------
From: David Miller <dmiller@turnerconstruction.com>
Date: Tue, Nov 10, 2026 at 9:15 AM
Subject: ITB: Riverside High School Phase 2 - Millwork
To: Mike Coworker <mike.pm@ppi.com>

Hello Bidders,

Turner Construction is requesting pricing for Riverside High School.
Bid due date is December 4, 2026 at 2:00 PM.
Job code: 26-0209ST.
Scope includes science lab casework and architectural wall panels.

Thank you,
David Miller | Turner Construction`,
        attachments: [
          { filename: 'Riverside_Lab_Casework.pdf', size: 3512030 },
        ],
      },
      won: {
        messageId: `sim_won_${Date.now()}`,
        subject: '26-0208ST - Notice to Proceed / Subcontract Agreement Awarded',
        sender: 'Contracts Department <contracts@apexcontractors.com>',
        bodyText: 'Congratulations, your proposal was selected. Attached is the subcontract agreement for your signature.',
        attachments: [{ filename: 'Subcontract_Agreement.pdf', size: 1048576 }],
      },
      addendum: {
        messageId: `sim_add_${Date.now()}`,
        subject: '26-0208ST - Addendum #2 Structural Revisions',
        sender: 'Architect <architect@apexcontractors.com>',
        bodyText: 'Please review revised drawings in Addendum #2 for 26-0208ST.',
        attachments: [{ filename: 'Addendum_2_Drawings.pdf', size: 2048576 }],
      },
      spam: {
        messageId: `sim_spam_${Date.now()}`,
        subject: 'Working Capital & Financing for Construction - Unsubscribe',
        sender: 'Marketing <spam@growthloans.com>',
        bodyText: 'Get fast cash flow. Click here to unsubscribe.',
        attachments: [],
      },
    };

    const simulatedPayload = payloads[type];
    setSimulationLog(`Analyzing with Gemini AI & posting to webhook...`);

    try {
      const res = await fetch('/api/webhooks/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simulatedPayload),
      });

      const json = await res.json();
      if (res.ok) {
        setSimulationLog(
          `✔ AI Analysis Complete! [${json.ai?.intent?.toUpperCase()}] -> Client: ${json.ai?.originalSender || 'Direct'} (${Math.round((json.ai?.confidence || 1) * 100)}% confidence)`
        );
        await fetchLiveBids();
      } else {
        setSimulationLog(`Webhook Response: ${json.error || 'Check Supabase connection'}`);
      }
    } catch {
      setSimulationLog(`Simulated local event: ${type.toUpperCase()} processed.`);
    } finally {
      setIsSimulating(false);
    }
  };

  const totalBids = bids.length;
  const duplicateCount = bids.filter((b) => b.isFlaggedDuplicate).length;
  const wonCount = bids.filter((b) => b.emailIntent === 'bid_won').length;
  const spamCount = bids.filter((b) => b.filterStatus === 'auto_filtered').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-2xl font-bold tracking-tight">
                Calendar Manager Dispatch Dashboard
              </h2>
              {isUsingLiveDb && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Database className="w-3 h-3" /> Supabase Live
                </span>
              )}
            </div>
            <p className="text-blue-200 text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              Powered by <strong>Gemini AI</strong>: Automatically unpacks coworker forwards, isolates true GCs, and groups addendums.
            </p>
          </div>

          {/* Quick Simulation Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={fetchLiveBids}
              disabled={isLoading}
              title="Refresh from Supabase"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <div className="bg-white/10 p-1 rounded-lg flex items-center gap-1">
              <button
                onClick={() => handleSimulateWebhook('itb_forwarded')}
                disabled={isSimulating}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors flex items-center gap-1"
                title="Simulates coworker forwarding an RFP from a General Contractor"
              >
                <Sparkles className="w-3 h-3" /> Test Forwarded ITB
              </button>
              <button
                onClick={() => handleSimulateWebhook('won')}
                disabled={isSimulating}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
              >
                🏆 Won
              </button>
              <button
                onClick={() => handleSimulateWebhook('addendum')}
                disabled={isSimulating}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-purple-500 hover:bg-purple-600 text-white transition-colors"
              >
                📎 Addendum
              </button>
              <button
                onClick={() => handleSimulateWebhook('spam')}
                disabled={isSimulating}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              >
                🚫 Spam
              </button>
            </div>
          </div>
        </div>

        {simulationLog && (
          <div className="mt-4 p-3 rounded-lg bg-white/10 text-xs text-blue-100 font-mono flex items-center justify-between">
            <span>{simulationLog}</span>
            <button
              onClick={() => setSimulationLog(null)}
              className="text-white/60 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Total Ingested
            </p>
            <p className="text-2xl font-bold text-slate-800">{totalBids}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
            <Copy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Grouped Duplicates
            </p>
            <p className="text-2xl font-bold text-slate-800">{duplicateCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Won / Ready for Job
            </p>
            <p className="text-2xl font-bold text-slate-800">{wonCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-slate-100 text-slate-600 rounded-lg">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Spam Auto-Filtered
            </p>
            <p className="text-2xl font-bold text-slate-800">{spamCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('actionable')}
          className={`pb-3 transition-colors relative ${
            activeTab === 'actionable'
              ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Active ITB Opportunities
        </button>
        <button
          onClick={() => setActiveTab('won')}
          className={`pb-3 transition-colors relative flex items-center gap-1.5 ${
            activeTab === 'won'
              ? 'text-emerald-600 border-b-2 border-emerald-600 font-semibold'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>🏆 Won Bids</span>
          {wonCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-emerald-100 text-emerald-800 font-bold">
              {wonCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('addendums')}
          className={`pb-3 transition-colors relative ${
            activeTab === 'addendums'
              ? 'text-purple-600 border-b-2 border-purple-600 font-semibold'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Addendums & Updates
        </button>
        <button
          onClick={() => setActiveTab('spam')}
          className={`pb-3 transition-colors relative flex items-center gap-1.5 ${
            activeTab === 'spam'
              ? 'text-slate-800 border-b-2 border-slate-800 font-semibold'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Filtered Spam & Noise</span>
          {spamCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-200 text-slate-700">
              {spamCount}
            </span>
          )}
        </button>
      </div>

      {/* Main Grouped Dispatch List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {activeTab === 'actionable' && 'Inbound Bid Opportunities (Grouped by Project)'}
              {activeTab === 'won' && 'Won Bids (Ready for Promotion to Active Job Entity)'}
              {activeTab === 'addendums' && 'Addendums, Bulletins & Scope Changes'}
              {activeTab === 'spam' && 'Auto-Filtered Solicitations & Newsletters'}
            </h3>
            <p className="text-xs text-slate-500">
              {activeTab === 'actionable' && 'Triage bids, assign estimators, and review AI-extracted scope.'}
              {activeTab === 'won' && 'These trigger parallel Contract Review, Install Scheduling, and Accounting.'}
              {activeTab === 'spam' && 'These emails were detected as noise and kept out of your primary inbox.'}
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {Object.keys(groupedBids).length} Project Group{Object.keys(groupedBids).length === 1 ? '' : 's'}
          </span>
        </div>

        {Object.keys(groupedBids).length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No items in this category yet.
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

                      <div className="space-y-1.5 flex-1">
                        {/* Tags & Badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {primary.jobCode && (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                              {primary.jobCode}
                            </span>
                          )}

                          <span className="font-semibold text-slate-900 text-base">
                            {primary.subject}
                          </span>

                          {duplicates.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex items-center gap-1">
                              <Copy className="w-3 h-3" />
                              {duplicates.length} Grouped Inquiry
                            </span>
                          )}
                        </div>

                        {/* Forwarding / Client Notice */}
                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          {primary.isForwarded ? (
                            <span className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-medium border border-indigo-100">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
                              True Client: <strong>{primary.originalSenderName || primary.senderName}</strong> &lt;{primary.originalSenderEmail || primary.senderEmail}&gt;
                              <span className="text-indigo-400 font-normal">↳ (via {primary.forwardedBy || 'Coworker'})</span>
                            </span>
                          ) : (
                            <span>Client: <strong>{primary.senderName}</strong> &lt;{primary.senderEmail}&gt;</span>
                          )}

                          <span className="text-slate-400">•</span>
                          <span>Received: {primary.receivedAt}</span>
                          <span className="text-slate-400">•</span>
                          <span className="flex items-center gap-1">
                            <Paperclip className="w-3.5 h-3.5" />
                            {primary.attachmentsCount} Attachment{primary.attachmentsCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* AI Scope Summary Card */}
                        {primary.scopeSummary && (
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
                            <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                              <Sparkles className="w-3.5 h-3.5" />
                              AI Scope Summary:
                            </div>
                            <p className="leading-relaxed">{primary.scopeSummary}</p>
                            {primary.aiReasoning && (
                              <p className="text-[11px] text-slate-500 italic mt-0.5">
                                Reason: {primary.aiReasoning}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-3">
                      {primary.emailIntent === 'bid_won' ? (
                        <button className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" /> Promote to Active Job
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 font-medium">Estimator:</span>
                          <select
                            value={primary.assignedEstimator || ''}
                            onChange={(e) => handleAssignEstimator(primary.id, e.target.value)}
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select Estimator...</option>
                            {ESTIMATORS.map((est) => (
                              <option key={est} value={est}>
                                {est}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded Duplicate Children View */}
                  {isExpanded && duplicates.length > 0 && (
                    <div className="mt-4 ml-8 pl-4 border-l-2 border-amber-300 space-y-3">
                      <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        Auto-Grouped Related Inquiries / Forwarded Copies
                      </p>

                      {duplicates.map((dup) => (
                        <div
                          key={dup.id}
                          className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-slate-800 flex items-center gap-2">
                              <span className="text-amber-700">↳</span>
                              {dup.subject}
                            </div>
                            <span className="text-slate-400">{dup.receivedAt}</span>
                          </div>

                          <div className="text-slate-600 flex items-center gap-3">
                            <span>From: {dup.senderEmail}</span>
                            <span>Attachments: {dup.attachmentsCount}</span>
                          </div>

                          <div className="bg-white/80 p-2 rounded border border-amber-100">
                            <p className="font-semibold text-slate-700 text-[11px] mb-1">
                              Grouped Reasons:
                            </p>
                            <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
                              {dup.duplicateReasons.map((reason, idx) => (
                                <li key={idx}>{reason}</li>
                              ))}
                            </ul>
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
      </div>
    </div>
  );
}
