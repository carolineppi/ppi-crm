'use client';

import React, { useState, useRef } from 'react';
import {
  FileText,
  Printer,
  ExternalLink,
  Paperclip,
  Check,
  Copy,
  Layers,
  Code,
  Eye,
} from 'lucide-react';

interface AttachmentItem {
  filename: string;
  size?: number;
  contentType?: string;
  storageUrl?: string;
}

interface EmailDocumentViewerProps {
  id: string;
  subject: string;
  senderName: string;
  senderEmail: string;
  receivedAt: string;
  isForwarded?: boolean;
  forwardedBy?: string | null;
  originalSenderName?: string | null;
  originalSenderEmail?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachments?: AttachmentItem[];
  maxHeight?: string; // e.g. "h-[480px]"
  compact?: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function EmailDocumentViewer({
  id,
  subject,
  senderName,
  senderEmail,
  receivedAt,
  isForwarded,
  forwardedBy,
  originalSenderName,
  originalSenderEmail,
  bodyText,
  bodyHtml,
  attachments = [],
  maxHeight = 'h-[460px]',
  compact = false,
}: EmailDocumentViewerProps) {
  const [viewMode, setViewMode] = useState<'document' | 'text'>('document');
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const hasHtml = Boolean(bodyHtml && bodyHtml.trim().length > 0);

  // Synthesize or enhance HTML document for high-fidelity PDF/Document rendering
  const documentHtml = React.useMemo(() => {
    const printStyles = `
      <style>
        @page {
          size: letter;
          margin: 15mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0 !important;
          padding: 20px !important;
          line-height: 1.5;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
        }
        table {
          max-width: 100% !important;
        }
      </style>
      <base target="_blank">
    `;

    if (hasHtml && bodyHtml) {
      if (bodyHtml.includes('<head>')) {
        return bodyHtml.replace('<head>', `<head>${printStyles}`);
      } else if (bodyHtml.includes('<html>')) {
        return bodyHtml.replace('<html>', `<html><head>${printStyles}</head>`);
      } else {
        return `<!DOCTYPE html><html><head><meta charset="utf-8">${printStyles}</head><body>${bodyHtml}</body></html>`;
      }
    }

    // High-fidelity synthesized document layout for plain-text emails
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: letter; margin: 15mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 28px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-box {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 16px;
      margin-bottom: 22px;
    }
    .subject {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
      line-height: 1.3;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .meta-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .meta-label {
      width: 95px;
      font-weight: 600;
      color: #64748b;
    }
    .meta-value {
      color: #1e293b;
    }
    .content-box {
      font-size: 14px;
      color: #1e293b;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
  <base target="_blank">
</head>
<body>
  <div class="header-box">
    <div class="subject">${escapeHtml(subject)}</div>
    <table class="meta-table">
      <tr>
        <td class="meta-label">From:</td>
        <td class="meta-value"><strong>${escapeHtml(senderName)}</strong> &lt;${escapeHtml(senderEmail)}&gt;</td>
      </tr>
      ${
        isForwarded
          ? `<tr>
        <td class="meta-label">Client / GC:</td>
        <td class="meta-value"><strong>${escapeHtml(originalSenderName || senderName)}</strong> &lt;${escapeHtml(originalSenderEmail || senderEmail)}&gt; <span style="color:#4f46e5">(via ${escapeHtml(forwardedBy || 'Coworker')})</span></td>
      </tr>`
          : ''
      }
      <tr>
        <td class="meta-label">Date:</td>
        <td class="meta-value">${escapeHtml(receivedAt)}</td>
      </tr>
    </table>
  </div>
  <div class="content-box">${escapeHtml(bodyText || '(No email content available)')}</div>
</body>
</html>`;
  }, [hasHtml, bodyHtml, bodyText, subject, senderName, senderEmail, receivedAt, isForwarded, forwardedBy, originalSenderName, originalSenderEmail]);

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
      } catch {
        window.open(`/api/bid-requests/${id}/document`, '_blank');
      }
    } else {
      window.open(`/api/bid-requests/${id}/document`, '_blank');
    }
  };

  const handleCopyText = () => {
    const textToCopy = bodyText || bodyHtml || '';
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-100 rounded-xl border border-slate-300 overflow-hidden shadow-sm flex flex-col">
      {/* Top PDF / Document Control Bar */}
      <div className="px-3.5 py-2 bg-slate-200/90 border-b border-slate-300 flex items-center justify-between gap-2 flex-wrap">
        {/* Left: View Mode Pills */}
        <div className="flex items-center gap-1 bg-slate-300/80 p-0.5 rounded-lg border border-slate-300">
          <button
            type="button"
            onClick={() => setViewMode('document')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'document'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>PDF / Original Layout</span>
            {hasHtml && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-100 text-blue-700 font-extrabold uppercase">
                HTML
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewMode('text')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'text'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Code className="w-3.5 h-3.5 text-slate-500" />
            <span>Plain Text</span>
          </button>
        </div>

        {/* Right: Actions (Print PDF, Open New Tab, Copy) */}
        <div className="flex items-center gap-1.5">
          {viewMode === 'text' ? (
            <button
              type="button"
              onClick={handleCopyText}
              className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-colors"
              title="Copy email text"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handlePrint}
                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                title="Print or Save as PDF"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Print / Save as PDF</span>
              </button>

              <a
                href={`/api/bid-requests/${id}/document`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-md bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                title="Open document in a separate browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Full Page</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Main Viewport */}
      <div className="p-2.5 sm:p-3.5 bg-slate-200/50 flex-1 flex flex-col items-center">
        {viewMode === 'document' ? (
          /* Elevated White Document Sheet */
          <div className="w-full bg-white rounded-lg shadow-md border border-slate-300 overflow-hidden flex flex-col">
            <iframe
              ref={iframeRef}
              srcDoc={documentHtml}
              title={`Email document: ${subject}`}
              className={`w-full ${maxHeight} border-none bg-white`}
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals"
            />
          </div>
        ) : (
          /* Plain Text Fallback View */
          <div className={`w-full ${maxHeight} overflow-y-auto p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text border border-slate-800 shadow-inner`}>
            {bodyText || bodyHtml || '(No text content available)'}
          </div>
        )}

        {/* Attachments Footer Banner */}
        {attachments && attachments.length > 0 && (
          <div className="w-full mt-2.5 pt-2 border-t border-slate-300/80 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Paperclip className="w-3.5 h-3.5 text-blue-600" />
              <span>Attached Documents ({attachments.length}):</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {attachments.map((att, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 text-[11px] text-slate-800 font-medium shadow-2xs"
                >
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span className="truncate max-w-[220px]">{att.filename}</span>
                  {att.size ? (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({formatBytes(att.size)})
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
