'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Sparkles,
  Copy,
  Check,
  Palette,
} from 'lucide-react';
import {
  parseIcsCalendar,
  parseGoogleCalendarJson,
  ParsedCalendarEvent,
} from '@/lib/calendar/ics-parser';

interface EditableImportEvent extends ParsedCalendarEvent {
  selected: boolean;
  assignedEstimator: string;
}

interface CalendarImportModalProps {
  isOpen: boolean;
  estimators: string[];
  onClose: () => void;
  onImportComplete: (summary: { createdCount: number; enrichedCount: number; skippedCount: number }) => void;
}

const APPS_SCRIPT_SNIPPET = `function doGet() {
  // Replace with your Bid Calendar ID (from Calendar Settings -> Integrate calendar), or leave 'primary'
  var calendarId = 'primary';
  var token = ScriptApp.getOAuthToken();
  var events = [];
  var pageToken = null;

  do {
    var url = 'https://www.googleapis.com/calendar/v3/calendars/' +
      encodeURIComponent(calendarId) +
      '/events?maxResults=2500&singleEvents=true' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    var res = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token }
    });
    var data = JSON.parse(res.getContentText());
    if (data.items) events = events.concat(data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ContentService
    .createTextOutput(JSON.stringify(events))
    .setMimeType(ContentService.MimeType.JSON)
    .downloadAsFile('bid_calendar_with_colors.json');
}`;

