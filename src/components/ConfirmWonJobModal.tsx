'use client';

import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, X, Briefcase, MapPin, Building2, UserCheck } from 'lucide-react';

const ESTIMATORS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
  'Jennifer MacPherson',
];

export interface WonBidSeed {
  id: string;
  bidNumber?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  clientCompany?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  scopeOfWork?: string | null;
  estimatorName?: string | null;
  notes?: string | null;
}

interface ConfirmWonJobModalProps {
  isOpen: boolean;
  bid: WonBidSeed | null;
  onClose: () => void;
  onConfirmed: (job: any) => void;
}

export default function ConfirmWonJobModal({
  isOpen,
  bid,
  onClose,
  onConfirmed,
}: ConfirmWonJobModalProps) {
  const [jobNumber, setJobNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [estimatorName, setEstimatorName] = useState('');
  const [confirmedBy, setConfirmedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !bid) return;
    setErrorMsg(null);
    setJobNumber(bid.bidNumber || `JOB-${bid.id.slice(0, 6).toUpperCase()}`);
    setProjectName(bid.projectName || '');
    setClientCompany(bid.clientCompany || '');
    setClientName(bid.clientName || '');
    setClientPhone(bid.clientPhone || '');
    setClientEmail(bid.clientEmail || '');
    setAddressStreet(bid.addressStreet || '');
    setAddressCity(bid.addressCity || '');
    setAddressState(bid.addressState || '');
    setAddressZip(bid.addressZip || '');
    setScopeOfWork(bid.scopeOfWork || '');
    setEstimatorName(bid.estimatorName || ESTIMATORS[0] || '');
    setConfirmedBy(bid.estimatorName || ESTIMATORS[0] || '');
    setNotes(bid.notes || '');
  }, [isOpen, bid]);

  if (!isOpen || !bid) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedBy.trim()) {
      setErrorMsg('Please select or enter the estimator confirming this win.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/bid-requests/${bid.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimatorStatus: 'won',
          wonConfirmedBy: confirmedBy.trim(),
          jobOverrides: {
            jobNumber: jobNumber.trim() || undefined,
            projectName: projectName.trim() || 'Untitled Job',
            clientCompany: clientCompany.trim() || undefined,
            clientName: clientName.trim() || undefined,
            clientPhone: clientPhone.trim() || undefined,
            clientEmail: clientEmail.trim() || undefined,
            addressStreet: addressStreet.trim() || undefined,
            addressCity: addressCity.trim() || undefined,
            addressState: addressState.trim() || undefined,
            addressZip: addressZip.trim() || undefined,
            scopeOfWork: scopeOfWork.trim() || undefined,
            estimatorName: estimatorName.trim() || undefined,
            notes: notes.trim() || undefined,
            wonConfirmedBy: confirmedBy.trim(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to confirm won bid and create job.');
        return;
      }
      onConfirmed(data.job);
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error confirming won bid.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 to-teal-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Award className="w-5 h-5 text-emerald-200" />
            <div>
              <h2 className="text-base font-extrabold">Confirm Won Bid &amp; Create Job</h2>
              <p className="text-xs text-emerald-100">
                Estimator confirmation required before converting this bid into an active job.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/15 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Estimator Confirmation Box */}
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <UserCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Confirmed Won By (Estimator):</span>
            </div>
            <select
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-white font-bold text-slate-900"
            >
              <option value="">-- Select Estimator --</option>
              {ESTIMATORS.map((est) => (
                <option key={est} value={est}>
                  {est}
                </option>
              ))}
              {confirmedBy && !ESTIMATORS.includes(confirmedBy) && (
                <option value={confirmedBy}>{confirmedBy}</option>
              )}
            </select>
          </div>

          {/* Core Job Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Job Number
              </label>
              <input
                type="text"
                value={jobNumber}
                onChange={(e) => setJobNumber(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Project / Job Name
              </label>
              <input
                type="text"
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
              />
            </div>
          </div>

          {/* Contractor Details */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Contractor &amp; Contact (Auto-filled from Bid)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Contractor / GC
                </label>
                <input
                  type="text"
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Address Details */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Job Site Address (Auto-filled from Bid)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
              <div className="sm:col-span-6">
                <input
                  type="text"
                  placeholder="Street Address"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="sm:col-span-3">
                <input
                  type="text"
                  placeholder="City"
                  value={addressCity}
                  onChange={(e) => setAddressCity(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="sm:col-span-1">
                <input
                  type="text"
                  placeholder="State"
                  value={addressState}
                  onChange={(e) => setAddressState(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="ZIP"
                  value={addressZip}
                  onChange={(e) => setAddressZip(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Scope & Notes */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <Briefcase className="w-3.5 h-3.5 text-slate-400" />
              <span>Scope &amp; Notes</span>
            </div>
            <textarea
              rows={2}
              placeholder="Scope of work..."
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
            />
            <textarea
              rows={2}
              placeholder="Job handoff notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating Job...' : 'Confirm Won & Create Job'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
