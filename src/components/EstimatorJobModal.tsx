'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Paperclip,
  Calendar,
  Clock,
  Building,
  ExternalLink,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Mail,
  Layers,
  Save,
  UserCheck,
  Image as ImageIcon,
  FileSpreadsheet,
  FileArchive,
  RefreshCw,
} from 'lucide-react';
import EmailDocumentViewer from './EmailDocumentViewer';
import {
  formatFriendlyDate,
  getDueDateStatus,
  normalizeDateToYyyyMmDd,
} from '@/lib/date-utils';

interface RelatedEmail {
  id: string;
  isPrimary: boolean;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  emailIntent: string;
  sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam';
  scopeSummary?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  isForwarded: boolean;
  forwardedBy?: string | null;
  originalSenderName?: string | null;
  originalSenderEmail?: string | null;
  attachments: Array<{
    filename: string;
    size?: number;
    formattedSize: string;
    contentType?: string;
    storageUrl?: string;
    previewUrl: string;
    downloadUrl: string;
  }>;
}

interface AggregatedAttachment {
  filename: string;
  size?: number;
  formattedSize: string;
  contentType?: string;
  category: 'plans_drawings' | 'addenda_specs' | 'spreadsheets' | 'photos_images' | 'other';
  fromBidId: string;
  fromEmailSubject: string;
  fromEmailDate: string;
  isAddendum: boolean;
  previewUrl: string;
  downloadUrl: string;
}

interface PrimaryJobDetails {
  id: string;
  bidNumber?: string | null;
  projectName: string;
  clientCompany: string;
  projectAddress?: string | null;
  jobCode?: string | null;
  assignedEstimator?: string | null;
  estimatorStatus: string;
  bidDueDate?: string | null;
  scopeSummary?: string | null;
  estimatorNotes?: string;
  totalEmailsCount: number;
  totalAttachmentsCount: number;
}

interface EstimatorJobModalProps {
  bidId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated?: () => void;
}

