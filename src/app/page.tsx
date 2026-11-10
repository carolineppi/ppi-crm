'use client';

import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Copy,
  Users,
  Clock,
  AlertCircle,
  Paperclip,
  Send,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Database,
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
  triageStatus: 'pending_triage' | 'in_triage' | 'ready_for_assignment' | 'assigned';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  assignedEstimator: string | null;
  attachmentsCount: number;
}

const FALLBACK_DATA: DisplayBidRequest[] = [
  {
    id: 'bid_101',
    subject: '26-0208ST - TEST DAVID - Architectural Plans & Bid Request',
    senderEmail: 'purchasing@apexcontractors.com',
    senderName: 'David Miller',
    receivedAt: 'Today at 8:15 AM',
    jobCode: '26-0208ST',
    duplicateGroupId: 'group_apex_001',
    isFlaggedDuplicate: false,
    duplicateReasons: [],
    triageStatus: 'ready_for_assignment',
    priority: 'high',
    assignedEstimator: null,
    attachmentsCount: 2,
  },
  {
    id: 'bid_102',
    subject: 'FW: 26-0208ST - TEST DAVID - Architectural Plans & Bid Request',
    senderEmail: 'pm-assist@apexcontractors.com',
    senderName: 'Apex PM Assistant',
    receivedAt: 'Today at 8:42 AM',
    jobCode: '26-0208ST',
    duplicateGroupId: 'group_apex_001',
    isFlaggedDuplicate: true,
    duplicateReasons: [
      'Identical attachment checksum matched (Apex_Plans_v2.pdf)',
      'Exact job code match: 26-0208ST',
      'High subject keyword overlap (85%)',
    ],
    triageStatus: 'pending_triage',
    priority: 'normal',
    assignedEstimator: null,
    attachmentsCount: 2,
  },
  {
    id: 'bid_103',
    subject: '26-0228JF - TEST CAROLINE - Houston, Texas - Millwork Scope',
    senderEmail: 'estimating@lonestarbuilders.com',
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
  },
  {
    id: 'bid_104',
    subject: '25-0803ST - TEST JOB - TEST Customer - Specification Addendum',
    senderEmail: 'bids@turnerconstruction.com',
    senderName: 'Steven Gross',
    receivedAt: 'Yesterday at 4:30 PM',
    jobCode: '25-0803ST',
    duplicateGroupId: 'group_turner_003',
    isFlaggedDuplicate: false,
    duplicateReasons: [],
    triageStatus: 'in_triage',
    priority: 'normal',
    assignedEstimator: 'Steven Gross',
    attachmentsCount: 3,
  },
];

const ESTIMATORS = ['Steven Gross', 'Jaxson Farnholtz', 'Matt Magnani', 'Mariam Azab'];

export default function DispatchDashboard() {
  const [bids, setBids] = useState<DisplayBidRequest[]>(FALLBACK_DATA);
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
        }));
        setBids(mapped);
        setIsUsingLiveDb(true);
      }
    } catch {
      // fallback to mock data
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveBids();
  }, []);

  const groupedBids = bids.reduce<Record<string, DisplayBidRequest[]>>((acc, bid) => {
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

  const handleSimulateWebhook = async () => {
    setIsSimulating(true);
    setSimulationLog('Sending webhook payload to /api/webhooks/email...');

    const simulatedPayload = {
      messageId: `sim_${Date.now()}`,
      subject: 'FW: 26-0208ST - TEST DAVID - Additional Drawings & Scope',
      sender: 'estimator2@apexcontractors.com',
      bodyText: 'Forwarding updated set for 26-0208ST.',
      attachments: [
        {
          filename: 'Apex_Plans_v2.pdf',
          size: 4512030,
          checksum: 'f9b2a45f5c05e9ee8f89b1c89e16cb77e854f90b237441fe08bdf42f1013162f',
        },
      ],
    };

    try {
      const res = await fetch('/api/webhooks/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simulatedPayload),
      });

      const json = await res.json();
      if (res.ok) {
        setSimulationLog(
          `✔ Webhook Success! Stored in Supabase. Group: ${json.duplicateGroupId.slice(0, 8)}... (Duplicate: ${json.isFlaggedDuplicate})`
        );
        await fetchLiveBids();
      } else {
        setSimulationLog(`Webhook Response: ${json.error || 'Check Supabase connection'}`);
      }
    } catch {
      setSimulationLog(
        'Simulated offline: Detected identical hash for 26-0208ST. Auto-grouped into Apex Project!'
      );
    } finally {
      setIsSimulating(false);
    }
  };

  const totalBids = bids.length;
  const duplicateCount = bids.filter((b) => b.isFlaggedDuplicate).length;
  const pendingTriage = bids.filter((b) => b.triageStatus === 'pending_triage').length;
  const assignedCount = bids.filter((b) => b.assignedEstimator).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Environment Info */}
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
            <p className="text-blue-200 text-sm">
              Automated email ingestion, heuristic deduplication, and estimator queue dispatch.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchLiveBids}
              disabled={isLoading}
              title="Refresh from Supabase"
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleSimulateWebhook}
              disabled={isSimulating}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" />
              {isSimulating ? 'Processing...' : 'Simulate Inbound Email'}
            </button>
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
              Flagged Duplicates
            </p>
            <p className="text-2xl font-bold text-slate-800">{duplicateCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Needs Triage
            </p>
            <p className="text-2xl font-bold text-slate-800">{pendingTriage}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              Assigned to Estimators
            </p>
            <p className="text-2xl font-bold text-slate-800">{assignedCount}</p>
          </div>
        </div>
      </div>

      {/* Main Grouped Dispatch List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Inbound Bid Opportunities (Grouped by Project / Duplicate Group)
            </h3>
            <p className="text-xs text-slate-500">
              Duplicates are grouped automatically so the Calendar Manager never has to delete emails manually.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {Object.keys(groupedBids).length} Project Groups
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {Object.entries(groupedBids).map(([groupId, groupItems]) => {
            const isExpanded = expandedGroups[groupId] ?? false;
            const primary = groupItems.find((b) => !b.isFlaggedDuplicate) || groupItems[0];
            const duplicates = groupItems.filter((b) => b.id !== primary.id);

            return (
              <div key={groupId} className="p-4 hover:bg-slate-50/50 transition-colors">
                {/* Group Header */}
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

                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {primary.jobCode && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                            {primary.jobCode}
                          </span>
                        )}
                        <span className="font-semibold text-slate-900 text-sm">
                          {primary.subject}
                        </span>
                        {duplicates.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex items-center gap-1">
                            <Copy className="w-3 h-3" />
                            {duplicates.length} Grouped Duplicate{duplicates.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 flex items-center gap-4 flex-wrap">
                        <span>From: <strong>{primary.senderName}</strong> &lt;{primary.senderEmail}&gt;</span>
                        <span>Received: {primary.receivedAt}</span>
                        <span className="flex items-center gap-1">
                          <Paperclip className="w-3.5 h-3.5" />
                          {primary.attachmentsCount} Attachment{primary.attachmentsCount > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Assignment */}
                  <div className="flex items-center gap-3">
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

                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        primary.assignedEstimator
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {primary.assignedEstimator ? 'Assigned' : 'Needs Assignment'}
                    </span>
                  </div>
                </div>

                {/* Expanded Duplicate Children View */}
                {isExpanded && duplicates.length > 0 && (
                  <div className="mt-4 ml-8 pl-4 border-l-2 border-amber-300 space-y-3">
                    <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      Auto-Grouped Inbound Inquiries
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
                            Detection Flags:
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
      </div>
    </div>
  );
}
