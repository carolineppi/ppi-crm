'use client';

import React, { useEffect, useState } from 'react';
import {
  Flag,
  Bug,
  Sparkles,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import {
  DiagnosticContextSnapshot,
  captureDiagnosticContext,
} from '@/lib/feedback/diagnostics';

interface FlagIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export default function FlagIssueModal({
  isOpen,
  onClose,
  onSubmitted,
}: FlagIssueModalProps) {
  const [flagType, setFlagType] = useState<'bug' | 'improvement'>('bug');
  const [severity, setSeverity] = useState<'low' | 'normal' | 'urgent'>('normal');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [snapshot, setSnapshot] = useState<DiagnosticContextSnapshot | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedOk, setSubmittedOk] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSnapshot(captureDiagnosticContext());
      setSubmittedOk(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const ctx = snapshot || captureDiagnosticContext();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flagType,
          severity,
          title: title.trim(),
          message: message.trim(),
          pageUrl: ctx.pageUrl,
          pathname: ctx.pathname,
          contextSnapshot: ctx,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to submit report.');
        return;
      }
      setSubmittedOk(true);
      setTitle('');
      setMessage('');
      setFlagType('bug');
      setSeverity('normal');
      if (onSubmitted) onSubmitted();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error submitting report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 text-slate-900">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-black">Flag a Bug or Request Improvement</h2>
              <p className="text-[11px] text-slate-300">
                Sent directly to Admin with your current page &amp; diagnostic details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/15"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {submittedOk && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Thank you! Your report has been sent to Admin.</span>
            </div>
          )}

          {/* Type & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Report Type
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setFlagType('bug')}
                  className={`px-2.5 py-2 rounded-lg border font-bold flex items-center justify-center gap-1 ${
                    flagType === 'bug'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>Bug</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlagType('improvement')}
                  className={`px-2.5 py-2 rounded-lg border font-bold flex items-center justify-center gap-1 ${
                    flagType === 'improvement'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Improvement</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Priority / Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as any)}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 font-bold bg-white"
              >
                <option value="low">Low (Minor / Cosmetic)</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent (Blocking Work)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Short Summary *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                flagType === 'bug'
                  ? 'e.g. PO total stayed $0 when loading scope items'
                  : 'e.g. Add quick filter for unpaid retainage'
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
              Details — What happened &amp; what did you expect? *
            </label>
            <textarea
              rows={4}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the steps you took, which job/bid you were looking at, and what went wrong or what would help..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>

          {/* Captured Diagnostics Preview */}
          {snapshot && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDiagnostics((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-slate-600 hover:bg-slate-100"
              >
                <span>
                  Auto-Captured Context ({snapshot.pathname || '/'} •{' '}
                  {snapshot.recentFailedRequests.length} failed API /{' '}
                  {snapshot.recentErrors.length} errors)
                </span>
                {showDiagnostics ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {showDiagnostics && (
                <div className="p-3 border-t border-slate-200 text-[10px] font-mono text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                  <div>URL: {snapshot.pageUrl}</div>
                  <div>
                    Viewport: {snapshot.viewport?.width}×{snapshot.viewport?.height} • Theme:{' '}
                    {snapshot.theme}
                  </div>
                  {snapshot.recentFailedRequests.length > 0 && (
                    <div className="text-rose-700 pt-1">
                      Failed Requests:{' '}
                      {snapshot.recentFailedRequests
                        .map((r) => `${r.method} ${r.url} (${r.status})`)
                        .join(' | ')}
                    </div>
                  )}
                  {snapshot.recentErrors.length > 0 && (
                    <div className="text-amber-800 pt-1">
                      Recent Errors:{' '}
                      {snapshot.recentErrors.map((er) => er.message).join(' | ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim() || !message.trim()}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Sending...' : 'Send to Admin'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