export default function EstimatorJobModal({
  bidId,
  isOpen,
  onClose,
  onJobUpdated,
}: EstimatorJobModalProps) {
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<PrimaryJobDetails | null>(null);
  const [emails, setEmails] = useState<RelatedEmail[]>([]);
  const [attachments, setAttachments] = useState<AggregatedAttachment[]>([]);
  const [activeTab, setActiveTab] = useState<'attachments' | 'emails' | 'scope'>('attachments');
  const [attachmentCategory, setAttachmentCategory] = useState<string>('ALL');
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('assigned');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen || !bidId) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/bid-requests/${bidId}/related`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.primaryBid) {
          setJob(data.primaryBid);
          setStatus(data.primaryBid.estimatorStatus || 'assigned');
          setNotes(data.primaryBid.estimatorNotes || '');
        }
        setEmails(data.emails || []);
        setAttachments(data.allAttachments || []);
        // Automatically expand the primary email or latest addendum
        if (data.emails && data.emails.length > 0) {
          setExpandedEmailId(data.emails[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load related job dossier:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, bidId]);

  if (!isOpen) return null;

  const handleSaveStatusAndNotes = async () => {
    if (!bidId) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/bid-requests/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimatorStatus: status,
          estimatorNotes: notes,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        if (onJobUpdated) onJobUpdated();
      }
    } catch (err) {
      console.error('Error saving job status and notes:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAttachments = attachments.filter((att) => {
    if (attachmentCategory === 'ALL') return true;
    return att.category === attachmentCategory;
  });

  const dueStatus = job ? getDueDateStatus(job.bidDueDate) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 font-bold">
              📂
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {job?.bidNumber || 'BID PENDING'}
                </span>
                {job?.jobCode && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    Code: {job.jobCode}
                  </span>
                )}
                <span className="text-xs text-slate-400">• Estimator Job Dossier</span>
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight truncate max-w-xl">
                {job?.projectName || 'Loading Project...'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close Workspace"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-500">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Gathering job emails, drawings, and addendums...</p>
          </div>
        ) : (
          <>
            {/* Meta & Estimator Workflow Bar */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              {/* Left Details */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                  <Building className="w-3.5 h-3.5 text-blue-600" />
                  <span>GC / Client:</span>
                  <span className="text-blue-950 font-bold">{job?.clientCompany || 'Direct Client'}</span>
                </div>

                <span className="text-slate-300">•</span>

                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Bid Due Date:</span>
                  <strong className="text-slate-900">{formatFriendlyDate(job?.bidDueDate)}</strong>
                  {dueStatus && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${dueStatus.badgeClass}`}>
                      {dueStatus.label}
                    </span>
                  )}
                </div>

                <span className="text-slate-300">•</span>

                <div className="flex items-center gap-1.5 text-slate-500">
                  <Mail className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{emails.length} Related Email{emails.length > 1 ? 's' : ''}</span>
                  <Paperclip className="w-3.5 h-3.5 text-blue-500 ml-1" />
                  <span>{attachments.length} Document{attachments.length > 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* Right: Estimator Status Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">Takeoff Status:</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="text-xs font-semibold rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-900 shadow-2xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="assigned">🔵 Assigned (Needs Takeoff)</option>
                  <option value="in_progress">🟡 In Progress (Takeoff Underway)</option>
                  <option value="bid_submitted">🟣 Bid Submitted to GC</option>
                  <option value="won">🟢 Won / Awarded</option>
                  <option value="lost">🔴 Lost to Competitor</option>
                  <option value="no_bid">⚪ No Bid (Declined)</option>
                </select>

                <button
                  onClick={handleSaveStatusAndNotes}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors"
                >
                  {saveSuccess ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Update'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="px-6 bg-white border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('attachments')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                    activeTab === 'attachments'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>All Drawings & Attachments</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-800 font-mono">
                    {attachments.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('emails')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                    activeTab === 'emails'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Thread & Addendum Timeline</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono">
                    {emails.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('scope')}
                  className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                    activeTab === 'scope'
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scope & Estimator Notes</span>
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/60">
              {/* TAB 1: ALL DRAWINGS & ATTACHMENTS (PLAN ROOM) */}
              {activeTab === 'attachments' && (
                <div className="space-y-4">
                  {/* Category Filter Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold text-slate-500 mr-1">Filter Files:</span>
                      {[
                        { key: 'ALL', label: `All Files (${attachments.length})` },
                        {
                          key: 'plans_drawings',
                          label: `📐 Plans & Drawings (${attachments.filter((a) => a.category === 'plans_drawings').length})`,
                        },
                        {
                          key: 'addenda_specs',
                          label: `📋 Addenda & Specs (${attachments.filter((a) => a.category === 'addenda_specs').length})`,
                        },
                        {
                          key: 'spreadsheets',
                          label: `📊 Spreadsheets (${attachments.filter((a) => a.category === 'spreadsheets').length})`,
                        },
                        {
                          key: 'photos_images',
                          label: `🖼️ Photos (${attachments.filter((a) => a.category === 'photos_images').length})`,
                        },
                      ].map((cat) => (
                        <button
                          key={cat.key}
                          onClick={() => setAttachmentCategory(cat.key)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                            attachmentCategory === cat.key
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    <div className="text-[11px] text-slate-500 font-medium">
                      💡 Click any drawing to preview inline or download to your PC.
                    </div>
                  </div>

                  {/* Attachments Grid */}
                  {filteredAttachments.length === 0 ? (
                    <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500">
                      <Paperclip className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-medium">No attachments found in this category.</p>
                      <p className="text-xs text-slate-400 mt-1">
                        If this project references an external plan room (e.g. BuildingConnected or Procore), check the email links under the Email Thread tab.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredAttachments.map((att, idx) => {
                        const ext = att.filename.split('.').pop()?.toLowerCase();
                        let IconComp = FileText;
                        let iconColor = 'text-blue-600';
                        let pillBg = 'bg-blue-50 text-blue-700 border-blue-200';

                        if (ext === 'pdf') {
                          IconComp = FileText;
                          iconColor = 'text-rose-600';
                          pillBg = 'bg-rose-50 text-rose-700 border-rose-200';
                        } else if (['dwg', 'dxf', 'cad'].includes(ext || '')) {
                          IconComp = Layers;
                          iconColor = 'text-indigo-600';
                          pillBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                        } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
                          IconComp = FileSpreadsheet;
                          iconColor = 'text-emerald-600';
                          pillBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
                          IconComp = ImageIcon;
                          iconColor = 'text-purple-600';
                          pillBg = 'bg-purple-50 text-purple-700 border-purple-200';
                        } else if (['zip', 'rar'].includes(ext || '')) {
                          IconComp = FileArchive;
                          iconColor = 'text-amber-600';
                          pillBg = 'bg-amber-50 text-amber-700 border-amber-200';
                        }

                        return (
                          <div
                            key={idx}
                            className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:shadow-sm hover:border-blue-300 transition-all flex items-start justify-between gap-3 group"
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <IconComp className={`w-4 h-4 ${iconColor}`} />
                              </div>
                              <div className="min-w-0">
                                <a
                                  href={att.previewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate block"
                                  title={`Open ${att.filename}`}
                                >
                                  {att.filename}
                                </a>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                                  <span className="font-mono">{att.formattedSize}</span>
                                  <span>•</span>
                                  <span className="truncate max-w-[160px]" title={att.fromEmailSubject}>
                                    {att.fromEmailDate} ({att.fromEmailSubject})
                                  </span>
                                  {att.isAddendum && (
                                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold uppercase text-[9px]">
                                      Addendum
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <a
                                href={att.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                title="Open preview in new tab"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <a
                                href={att.downloadUrl}
                                download
                                className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                                title="Download file"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: EMAIL THREAD & ADDENDUM TIMELINE */}
              {activeTab === 'emails' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>
                      <strong>Complete Correspondence History:</strong> All emails, addendums, and coworker forwards tied to <strong>{job?.bidNumber || job?.projectName}</strong> are shown below in chronological order.
                    </span>
                  </div>

                  <div className="space-y-3">
                    {emails.map((em, idx) => {
                      const isExpanded = expandedEmailId === em.id;
                      let stickerColor = 'bg-blue-100 text-blue-800 border-blue-200';
                      if (em.sticker === 'Addendum') stickerColor = 'bg-amber-100 text-amber-800 border-amber-200';
                      else if (em.sticker === 'Won') stickerColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                      else if (em.sticker === 'Lost') stickerColor = 'bg-rose-100 text-rose-800 border-rose-200';

                      return (
                        <div
                          key={em.id}
                          className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all"
                        >
                          {/* Email Accordion Header */}
                          <div
                            onClick={() => setExpandedEmailId(isExpanded ? null : em.id)}
                            className="p-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${stickerColor}`}>
                                {em.sticker}
                              </span>

                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-900 truncate">
                                  {em.subject}
                                </h4>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                  <span>From: <strong>{em.senderName}</strong> &lt;{em.senderEmail}&gt;</span>
                                  <span>•</span>
                                  <span>{em.receivedAt}</span>
                                  {em.attachments && em.attachments.length > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                        <Paperclip className="w-3 h-3" />
                                        {em.attachments.length} attachment{em.attachments.length > 1 ? 's' : ''}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[11px] text-slate-400">
                                {isExpanded ? 'Collapse' : 'View Email'}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform ${
                                  isExpanded ? 'rotate-180 text-blue-600' : ''
                                }`}
                              />
                            </div>
                          </div>

                          {/* Email Body & Authentic Document Viewer */}
                          {isExpanded && (
                            <div className="p-4 border-t border-slate-200 bg-slate-50/50">
                              <EmailDocumentViewer
                                id={em.id}
                                subject={em.subject}
                                senderName={em.senderName}
                                senderEmail={em.senderEmail}
                                receivedAt={em.receivedAt}
                                isForwarded={em.isForwarded}
                                forwardedBy={em.forwardedBy}
                                originalSenderName={em.originalSenderName}
                                originalSenderEmail={em.originalSenderEmail}
                                bodyText={em.bodyText}
                                bodyHtml={em.bodyHtml}
                                attachments={em.attachments}
                                maxHeight="h-[380px]"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: SCOPE & ESTIMATOR NOTES */}
              {activeTab === 'scope' && (
                <div className="space-y-4">
                  {/* AI Scope Card */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        AI Scope Extraction & Trade Package
                      </h4>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed bg-indigo-50/50 p-3 rounded-lg border border-indigo-100">
                      {job?.scopeSummary || 'No explicit scope summary extracted yet.'}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                          Project Location:
                        </span>
                        <span className="font-semibold text-slate-800">
                          {job?.projectAddress || 'Not specified in email'}
                        </span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="text-slate-400 font-semibold block text-[10px] uppercase">
                          Assigned Estimator:
                        </span>
                        <span className="font-semibold text-slate-800">
                          {job?.assignedEstimator || 'Unassigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estimator Takeoff Notes */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                        📝 Estimator Notes & Pricing Scratchpad
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        Visible to Estimators & Calendar Manager
                      </span>
                    </div>

                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter takeoff notes, fixture counts, vendor quotes, or RFI tracking (e.g. 'Counted 14 stalls in building A, waiting on Bobrick hardware quote...')"
                      rows={5}
                      className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-slate-800 bg-slate-50/40"
                    />

                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveStatusAndNotes}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        {saveSuccess ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Notes Saved!</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-3.5 h-3.5" />
                            <span>{isSaving ? 'Saving...' : 'Save Estimator Notes'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Footer */}
            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Job ID: <code className="font-mono text-slate-700">{job?.id}</code>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
                >
                  Close Dossier
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
