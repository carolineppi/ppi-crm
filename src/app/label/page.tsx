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
  Smartphone,
  Eye,
  SlidersHorizontal,
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

type LabelType = 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam';

export default function QuickLabelerPage() {
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [filterMode, setFilterMode] = useState<'all' | 'unlabeled'>('unlabeled');
  const [toast, setToast] = useState<string | null>(null);
  const [viewFormat, setViewFormat] = useState<'pdf' | 'text'>('pdf');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch all bids
  const fetchBids = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bid-requests');
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

  // Helper: check if a bid has been human-verified
  const isHumanLabeled = (b: BidItem) => {
    return (
      b.duplicate_resolution === 'human_verified' ||
      b.raw_payload?.is_labeled === true ||
      b.raw_payload?.human_verified === true
    );
  };

  // Helper: determine current sticker
  const getCurrentSticker = (b: BidItem): LabelType => {
    if (b.email_intent === 'addendum_update') return 'Addendum';
    if (b.email_intent === 'bid_won') return 'Won';
    if (b.email_intent === 'bid_lost') return 'Lost';
    if (b.email_intent === 'spam_noise') return 'Spam';
    return 'ITB';
  };

  // Filtered dataset
  const displayList = useMemo(() => {
    if (filterMode === 'unlabeled') {
      return bids.filter((b) => !isHumanLabeled(b));
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
  const labeledCount = bids.filter(isHumanLabeled).length;
  const unlabeledCount = totalCount - labeledCount;
  const percentComplete = totalCount > 0 ? Math.round((labeledCount / totalCount) * 100) : 0;

  // Handle Label Assignment & Auto-Advance
  const handleAssignLabel = useCallback(
    async (label: LabelType) => {
      if (!currentBid || isSaving) return;

      const targetId = currentBid.id;
      const prevSticker = getCurrentSticker(currentBid);

      // Optimistic state update in local bids
      setBids((prev) =>
        prev.map((b) => {
          if (b.id !== targetId) return b;
          let intent = 'invitation_to_bid';
          if (label === 'Addendum') intent = 'addendum_update';
          else if (label === 'Won') intent = 'bid_won';
          else if (label === 'Lost') intent = 'bid_lost';
          else if (label === 'Spam') intent = 'spam_noise';

          return {
            ...b,
            email_intent: intent,
            duplicate_resolution: 'human_verified',
            raw_payload: {
              ...(b.raw_payload || {}),
              is_labeled: true,
              human_verified: true,
              labeled_at: new Date().toISOString(),
            },
          };
        })
      );

      showToast(`✓ Labeled as ${label}`);

      // Auto-advance to next email
      if (filterMode === 'all') {
        if (currentIndex < displayList.length - 1) {
          setCurrentIndex((idx) => idx + 1);
        }
      } else {
        // In 'unlabeled' mode, the current item will be removed from displayList on state change,
        // so staying at the current index naturally points to the next unlabeled email!
        // If we were at the end, cap it.
        if (currentIndex >= displayList.length - 1 && currentIndex > 0) {
          setCurrentIndex((idx) => Math.max(0, idx - 1));
        }
      }

      // Persist to Supabase in background
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

  // Keyboard shortcuts for laptop / desktop labeling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

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
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
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
  }, [handleAssignLabel, currentIndex, displayList.length]);

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
      <header className="flex-none bg-slate-950 border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2">
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
              ({percentComplete}% done)
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

        {/* Filter Toggle: Unlabeled vs All */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterMode((m) => (m === 'unlabeled' ? 'all' : 'unlabeled'))}
            className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors flex items-center gap-1 ${
              filterMode === 'unlabeled'
                ? 'bg-purple-950/80 text-purple-300 border-purple-700/60'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Toggle between Unlabeled Only and All emails"
          >
            <span>{filterMode === 'unlabeled' ? 'Queue' : 'All'}</span>
            <span className="px-1 py-0.2 rounded-full bg-black/40 text-[9px] font-mono">
              {filterMode === 'unlabeled' ? unlabeledCount : totalCount}
            </span>
          </button>
        </div>
      </header>

      {/* 2. EMAIL SUBJECT & SENDER INFO BAR (Optimized for S24 FE screen width) */}
      {currentBid ? (
        <>
          <div className="flex-none bg-slate-900 border-b border-slate-800 px-3.5 py-2.5 space-y-1">
            {/* Badges & Status Row */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Current Classification Badge */}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    getCurrentSticker(currentBid) === 'ITB'
                      ? 'bg-blue-600 text-white'
                      : getCurrentSticker(currentBid) === 'Addendum'
                      ? 'bg-purple-600 text-white'
                      : getCurrentSticker(currentBid) === 'Won'
                      ? 'bg-emerald-600 text-white'
                      : getCurrentSticker(currentBid) === 'Lost'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-600 text-white'
                  }`}
                >
                  {getCurrentSticker(currentBid)}
                </span>

                {isHumanLabeled(currentBid) ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/90 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-400" /> Human Labeled
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> AI Initial
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

          {/* 3. CENTER STAGE: EMAIL BODY IN PDF FORM (Scrollable dynamic container) */}
          <main className="flex-1 min-h-0 bg-slate-950 relative overflow-hidden flex flex-col p-2">
            <div className="w-full h-full bg-white rounded-xl shadow-lg overflow-hidden border border-slate-800 flex flex-col">
              {viewFormat === 'pdf' ? (
                /* PDF Document Render inside sandboxed iframe */
                <iframe
                  key={currentBid.id}
                  src={`/api/bid-requests/${currentBid.id}/document`}
                  className="w-full h-full border-0 bg-white"
                  title="Email Body in PDF Print Form"
                />
              ) : (
                /* Clean Raw Text Fallback */
                <div className="w-full h-full p-4 overflow-y-auto text-slate-900 text-xs font-mono leading-relaxed bg-slate-50 whitespace-pre-wrap select-text">
                  {currentBid.email_body_text ||
                    currentBid.raw_payload?.bodyText ||
                    currentBid.raw_payload?.body ||
                    'No plain text body found.'}
                </div>
              )}
            </div>
          </main>

          {/* 4. BOTTOM THUMB CONTROL PAD: Tailored for Samsung Galaxy S24 FE One-Handed Labeling */}
          <footer className="flex-none bg-slate-950 border-t border-slate-800 px-3 pt-2 pb-3.5 space-y-2">
            {/* Auxiliary Row: Prev / Next Navigation */}
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

              <span className="text-[11px] font-mono text-slate-500">
                Tap button to save &amp; advance
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

            {/* 5 Big High-Contrast Thumb Buttons for S24 FE */}
            <div className="space-y-1.5">
              {/* Top Tier: The 2 Most Frequent Estimating Emails (ITB & Addendum) */}
              <div className="grid grid-cols-2 gap-2">
                {/* 1. ITB Button (Blue) */}
                <button
                  type="button"
                  onClick={() => handleAssignLabel('ITB')}
                  className="py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-md border border-blue-400/40 transition-all cursor-pointer"
                >
                  <Tag className="w-4 h-4 text-blue-200" />
                  <span>ITB</span>
                  <span className="text-[10px] font-mono text-blue-200 bg-black/25 px-1 py-0.2 rounded hidden sm:inline">
                    1
                  </span>
                </button>

                {/* 2. Addendum Button (Purple) */}
                <button
                  type="button"
                  onClick={() => handleAssignLabel('Addendum')}
                  className="py-3 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-md border border-purple-400/40 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-purple-200" />
                  <span>Addendum</span>
                  <span className="text-[10px] font-mono text-purple-200 bg-black/25 px-1 py-0.2 rounded hidden sm:inline">
                    2
                  </span>
                </button>
              </div>

              {/* Bottom Tier: Won, Lost, and Spam */}
              <div className="grid grid-cols-3 gap-1.5">
                {/* 3. Won Button (Emerald) */}
                <button
                  type="button"
                  onClick={() => handleAssignLabel('Won')}
                  className="py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md border border-emerald-400/40 transition-all cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5 text-emerald-200" />
                  <span>Won</span>
                  <span className="text-[9px] font-mono text-emerald-200 bg-black/25 px-1 rounded hidden sm:inline">
                    3
                  </span>
                </button>

                {/* 4. Lost Button (Rose) */}
                <button
                  type="button"
                  onClick={() => handleAssignLabel('Lost')}
                  className="py-2.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md border border-rose-400/40 transition-all cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-200" />
                  <span>Lost</span>
                  <span className="text-[9px] font-mono text-rose-200 bg-black/25 px-1 rounded hidden sm:inline">
                    4
                  </span>
                </button>

                {/* 5. Spam Button (Slate) */}
                <button
                  type="button"
                  onClick={() => handleAssignLabel('Spam')}
                  className="py-2.5 px-2 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-slate-800 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md border border-slate-500/40 transition-all cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-300" />
                  <span>Spam</span>
                  <span className="text-[9px] font-mono text-slate-300 bg-black/25 px-1 rounded hidden sm:inline">
                    5
                  </span>
                </button>
              </div>
            </div>
          </footer>
        </>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">All Caught Up!</h3>
            <p className="text-xs text-slate-400 max-w-xs">
              {filterMode === 'unlabeled'
                ? `You have labeled all emails in the queue (${labeledCount} total).`
                : 'No emails found in this database.'}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            {filterMode === 'unlabeled' && (
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
    </div>
  );
}
