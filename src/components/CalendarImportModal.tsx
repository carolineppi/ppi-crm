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
} from 'lucide-react';
import { parseIcsCalendar, ParsedCalendarEvent } from '@/lib/calendar/ics-parser';

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

export default function CalendarImportModal({
  isOpen,
  estimators,
  onClose,
  onImportComplete,
}: CalendarImportModalProps) {
  const [events, setEvents] = useState<EditableImportEvent[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dateRangePreset, setDateRangePreset] = useState<'6m' | '12m' | 'all' | 'custom'>('12m');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [enrichExisting, setEnrichExisting] = useState<boolean>(true);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileLoad = async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith('.ics')) {
      setError('Please select a valid .ics calendar file exported from Google Calendar.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseIcsCalendar(text);
      if (parsed.length === 0) {
        setError('No calendar events were found in that .ics file.');
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
      setError(`Failed to parse .ics file: ${err.message}`);
    }
  };

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

  const handleImport = async () => {
    const toImport = visibleEvents.filter((e) => e.selected);
    if (toImport.length === 0) return;

    setIsImporting(true);
    setError(null);
    try {
      const res = await fetch('/api/bid-requests/import-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrichExisting,
          events: toImport.map((e) => ({
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
        setError(data.error || 'Import failed');
        return;
      }

      onImportComplete({
        createdCount: data.createdCount || 0,
        enrichedCount: data.enrichedCount || 0,
        skippedCount: data.skippedCount || 0,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Network error during import');
    } finally {
      setIsImporting(false);
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
              <h3 className="text-base font-bold">Import Google Calendar (.ics)</h3>
              <p className="text-[11px] text-slate-300">
                Bring in historical & upcoming bids from Google Calendar (Settings → Import & Export → Export)
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
                accept=".ics"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileLoad(e.target.files[0]);
                }}
              />
              <Upload className="w-10 h-10 text-blue-500 mx-auto" />
              <div className="text-sm font-bold text-slate-800">
                Drop your Google Calendar `.ics` export file here, or click to browse
              </div>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Automatically extracts bid dates, times, project names, contractors, and maps estimator names/colors before importing.
              </p>
            </div>
          ) : (
            <>
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
              <div className="flex items-center justify-between gap-2 text-xs px-1">
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
                  Showing {visibleEvents.length} events ({selectedVisibleCount} selected)
                </span>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[360px] overflow-y-auto">
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
                      {visibleEvents.map((ev) => (
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
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            Re-importing the same `.ics` file safely skips already-imported events.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
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
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Import {selectedVisibleCount} Bid{selectedVisibleCount === 1 ? '' : 's'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