export default function CalendarImportModal({
  isOpen,
  estimators,
  onClose,
  onImportComplete,
}: CalendarImportModalProps) {
  const [events, setEvents] = useState<EditableImportEvent[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dateRangePreset, setDateRangePreset] = useState<'6m' | '12m' | 'all' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [enrichExisting, setEnrichExisting] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showColorScriptHelp, setShowColorScriptHelp] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cutoffYmd = useMemo(() => {
    const now = new Date();
    if (dateRangePreset === '6m') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      return d.toISOString().slice(0, 10);
    }
    if (dateRangePreset === '12m') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 12);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }, [dateRangePreset]);

  const visibleEvents = useMemo(() => {
    return events.filter((ev) => {
      if (dateRangePreset === '6m' || dateRangePreset === '12m') {
        return cutoffYmd ? ev.dueDate >= cutoffYmd : true;
      }
      if (dateRangePreset === 'custom') {
        if (customFrom && ev.dueDate < customFrom) return false;
        if (customTo && ev.dueDate > customTo) return false;
      }
      return true;
    });
  }, [events, dateRangePreset, cutoffYmd, customFrom, customTo]);

  if (!isOpen) return null;

  const selectedVisibleCount = visibleEvents.filter((e) => e.selected).length;
  const colorTaggedCount = events.filter((e) => Boolean(e.rawColor)).length;
  const matchedEstimatorCount = events.filter((e) => Boolean(e.detectedEstimator)).length;
  const previewSlice = visibleEvents.slice(0, 150);

  const handleFileLoad = async (file: File) => {
    setError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.ics') && !lower.endsWith('.json')) {
      setError('Please select a .ics or .json calendar export file.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = lower.endsWith('.json')
        ? parseGoogleCalendarJson(text)
        : parseIcsCalendar(text);

      if (parsed.length === 0) {
        setError('No calendar events were found in that file.');
        return;
      }
      setFileName(file.name);
      setEvents(
        parsed.map((ev) => ({
          ...ev,
          selected: true,
          assignedEstimator: ev.detectedEstimator || '',
        }))
      );
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message}`);
    }
  };

  const updateEventField = (uid: string, field: keyof EditableImportEvent, value: any) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.uid === uid ? { ...ev, [field]: value } : ev))
    );
  };

  const toggleAllVisible = (checked: boolean) => {
    const visibleUids = new Set(visibleEvents.map((e) => e.uid));
    setEvents((prev) =>
      prev.map((ev) => (visibleUids.has(ev.uid) ? { ...ev, selected: checked } : ev))
    );
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleImport = async () => {
    const toImport = visibleEvents.filter((e) => e.selected);
    if (toImport.length === 0) return;

    setIsImporting(true);
    setError(null);

    const chunkSize = 250;
    let totalCreated = 0;
    let totalEnriched = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < toImport.length; i += chunkSize) {
        const chunk = toImport.slice(i, i + chunkSize);
        const processed = Math.min(i + chunk.length, toImport.length);
        setImportProgress(`Importing ${processed.toLocaleString()} / ${toImport.length.toLocaleString()} bids...`);

        const res = await fetch('/api/bid-requests/import-calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enrichExisting,
            events: chunk.map((e) => ({
              uid: e.uid,
              projectName: e.projectName,
              clientCompany: e.clientCompany,
              location: e.location,
              description: e.description,
              dueDate: e.dueDate,
              dueTime: e.dueTime,
              assignedEstimator: e.assignedEstimator || null,
            })),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || `Import failed at item ${i + 1}`);
          return;
        }

        totalCreated += data.createdCount || 0;
        totalEnriched += data.enrichedCount || 0;
        totalSkipped += data.skippedCount || 0;
      }

      onImportComplete({
        createdCount: totalCreated,
        enrichedCount: totalEnriched,
        skippedCount: totalSkipped,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Network error during import');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-base font-bold">Import Google Calendar (.ics or .json with colors)</h3>
              <p className="text-[11px] text-slate-300">
                Bring in historical & upcoming bids from Google Calendar
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Upload Zone */}
          {events.length === 0 ? (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFileLoad(e.dataTransfer.files[0]);
                }}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-2xl p-10 text-center cursor-pointer transition-all space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ics,.json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileLoad(e.target.files[0]);
                  }}
                />
                <Upload className="w-10 h-10 text-blue-500 mx-auto" />
                <div className="text-sm font-bold text-slate-800">
                  Drop your `.ics` or `.json` calendar file here, or click to browse
                </div>
                <p className="text-xs text-slate-500 max-w-lg mx-auto">
                  Supports standard Google Calendar `.ics` exports and `.json` exports with full event `colorId` tags.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-950 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <Palette className="w-4 h-4 text-amber-600" />
                    <span>Want to preserve Google Calendar Event Colors?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowColorScriptHelp((v) => !v)}
                    className="px-2.5 py-1 rounded-lg bg-amber-200/70 hover:bg-amber-200 text-amber-950 font-bold text-[11px]"
                  >
                    {showColorScriptHelp ? 'Hide Instructions' : '1-Min Color Export Guide'}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800">
                  Google Calendar&apos;s built-in <strong>.ics</strong> export strips event colors (`colorId`) from all events.
                  To export all 5,800+ events <strong>with</strong> their estimator colors intact, use our 1-minute Google Apps Script `.json` export.
                </p>

                {showColorScriptHelp && (
                  <div className="pt-2 border-t border-amber-200 space-y-2">
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-900">
                      <li>Go to <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">script.google.com</a> → <strong>New Project</strong>, and paste the <strong>Read-Only</strong> script below (replace <code>&apos;primary&apos;</code> with your Bid Calendar ID).</li>
                      <li>For strict <strong>read-only</strong> permissions (no edit/delete): click <strong>Project Settings (⚙️)</strong> → check <strong>Show &quot;appsscript.json&quot; manifest file in editor</strong>, then add <code>&quot;oauthScopes&quot;: [&quot;https://www.googleapis.com/auth/calendar.readonly&quot;, &quot;https://www.googleapis.com/auth/script.external_request&quot;]</code> to <code>appsscript.json</code>.</li>
                      <li>Click <strong>Deploy → New deployment → Web app</strong> (Execute as: <strong>Me</strong>, Who has access: <strong>Only myself</strong>), open the Web app URL, and it will download <code>bid_calendar_with_colors.json</code> directly to your PC!</li>
                    </ol>
                    <div className="relative">
                      <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[10px] overflow-x-auto font-mono">
                        {APPS_SCRIPT_SNIPPET}
                      </pre>
                      <button
                        type="button"
                        onClick={handleCopyScript}
                        className="absolute top-2 right-2 px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedScript ? 'Copied!' : 'Copy Script'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Color Detection Diagnostic Banner */}
              <div
                className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  colorTaggedCount === 0
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <Palette className="w-4 h-4" />
                    <span>
                      Loaded {events.length.toLocaleString()} events • {colorTaggedCount.toLocaleString()} had color tags • {matchedEstimatorCount.toLocaleString()} auto-assigned to Estimators
                    </span>
                  </div>
                  {colorTaggedCount === 0 && (
                    <p className="text-[11px] text-amber-800">
                      This <code>.ics</code> file contains <strong>0 event color tags</strong> (Google Calendar omits colors when exporting <code>.ics</code>). Only events with an estimator&apos;s name in the title/description were auto-assigned. Use the <strong>.json</strong> export script to include colors.
                    </p>
                  )}
                </div>

                {colorTaggedCount === 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEvents([]);
                      setFileName(null);
                      setShowColorScriptHelp(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] flex-shrink-0"
                  >
                    Switch to .json Color Export
                  </button>
                )}
              </div>

              {/* Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <FileText className="w-4 h-4 text-blue-600" />
                    {fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEvents([]);
                      setFileName(null);
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Choose another file
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-600">Date Range:</span>
                  {[
                    { key: '6m', label: 'Last 6 Mo + Future' },
                    { key: '12m', label: 'Last 12 Mo + Future' },
                    { key: 'all', label: 'All History' },
                    { key: 'custom', label: 'Custom' },
                  ].map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setDateRangePreset(p.key as any)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                        dateRangePreset === p.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {dateRangePreset === 'custom' && (
                <div className="flex items-center gap-3 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <label className="font-semibold text-slate-600">
                    From:{' '}
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="ml-1 px-2 py-1 rounded border border-slate-300 bg-white"
                    />
                  </label>
                  <label className="font-semibold text-slate-600">
                    To:{' '}
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="ml-1 px-2 py-1 rounded border border-slate-300 bg-white"
                    />
                  </label>
                </div>
              )}

              {/* Deduplication option */}
              <div className="flex items-center justify-between gap-2 text-xs px-1 flex-wrap">
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrichExisting}
                    onChange={(e) => setEnrichExisting(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    Smart Match: Update matching email ITBs already in CRM instead of creating duplicates
                  </span>
                </label>

                <span className="text-slate-500 font-semibold">
                  {visibleEvents.length.toLocaleString()} events in range ({selectedVisibleCount.toLocaleString()} selected)
                </span>
              </div>

              {/* Preview Table (capped at 150 rows for fast UI) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {visibleEvents.length > 150 && (
                  <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 text-[11px] font-semibold text-blue-900">
                    Showing the first 150 of {visibleEvents.length.toLocaleString()} events in preview for performance — all {selectedVisibleCount.toLocaleString()} selected events will be imported.
                  </div>
                )}
                <div className="max-h-[340px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-8">
                          <input
                            type="checkbox"
                            checked={visibleEvents.length > 0 && selectedVisibleCount === visibleEvents.length}
                            onChange={(e) => toggleAllVisible(e.target.checked)}
                          />
                        </th>
                        <th className="p-2.5 font-bold">Project Name</th>
                        <th className="p-2.5 font-bold">Contractor / GC</th>
                        <th className="p-2.5 font-bold w-32">Due Date</th>
                        <th className="p-2.5 font-bold w-24">Time</th>
                        <th className="p-2.5 font-bold w-44">Estimator</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewSlice.map((ev) => (
                        <tr key={ev.uid} className={ev.selected ? 'bg-white' : 'bg-slate-50 opacity-50'}>
                          <td className="p-2">
                            <input
                              type="checkbox"
                              checked={ev.selected}
                              onChange={(e) => updateEventField(ev.uid, 'selected', e.target.checked)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={ev.projectName}
                              onChange={(e) => updateEventField(ev.uid, 'projectName', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-900 font-semibold"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={ev.clientCompany || ''}
                              onChange={(e) => updateEventField(ev.uid, 'clientCompany', e.target.value)}
                              placeholder="Optional GC"
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-700"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="date"
                              value={ev.dueDate}
                              onChange={(e) => updateEventField(ev.uid, 'dueDate', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-700 font-mono"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={ev.dueTime || ''}
                              onChange={(e) => updateEventField(ev.uid, 'dueTime', e.target.value)}
                              placeholder="2:00 PM"
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-700"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={ev.assignedEstimator}
                              onChange={(e) => updateEventField(ev.uid, 'assignedEstimator', e.target.value)}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-slate-800 font-semibold bg-white"
                            >
                              <option value="">Unassigned</option>
                              {estimators.map((est) => (
                                <option key={est} value={est}>
                                  {est}
                                </option>
                              ))}
                              <option value="Not Bidding">Not Bidding (Grey)</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>{importProgress || 'Re-importing safely skips already-imported events.'}</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isImporting || selectedVisibleCount === 0}
              onClick={handleImport}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{importProgress || 'Importing...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Import {selectedVisibleCount.toLocaleString()} Bid{selectedVisibleCount === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
