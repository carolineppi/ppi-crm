'use client';

import React, { useMemo, useState } from 'react';
import { X, PlusCircle, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { AssignmentRule, matchAssignmentRules } from '@/lib/assignment-rules';
import AssignmentRuleOverlay from './AssignmentRuleOverlay';

interface CalendarAddBidModalProps {
  isOpen: boolean;
  estimators: string[];
  defaultDueDate?: string;
  assignmentRules?: AssignmentRule[];
  existingBids?: Array<{
    id: string;
    projectName?: string | null;
    clientCompany?: string | null;
    subject?: string;
    bidDueDate?: string | null;
    normalizedAiDueDate?: string | null;
    assignedEstimator?: string | null;
  }>;
  onClose: () => void;
  onCreated: (bidNumber: string | null) => void;
}

export default function CalendarAddBidModal({
  isOpen,
  estimators,
  defaultDueDate,
  assignmentRules = [],
  existingBids = [],
  onClose,
  onCreated,
}: CalendarAddBidModalProps) {
  const [projectName, setProjectName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [bidDueDate, setBidDueDate] = useState(defaultDueDate || '');
  const [bidDueTime, setBidDueTime] = useState('2:00 PM');
  const [assignedEstimator, setAssignedEstimator] = useState('');
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchingRules = useMemo(
    () =>
      matchAssignmentRules(assignmentRules, {
        estimatorName: assignedEstimator,
        contractorName: clientCompany,
        projectName,
      }),
    [assignmentRules, assignedEstimator, clientCompany, projectName]
  );

  const potentialDuplicates = useMemo(() => {
    const proj = projectName.trim().toLowerCase();
    const client = clientCompany.trim().toLowerCase();
    if (!bidDueDate || (!proj && !client) || (proj.length < 4 && client.length < 4)) return [];
    return existingBids.filter((b) => {
      const bDate = b.bidDueDate || b.normalizedAiDueDate;
      if (bDate !== bidDueDate) return false;
      const bProj = (b.projectName || b.subject || '').toLowerCase();
      const bClient = (b.clientCompany || '').toLowerCase();
      const projMatch = proj.length >= 4 && bProj.includes(proj);
      const clientMatch = client.length >= 4 && bClient.includes(client);
      return projMatch || (clientMatch && (!proj || bProj.includes(proj)));
    });
  }, [existingBids, bidDueDate, projectName, clientCompany]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('Project Name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/bid-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: projectName.trim(),
          clientCompany: clientCompany.trim() || null,
          projectAddressCity: city.trim() || null,
          projectAddressState: stateCode.trim() || null,
          bidDueDate: bidDueDate || null,
          bidDueTime: bidDueTime.trim() || null,
          assignedEstimator: assignedEstimator || null,
          googleDriveFolderUrl: googleDriveFolderUrl.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create bid');
        return;
      }

      // Reset form
      setProjectName('');
      setClientCompany('');
      setCity('');
      setStateCode('');
      setBidDueDate('');
      setBidDueTime('2:00 PM');
      setAssignedEstimator('');
      setGoogleDriveFolderUrl('');
      setNotes('');

      onCreated(data.bidRequest?.bid_number || null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold">Add Bid Manually to Calendar</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Project Name *</label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Lincoln Elementary School Additions"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Contractor / GC</label>
            <input
              type="text"
              value={clientCompany}
              onChange={(e) => setClientCompany(e.target.value)}
              placeholder="e.g. Nabholz Construction"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">State</label>
              <input
                type="text"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                placeholder="AR / OK / TX"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Due Date</label>
              <input
                type="date"
                value={bidDueDate}
                onChange={(e) => setBidDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Bid Time</label>
              <input
                type="text"
                value={bidDueTime}
                onChange={(e) => setBidDueTime(e.target.value)}
                placeholder="2:00 PM"
                className="w-full px-3 py-2 rounded-xl border border-slate-300"
              />
            </div>
          </div>

          {potentialDuplicates.length > 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-700" />
              <div>
                <p className="font-bold">Possible Duplicate Job on {bidDueDate}:</p>
                {potentialDuplicates.slice(0, 2).map((d) => (
                  <p key={d.id} className="text-[11px]">
                    • {d.projectName || d.subject}
                    {d.clientCompany ? ` (${d.clientCompany})` : ''}
                    {d.assignedEstimator ? ` — Assigned to ${d.assignedEstimator}` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          <AssignmentRuleOverlay rules={matchingRules} />

          <div>
            <label className="font-bold text-slate-700 block mb-1">Assign Estimator</label>
            <select
              value={assignedEstimator}
              onChange={(e) => setAssignedEstimator(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
            >
              <option value="">Unassigned (Pending)</option>
              {estimators.map((est) => (
                <option key={est} value={est}>
                  {est}
                </option>
              ))}
              <option value="Not Bidding">Not Bidding (Grey)</option>
            </select>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Google Drive Folder URL (Optional)</label>
            <input
              type="url"
              value={googleDriveFolderUrl}
              onChange={(e) => setGoogleDriveFolderUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Walk-in plans, phone invite, scope notes..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300"
            />
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shadow-xs"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              <span>{isSubmitting ? 'Creating...' : 'Create Bid'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
