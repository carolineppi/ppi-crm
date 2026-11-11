'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Tag,
  FileText,
  ExternalLink,
  RefreshCw,
  Trophy,
  FileSpreadsheet,
  ShieldAlert,
  XCircle,
  RotateCcw,
  Sparkles,
  Paperclip,
  Check,
  Settings2,
  X,
  Plus,
  HelpCircle,
  Clock,
} from 'lucide-react';

interface BidItem {
  id: string;
  bid_number: string | null;
  email_subject: string;
  sender_email: string;
  sender_name: string;
  email_received_at: string;
  email_intent: string;
  duplicate_resolution?: string | null;
  triage_status?: string | null;
  estimator_status?: string | null;
  attachments?: any[];
  email_body_text?: string | null;
  email_body_html?: string | null;
  is_forwarded?: boolean;
  forwarded_by?: string | null;
  original_sender_email?: string | null;
  original_sender_name?: string | null;
  project_name?: string | null;
  client_company?: string | null;
  raw_payload?: any;
}

interface CustomLabelConfig {
  key: '6' | '7' | '8' | '9';
  name: string;
  color: 'amber' | 'cyan' | 'indigo' | 'pink' | 'emerald' | 'purple' | 'blue';
}

const DEFAULT_CUSTOM_LABELS: CustomLabelConfig[] = [
  { key: '6', name: 'Change Order', color: 'amber' },
  { key: '7', name: 'RFI / Scope', color: 'cyan' },
  { key: '8', name: 'Vendor Quote', color: 'indigo' },
  { key: '9', name: 'Budgetary', color: 'pink' },
];

