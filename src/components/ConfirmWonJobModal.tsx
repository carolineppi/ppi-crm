'use client';

import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  X,
  Briefcase,
  MapPin,
  Building2,
  UserCheck,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';

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
  const [pdfAttachments, setPdfAttachments] = useState<
    Array<{ filename: string; fromBidId: string; previewUrl: string; storageUrl?: string; category?: string }>
  >([]);
  const [selectedPdfIdx, setSelectedPdfIdx] = useState<string>('');
  const [uploadedPdfName, setUploadedPdfName] = useState<string | null>(null);
  const [isParsingScope, setIsParsingScope] = useState(false);
  const [lineItems, setLineItems] = useState<
    Array<{
      id: string;
      lineNumber: number;
      manufacturer?: string;
      sku?: string;
      description: string;
      quantity: number;
      unit?: string;
      unitPrice?: number;
    }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const parseAttachedPdf = async (att: {
    filename: string;
    fromBidId: string;
    previewUrl: string;
    storageUrl?: string;
  }) => {
    setIsParsingScope(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/jobs/parse-scope-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidId: bid?.id,
          fromBidId: att.fromBidId,
          filename: att.filename,
          storageUrl: att.storageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not extract line items from that PDF.');
        return;
      }
      if (Array.isArray(data.items) && data.items.length > 0) {
        setLineItems(data.items);
      }
      if (data.scopeSummary && !scopeOfWork.trim()) {
        setScopeOfWork(data.scopeSummary);
      }
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse scope PDF.');
    } finally {
      setIsParsingScope(false);
    }
  };

  const handleUploadScopePdf = async (file: File) => {
    setIsParsingScope(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/jobs/parse-scope-pdf', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to read uploaded PDF.');
        return;
      }
      setUploadedPdfName(file.name);
      setSelectedPdfIdx('');
      if (Array.isArray(data.items)) {
        setLineItems(data.items);
      }
      if (data.scopeSummary && !scopeOfWork.trim()) {
        setScopeOfWork(data.scopeSummary);
      }
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload scope PDF.');
    } finally {
      setIsParsingScope(false);
    }
  };

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
    setPdfAttachments([]);
    setSelectedPdfIdx('');
    setUploadedPdfName(null);
    setLineItems([]);

    let active = true;
    fetch(`/api/bid-requests/${bid.id}/related`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const allAtts = Array.isArray(d.allAttachments) ? d.allAttachments : [];
        const pdfs = allAtts.filter(
          (a: any) =>
            a?.filename?.toLowerCase().endsWith('.pdf') ||
            a?.contentType === 'application/pdf'
        );
        setPdfAttachments(pdfs);

        // Pick best default scope PDF
        const preferredIdx = pdfs.findIndex((p: any) =>
          /scope|contract|quote|schedule|subcontract/i.test(p.filename || '')
        );
        const defaultIdx = preferredIdx !== -1 ? preferredIdx : pdfs.length > 0 ? 0 : -1;
        if (defaultIdx !== -1) {
          setSelectedPdfIdx(String(defaultIdx));
        }

        // Seed line items from linked quote cart if available
        const firstCart = Array.isArray(d.quoteCarts) ? d.quoteCarts[0] : null;
        if (firstCart && Array.isArray(firstCart.items) && firstCart.items.length > 0) {
          const mult = 1 + (Number(firstCart.markup_percent ?? 0) || 0) / 100;
          setLineItems(
            firstCart.items.map((it: any, idx: number) => ({
              id: it.priceItemId || `cart-${idx + 1}`,
              lineNumber: idx + 1,
              manufacturer: it.manufacturer || '',
              sku: it.sku || '',
              description: it.description || '',
              quantity: Math.max(1, Number(it.quantity) || 1),
              unit: 'EA',
              unitPrice: Math.round((Number(it.unitCost) || 0) * mult * 100) / 100,
            }))
          );
        }
      })
      .catch(() => {
        // ignore network errors loading attachments
      });

    return () => {
      active = false;
    };
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
            scopePdfFilename:
              uploadedPdfName ||
              (selectedPdfIdx !== '' ? pdfAttachments[Number(selectedPdfIdx)]?.filename : null) ||
              undefined,
            scopePdfUrl:
              selectedPdfIdx !== '' ? pdfAttachments[Number(selectedPdfIdx)]?.previewUrl : undefined,
            lineItems: lineItems.map((it, idx) => ({ ...it, lineNumber: idx + 1 })),
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

          {/* Scope PDF Selection & Line Item Extraction */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Scope PDF &amp; Job Line Items ({lineItems.length})</span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3 h-3 text-slate-500" />
                <span>{uploadedPdfName ? `Uploaded: ${uploadedPdfName}` : 'Upload Scope PDF'}</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={isParsingScope}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUploadScopePdf(file);
                  }}
                />
              </label>
            </div>

            {pdfAttachments.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedPdfIdx}
                  onChange={(e) => {
                    setSelectedPdfIdx(e.target.value);
                    setUploadedPdfName(null);
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="">-- Select Attached Scope PDF ({pdfAttachments.length} found) --</option>
                  {pdfAttachments.map((att, idx) => (
                    <option key={`${att.fromBidId}-${att.filename}-${idx}`} value={String(idx)}>
                      {att.filename}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isParsingScope || selectedPdfIdx === ''}
                  onClick={() => {
                    const att = pdfAttachments[Number(selectedPdfIdx)];
                    if (att) parseAttachedPdf(att);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{isParsingScope ? 'Extracting...' : 'Extract Line Items'}</span>
                </button>
              </div>
            )}

            {/* Editable Line Items Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50/60">
              <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-600">
                  Job Line Items ({lineItems.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setLineItems((prev) => [
                      ...prev,
                      {
                        id: `manual-${Date.now()}`,
                        lineNumber: prev.length + 1,
                        manufacturer: '',
                        sku: '',
                        description: '',
                        quantity: 1,
                        unit: 'EA',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Line Item</span>
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div className="p-4 text-center text-[11px] text-slate-500">
                  Select a Scope PDF and click <strong>Extract Line Items</strong> (or add items manually) to break the scope into job line items.
                </div>
              ) : (
                <div className="divide-y divide-slate-200 max-h-48 overflow-y-auto bg-white">
                  {lineItems.map((item, idx) => (
                    <div key={item.id} className="p-2 grid grid-cols-12 gap-1.5 items-center">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = Math.max(1, Number(e.target.value) || 1);
                          setLineItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it))
                          );
                        }}
                        title="Qty"
                        className="col-span-2 px-1.5 py-1 rounded border border-slate-300 text-center font-bold"
                      />
                      <input
                        type="text"
                        placeholder="Mfr / SKU"
                        value={[item.manufacturer, item.sku].filter(Boolean).join(' ')}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLineItems((prev) =>
                            prev.map((it, i) =>
                              i === idx ? { ...it, manufacturer: val, sku: '' } : it
                            )
                          );
                        }}
                        className="col-span-3 px-1.5 py-1 rounded border border-slate-300 font-mono text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Item description"
                        value={item.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLineItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, description: val } : it))
                          );
                        }}
                        className="col-span-6 px-1.5 py-1 rounded border border-slate-300"
                      />
                      <button
                        type="button"
                        onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 flex justify-center text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