export default function QuickLabelerPage() {
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<'unverified' | 'all' | 'verified'>('unverified');
  const [toast, setToast] = useState<string | null>(null);
  const [viewFormat, setViewFormat] = useState<'pdf' | 'text'>('pdf');
  const [isSaving, setIsSaving] = useState(false);

  // Custom Labels (Keys 6-9) State
  const [customLabels, setCustomLabels] = useState<CustomLabelConfig[]>(DEFAULT_CUSTOM_LABELS);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tempCustomLabels, setTempCustomLabels] = useState<CustomLabelConfig[]>(DEFAULT_CUSTOM_LABELS);

  // Load custom labels from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ppi_crm_custom_labels_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomLabels(parsed);
          setTempCustomLabels(parsed);
        }
      }
    } catch {
      // fallback to defaults
    }
  }, []);

  const saveCustomLabels = (newLabels: CustomLabelConfig[]) => {
    setCustomLabels(newLabels);
    localStorage.setItem('ppi_crm_custom_labels_v1', JSON.stringify(newLabels));
    setIsConfigOpen(false);
    showToast('✓ Custom labels (Keys 6-9) updated');
  };

  // Fetch all bids using lightweight summary endpoint
  const fetchBids = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bid-requests?summary=1');
      const data = await res.json();
      if (data.bidRequests && Array.isArray(data.bidRequests)) {
        setBids(data.bidRequests);
      }
    } catch (err) {
      console.error('Failed to load bids:', err);
      showToast('Error loading emails from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBids();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Human-checked check: only records marked with human_verified or is_labeled are verified
  const isHumanVerified = (b: BidItem) => {
    return (
      b.duplicate_resolution === 'human_verified' ||
      b.raw_payload?.is_labeled === true ||
      b.raw_payload?.human_verified === true
    );
  };

  // Get current assigned label
  const getCurrentLabel = (b: BidItem): string => {
    if (b.raw_payload?.human_label) return b.raw_payload.human_label;
    if (b.raw_payload?.custom_category) return b.raw_payload.custom_category;
    if (b.email_intent === 'addendum_update') return 'Addendum';
    if (b.email_intent === 'bid_won') return 'Won';
    if (b.email_intent === 'bid_lost') return 'Lost';
    if (b.email_intent === 'spam_noise') return 'Spam';
    return 'ITB';
  };

  // Filtered dataset
  const displayList = useMemo(() => {
    if (filterMode === 'unverified') {
      return bids.filter((b) => !isHumanVerified(b));
    }
    if (filterMode === 'verified') {
      return bids.filter(isHumanVerified);
    }
    return bids;
  }, [bids, filterMode]);

  // Ensure current index is within bounds
  useEffect(() => {
    if (displayList.length > 0 && currentIndex >= displayList.length) {
      setCurrentIndex(Math.max(0, displayList.length - 1));
    }
  }, [displayList.length, currentIndex]);

  const currentBid = displayList[currentIndex] || null;

  // Labeled statistics
  const totalCount = bids.length;
  const verifiedCount = bids.filter(isHumanVerified).length;
  const unverifiedCount = totalCount - verifiedCount;
  const percentComplete = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

  // Handle Label Assignment & Auto-Advance
  const handleAssignLabel = useCallback(
    async (label: string) => {
      if (!currentBid || isSaving) return;

      const targetId = currentBid.id;

      // Optimistic state update
      setBids((prev) =>
        prev.map((b) => {
          if (b.id !== targetId) return b;
          let intent = 'invitation_to_bid';
          if (label === 'Addendum') intent = 'addendum_update';
          else if (label === 'Won') intent = 'bid_won';
          else if (label === 'Lost') intent = 'bid_lost';
          else if (label === 'Spam') intent = 'spam_noise';
          else if (!['ITB', 'Addendum', 'Won', 'Lost', 'Spam'].includes(label)) {
            intent = 'general_inquiry';
          }

          return {
            ...b,
            email_intent: intent,
            duplicate_resolution: 'human_verified',
            raw_payload: {
              ...(b.raw_payload || {}),
              is_labeled: true,
              human_verified: true,
              human_label: label,
              custom_category: label,
              labeled_at: new Date().toISOString(),
            },
          };
        })
      );

      showToast(`✓ Assigned "${label}" (Final)`);

      // Auto-advance to next email
      if (filterMode === 'all') {
        if (currentIndex < displayList.length - 1) {
          setCurrentIndex((idx) => idx + 1);
        }
      } else {
        // In unverified mode, the item is removed from displayList, so staying at the current index
        // automatically points to the next pending email!
        if (currentIndex >= displayList.length - 1 && currentIndex > 0) {
          setCurrentIndex((idx) => Math.max(0, idx - 1));
        }
      }

      // Persist to Supabase
      try {
        setIsSaving(true);
        await fetch(`/api/bid-requests/${targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newSticker: label,
            isHumanLabeled: true,
            duplicateResolution: 'human_verified',
          }),
        });
      } catch (err) {
        console.error('Failed to save label:', err);
        showToast('⚠ Network error saving label');
      } finally {
        setIsSaving(false);
      }
    },
    [currentBid, isSaving, filterMode, currentIndex, displayList.length]
  );

  // Keyboard shortcuts (Keys 1-5 for standard, Keys 6-9 for custom categories)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      // Standard Keys 1-5
      if (e.key === '1' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleAssignLabel('ITB');
      } else if (e.key === '2' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleAssignLabel('Addendum');
      } else if (e.key === '3' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleAssignLabel('Won');
      } else if (e.key === '4' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        handleAssignLabel('Lost');
      } else if (e.key === '5' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleAssignLabel('Spam');
      }
      // Custom Keys 6-9
      else if (e.key === '6') {
        e.preventDefault();
        const l = customLabels.find((c) => c.key === '6');
        if (l && l.name.trim()) handleAssignLabel(l.name.trim());
      } else if (e.key === '7') {
        e.preventDefault();
        const l = customLabels.find((c) => c.key === '7');
        if (l && l.name.trim()) handleAssignLabel(l.name.trim());
      } else if (e.key === '8') {
        e.preventDefault();
        const l = customLabels.find((c) => c.key === '8');
        if (l && l.name.trim()) handleAssignLabel(l.name.trim());
      } else if (e.key === '9') {
        e.preventDefault();
        const l = customLabels.find((c) => c.key === '9');
        if (l && l.name.trim()) handleAssignLabel(l.name.trim());
      }
      // Navigation
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (currentIndex < displayList.length - 1) {
          setCurrentIndex((i) => i + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          setCurrentIndex((i) => i - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAssignLabel, currentIndex, displayList.length, customLabels]);

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'amber':
        return 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white border-amber-400/40';
      case 'cyan':
        return 'bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white border-cyan-400/40';
      case 'indigo':
        return 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white border-indigo-400/40';
      case 'pink':
        return 'bg-pink-600 hover:bg-pink-500 active:bg-pink-700 text-white border-pink-400/40';
      case 'emerald':
        return 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border-emerald-400/40';
      default:
        return 'bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-white border-slate-500/40';
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-lg mx-auto bg-slate-900 text-slate-100 select-none overflow-hidden font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-950/95 text-white border border-slate-700 rounded-full shadow-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-3 backdrop-blur-md">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* 1. TOP MOBILE HEADER: Navigation, Counter & Mode Toggle */}
      <header className="flex-none bg-slate-950 border-b border-slate-800 px-3.5 py-2 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white py-1 px-1.5 -ml-1 rounded active:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-semibold hidden sm:inline">CRM</span>
        </Link>

        {/* Progress Display */}
        <div className="flex flex-col items-center flex-1">
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold">
            <Tag className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-white">
              {displayList.length === 0 ? '0' : currentIndex + 1}
            </span>
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{displayList.length}</span>
            <span className="text-[10px] text-purple-300 font-normal">
              ({percentComplete}% verified)
            </span>
          </div>

          {/* Mini Progress Bar */}
          <div className="w-28 sm:w-36 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
        </div>

        {/* Filter Mode Selector & Settings */}
        <div className="flex items-center gap-1">
          <select
            value={filterMode}
            onChange={(e) => {
              setFilterMode(e.target.value as any);
              setCurrentIndex(0);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="unverified">To Check ({unverifiedCount})</option>
            <option value="all">All ({totalCount})</option>
            <option value="verified">Verified ({verifiedCount})</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setTempCustomLabels([...customLabels]);
              setIsConfigOpen(true);
            }}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 active:scale-95 transition-all"
            title="Configure Additional Labels (Buttons 6-9)"
          >
            <Settings2 className="w-4 h-4 text-purple-300" />
          </button>
        </div>
      </header>

      {/* 2. LOADING STATE */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-950">
          <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
          <h3 className="text-sm font-bold text-white">Loading Verification Queue...</h3>
          <p className="text-xs text-slate-500">Fetching 500+ backfilled emails from Supabase</p>
        </div>
      ) : currentBid ? (
        <>
          {/* 3. EMAIL SUBJECT & SENDER INFO BAR */}
          <div className="flex-none bg-slate-900 border-b border-slate-800 px-3.5 py-2 space-y-1">
            {/* Badges & Status Row */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Human Verified vs AI Suggested Badge */}
                {isHumanVerified(currentBid) ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500 text-slate-950 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-slate-950" /> {getCurrentLabel(currentBid)} (Verified)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> AI Guess: {getCurrentLabel(currentBid)} (Pending Check)
                  </span>
                )}

                {currentBid.bid_number && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950/80 text-blue-300 border border-blue-800">
                    {currentBid.bid_number}
                  </span>
                )}
              </div>

              {/* View Mode Toggle (PDF Document vs Text) & Fullscreen Link */}
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewFormat((f) => (f === 'pdf' ? 'text' : 'pdf'))}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold"
                >
                  {viewFormat === 'pdf' ? 'Raw Text' : 'PDF View'}
                </button>
                <a
                  href={`/api/bid-requests/${currentBid.id}/document`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700"
                  title="Open full PDF print view in new tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Email Subject */}
            <h2 className="text-sm font-bold text-white leading-tight line-clamp-2">
              {currentBid.email_subject}
            </h2>

            {/* Sender & Forwarding Info */}
            <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2 pt-0.5">
              <div className="truncate flex items-center gap-1">
                <span className="text-slate-300 font-semibold truncate">
                  {currentBid.sender_name || currentBid.sender_email.split('@')[0]}
                </span>
                <span className="text-slate-500 truncate text-[10px]">
                  &lt;{currentBid.sender_email}&gt;
                </span>
              </div>

              {currentBid.attachments && currentBid.attachments.length > 0 && (
                <span className="flex-shrink-0 flex items-center gap-0.5 text-blue-400 font-mono font-bold text-[10px]">
                  <Paperclip className="w-3 h-3" />
                  {currentBid.attachments.length}
                </span>
              )}
            </div>

            {currentBid.is_forwarded && currentBid.original_sender_email && (
              <div className="text-[10px] text-amber-300/90 truncate flex items-center gap-1 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/40">
                <span className="text-amber-500 font-bold">↳ Orig GC:</span>
                <span className="truncate">
                  {currentBid.original_sender_name || currentBid.original_sender_email}
                </span>
              </div>
            )}
          </div>

          {/* 4. CENTER STAGE: EMAIL BODY IN PDF PRINT FORM */}
          <main className="flex-1 min-h-0 bg-slate-950 relative overflow-hidden flex flex-col p-1.5 sm:p-2">
            <div className="w-full h-full bg-white rounded-xl shadow-lg overflow-hidden border border-slate-800 flex flex-col">
              {viewFormat === 'pdf' ? (
                <iframe
                  key={currentBid.id}
                  src={`/api/bid-requests/${currentBid.id}/document`}
                  className="w-full h-full border-0 bg-white"
                  title="Email Body in PDF Print Form"
                />
              ) : (
                <div className="w-full h-full p-4 overflow-y-auto text-slate-900 text-xs font-mono leading-relaxed bg-slate-50 whitespace-pre-wrap select-text">
                  {currentBid.email_body_text ||
                    currentBid.raw_payload?.bodyText ||
                    currentBid.raw_payload?.body ||
                    'No plain text body found.'}
                </div>
              )}
            </div>
          </main>

          {/* 5. BOTTOM THUMB CONTROL PAD (S24 FE Phone & Desktop Keys 1-9) */}
          <footer className="flex-none bg-slate-950 border-t border-slate-800 px-2.5 pt-1.5 pb-2.5 space-y-1.5">
            {/* Auxiliary Row: Navigation & Shortcuts Hint */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={currentIndex <= 0}
                className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed font-semibold active:scale-95 transition-all text-[11px]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="text-[10px] font-mono text-slate-500">
                1-tap assigns &amp; advances
              </span>

              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(displayList.length - 1, i + 1))}
                disabled={currentIndex >= displayList.length - 1}
                className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed font-semibold active:scale-95 transition-all text-[11px]"
              >
                <span>Skip</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* BUTTON MATRIX (Thumb-Optimized for Samsung Galaxy S24 FE) */}
            <div className="space-y-1">
              {/* Row 1: The 2 Primary Inbound ITB Types */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAssignLabel('ITB')}
                  className="py-2.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md border border-blue-400/40 cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5 text-blue-200" />
                  <span>ITB (Invitation)</span>
                  <span className="text-[10px] font-mono text-blue-200 bg-black/25 px-1 py-0.2 rounded hidden sm:inline">
                    1
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAssignLabel('Addendum')}
                  className="py-2.5 px-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md border border-purple-400/40 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-purple-200" />
                  <span>Addendum</span>
                  <span className="text-[10px] font-mono text-purple-200 bg-black/25 px-1 py-0.2 rounded hidden sm:inline">
                    2
                  </span>
                </button>
              </div>

              {/* Row 2: Standard Status Outcomes (Won, Lost, Spam) */}
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAssignLabel('Won')}
                  className="py-2 px-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 shadow-md border border-emerald-400/40 cursor-pointer"
                >
                  <Trophy className="w-3 h-3 text-emerald-200" />
                  <span>Won</span>
                  <span className="text-[9px] font-mono text-emerald-200 bg-black/25 px-1 rounded hidden sm:inline">
                    3
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAssignLabel('Lost')}
                  className="py-2 px-1 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 shadow-md border border-rose-400/40 cursor-pointer"
                >
                  <XCircle className="w-3 h-3 text-rose-200" />
                  <span>Lost</span>
                  <span className="text-[9px] font-mono text-rose-200 bg-black/25 px-1 rounded hidden sm:inline">
                    4
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAssignLabel('Spam')}
                  className="py-2 px-1 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 shadow-md border border-slate-500/40 cursor-pointer"
                >
                  <ShieldAlert className="w-3 h-3 text-slate-300" />
                  <span>Spam</span>
                  <span className="text-[9px] font-mono text-slate-300 bg-black/25 px-1 rounded hidden sm:inline">
                    5
                  </span>
                </button>
              </div>

              {/* Row 3: UP TO FOUR ADDITIONAL CUSTOM LABELS (Keys 6-9) */}
              <div className="grid grid-cols-4 gap-1 pt-0.5">
                {customLabels.map((custom) => (
                  <button
                    key={custom.key}
                    type="button"
                    onClick={() => handleAssignLabel(custom.name)}
                    className={`py-1.5 px-1 rounded-lg font-bold text-[10px] flex items-center justify-center gap-0.5 shadow-sm border transition-all truncate active:scale-95 ${getColorClasses(
                      custom.color
                    )}`}
                    title={`Assign "${custom.name}" (Desktop key: ${custom.key})`}
                  >
                    <span className="font-mono text-[9px] opacity-75">{custom.key}:</span>
                    <span className="truncate">{custom.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </footer>
        </>
      ) : (
        /* Empty / All Caught Up State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-slate-950">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">All Caught Up!</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              {filterMode === 'unverified'
                ? `You have manually checked and verified every email in the queue (${verifiedCount} verified).`
                : 'No emails match this filter.'}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            {filterMode === 'unverified' && (
              <button
                onClick={() => setFilterMode('all')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md"
              >
                Review All ({totalCount})
              </button>
            )}
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* 6. MODAL: CONFIGURE ADDITIONAL LABELS (KEYS 6-9) */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">Custom Labels (Keys 6–9)</h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Customize up to four additional category labels. These map directly to keys <strong>6, 7, 8, 9</strong> on Desktop and appear as quick buttons on your phone.
            </p>

            <div className="space-y-3">
              {tempCustomLabels.map((lbl, idx) => (
                <div key={lbl.key} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 font-mono text-xs font-bold flex items-center justify-center text-purple-300">
                    {lbl.key}
                  </span>
                  <input
                    type="text"
                    value={lbl.name}
                    onChange={(e) => {
                      const updated = [...tempCustomLabels];
                      updated[idx].name = e.target.value;
                      setTempCustomLabels(updated);
                    }}
                    placeholder={`Category name for key ${lbl.key}`}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <select
                    value={lbl.color}
                    onChange={(e) => {
                      const updated = [...tempCustomLabels];
                      updated[idx].color = e.target.value as any;
                      setTempCustomLabels(updated);
                    }}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300"
                  >
                    <option value="amber">Amber</option>
                    <option value="cyan">Cyan</option>
                    <option value="indigo">Indigo</option>
                    <option value="pink">Pink</option>
                    <option value="emerald">Emerald</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTempCustomLabels(DEFAULT_CUSTOM_LABELS)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
              >
                Reset Defaults
              </button>
              <button
                type="button"
                onClick={() => saveCustomLabels(tempCustomLabels)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md active:scale-95"
              >
                Save Labels
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
