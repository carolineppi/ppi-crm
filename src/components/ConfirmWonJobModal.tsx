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

const CONTRACT_STATUS_OPTIONS = [
  'Contract Received',
  'PO Received',
  'Docusign',
  'Signed Quote',
  'Notice to Proceed',
  'Verbal',
  'Paid in Full',
  'Deposit Received',
] as const;

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
  const [pocFirstName, setPocFirstName] = useState('');
  const [pocLastName, setPocLastName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [contractStatus, setContractStatus] = useState('');
  const [contractDocs, setContractDocs] = useState<
    Array<{ filename: string; url: string; uploadedAt?: string }>
  >([]);
  const [selectedContractIdx, setSelectedContractIdx] = useState<number>(-1);
  const [isUploadingContract, setIsUploadingContract] = useState(false);
  const [addressStreet, setAddressStreet] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressState, setAddressState] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [estimatorName, setEstimatorName] = useState('');
  const [confirmedBy, setConfirmedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [quoteCarts, setQuoteCarts] = useState<any[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [quoteAmount, setQuoteAmount] = useState<number | null>(null);
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

  const applyQuoteCartToJob = (cart: any) => {
    if (!cart) return;
    const mult = 1 + (Number(cart.markup_percent ?? 0) || 0) / 100;
    const itemsArr = Array.isArray(cart.items) ? cart.items : [];
    const mapped = itemsArr.map((it: any, idx: number) => ({
      id: it.priceItemId || `cart-${idx + 1}`,
      lineNumber: idx + 1,
      manufacturer: it.manufacturer || '',
      sku: it.sku || '',
      description: it.description || '',
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit: 'EA',
      unitPrice: Math.round((Number(it.unitCost) || 0) * mult * 100) / 100,
    }));
    const total = mapped.reduce(
      (s: number, it: any) => s + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1),
      0
    );
    setLineItems(mapped);
    setQuoteAmount(Math.round(total * 100) / 100);
    setUploadedPdfName(`${cart.title || 'Quote'}.pdf`);
    setScopeOfWork(
      `${cart.title || 'Quote'} (${mapped.length} line item${mapped.length === 1 ? '' : 's'} — $${total.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })})`
    );
  };

  const handleUploadContract = async (file: File) => {
    if (!bid) return;
    setIsUploadingContract(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'contracts');
      const res = await fetch(`/api/bid-requests/${bid.id}/documents`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to upload contract document.');
        return;
      }
      const doc = data.document;
      if (doc) {
        setContractDocs((prev) => {
          const next = [
            ...prev,
            {
              filename: doc.filename,
              url: doc.storageUrl,
              uploadedAt: doc.uploadedAt,
            },
          ];
          setSelectedContractIdx(next.length - 1);
          return next;
        });
      }
    } catch (err: any) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload contract.');
    } finally {
      setIsUploadingContract(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !bid) return;
    setErrorMsg(null);
    setJobNumber(bid.bidNumber || `JOB-${bid.id.slice(0, 6).toUpperCase()}`);
    setProjectName(bid.projectName || '');
    setClientCompany(bid.clientCompany || '');

    const rawName = (bid.clientName || '').trim();
    if (rawName) {
      const parts = rawName.split(/\s+/);
      setPocFirstName(parts[0] || '');
      setPocLastName(parts.slice(1).join(' ') || '');
    } else {
      setPocFirstName('');
      setPocLastName('');
    }

    setClientPhone(bid.clientPhone || '');
    setClientEmail(bid.clientEmail || '');
    setContractStatus('');
    setContractDocs([]);
    setSelectedContractIdx(-1);
    setAddressStreet(bid.addressStreet || '');
    setAddressCity(bid.addressCity || '');
    setAddressState(bid.addressState || '');
    setAddressZip(bid.addressZip || '');
    setScopeOfWork(bid.scopeOfWork || '');
    setEstimatorName(bid.estimatorName || ESTIMATORS[0] || '');
    setConfirmedBy(bid.estimatorName || ESTIMATORS[0] || '');
    setNotes(bid.notes || '');
    setQuoteCarts([]);
    setSelectedQuoteId('');
    setQuoteAmount(null);
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

        // Find any already-uploaded contract documents on this bid
        const existingContracts = allAtts
          .filter(
            (a: any) =>
              a?.category === 'contracts' ||
              /contract|agreement|subcontract|signed.*quote|notice.*proceed/i.test(
                a?.filename || ''
              )
          )
          .map((a: any) => ({
            filename: a.filename,
            url: a.storageUrl || a.previewUrl,
          }));
        setContractDocs(existingContracts);
        setSelectedContractIdx(existingContracts.length > 0 ? 0 : -1);

        // Load linked quote carts (each printed PDF quote has its exact cart line items attached)
        const carts = Array.isArray(d.quoteCarts) ? d.quoteCarts : [];
        setQuoteCarts(carts);
        const preferredCart = carts.find((c: any) => c.status === 'quoted') || carts[0] || null;
        if (preferredCart) {
          setSelectedQuoteId(preferredCart.id);
          applyQuoteCartToJob(preferredCart);
        } else {
          // Pick best default attached PDF if no quote cart exists
          const preferredIdx = pdfs.findIndex((p: any) =>
            /scope|contract|quote|schedule|subcontract/i.test(p.filename || '')
          );
          const defaultIdx = preferredIdx !== -1 ? preferredIdx : pdfs.length > 0 ? 0 : -1;
          if (defaultIdx !== -1) {
            setSelectedPdfIdx(String(defaultIdx));
          }
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

  const selectedContract =
    selectedContractIdx >= 0 && contractDocs[selectedContractIdx]
      ? contractDocs[selectedContractIdx]
      : null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmedBy.trim()) {
      setErrorMsg('Please select or enter the estimator confirming this win.');
      return;
    }
    if (!projectName.trim()) {
      setErrorMsg('Job Name is required.');
      return;
    }
    if (!clientCompany.trim()) {
      setErrorMsg('Customer / GC is required.');
      return;
    }
    if (!selectedContract) {
      setErrorMsg('A Contract document is required. Please upload or select a contract.');
      return;
    }
    if (!contractStatus) {
      setErrorMsg('Contract Status is required.');
      return;
    }
    if (!addressStreet.trim() && !(addressCity.trim() && addressState.trim())) {
      setErrorMsg('Please verify the Job Location (street address or city & state).');
      return;
    }
    if (!pocFirstName.trim() || !pocLastName.trim()) {
      setErrorMsg('Point of Contact First and Last Name are required.');
      return;
    }
    if (!clientEmail.trim() || !clientPhone.trim()) {
      setErrorMsg('Point of Contact Email and Phone are required.');
      return;
    }

    const combinedPocName = `${pocFirstName.trim()} ${pocLastName.trim()}`.trim();

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
            projectName: projectName.trim(),
            clientCompany: clientCompany.trim(),
            clientName: combinedPocName,
            pocFirstName: pocFirstName.trim(),
            pocLastName: pocLastName.trim(),
            clientPhone: clientPhone.trim(),
            clientEmail: clientEmail.trim(),
            addressStreet: addressStreet.trim() || undefined,
            addressCity: addressCity.trim() || undefined,
            addressState: addressState.trim() || undefined,
            addressZip: addressZip.trim() || undefined,
            contractFilename: selectedContract.filename,
            contractUrl: selectedContract.url,
            contractStatus,
            scopeOfWork: scopeOfWork.trim() || undefined,
            estimatorName: estimatorName.trim() || undefined,
            notes: notes.trim() || undefined,
            wonConfirmedBy: confirmedBy.trim(),
            quoteAmount: quoteAmount !== null ? quoteAmount : undefined,
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
                Job Name * (Typed by Estimator)
              </label>
              <input
                type="text"
                required
                placeholder="Enter official job name..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
              />
            </div>
          </div>

          {/* Customer & Point of Contact */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>Customer &amp; Job Point of Contact *</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Customer / GC * (Auto-pulled — verify)
                </label>
                <input
                  type="text"
                  required
                  value={clientCompany}
                  onChange={(e) => setClientCompany(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  POC First Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="First name"
                  value={pocFirstName}
                  onChange={(e) => setPocFirstName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  POC Last Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Last name"
                  value={pocLastName}
                  onChange={(e) => setPocLastName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  POC Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  POC Phone *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(555) 123-4567"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
            </div>
          </div>

          {/* Contract & Contract Status */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contract &amp; Contract Status *</span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-emerald-400 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-bold text-emerald-800 cursor-pointer">
                <Upload className="w-3 h-3" />
                <span>{isUploadingContract ? 'Uploading...' : 'Upload Contract'}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf"
                  disabled={isUploadingContract}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUploadContract(file);
                  }}
                />
              </label>
            </div>

            {contractDocs.length === 0 ? (
              <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold">
                No contract has been uploaded to this bid yet. Please upload the signed contract,
                PO, or notice to proceed above before creating the job.
              </div>
            ) : (
              <div className="space-y-1.5">
                {contractDocs.map((doc, idx) => (
                  <label
                    key={`${doc.filename}-${idx}`}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border cursor-pointer ${
                      selectedContractIdx === idx
                        ? 'border-emerald-400 bg-emerald-50/70'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="radio"
                        name="contractDoc"
                        checked={selectedContractIdx === idx}
                        onChange={() => setSelectedContractIdx(idx)}
                      />
                      <span className="font-semibold text-slate-800 truncate">
                        {doc.filename}
                      </span>
                    </div>
                    {doc.url && (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-bold text-blue-700 hover:underline shrink-0"
                      >
                        View
                      </a>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Contract Status *
              </label>
              <select
                required
                value={contractStatus}
                onChange={(e) => setContractStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                <option value="">-- Select Contract Status --</option>
                {CONTRACT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Address Details */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span>Job Location * (Auto-pulled — verify)</span>
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

          {/* Job Scope (Select Line-Item Set) */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                <span>Scope — Select Line-Item Set for Job ({lineItems.length} items)</span>
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer">
                <Upload className="w-3 h-3 text-slate-500" />
                <span>{uploadedPdfName && !selectedQuoteId ? `Uploaded: ${uploadedPdfName}` : 'Upload Scope PDF'}</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={isParsingScope}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) {
                      setSelectedQuoteId('');
                      handleUploadScopePdf(file);
                    }
                  }}
                />
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={
                  selectedQuoteId
                    ? `quote:${selectedQuoteId}`
                    : selectedPdfIdx !== ''
                    ? `pdf:${selectedPdfIdx}`
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('quote:')) {
                    const id = val.slice(6);
                    setSelectedQuoteId(id);
                    setSelectedPdfIdx('');
                    const found = quoteCarts.find((c) => c.id === id);
                    if (found) applyQuoteCartToJob(found);
                  } else if (val.startsWith('pdf:')) {
                    const idx = val.slice(4);
                    setSelectedQuoteId('');
                    setSelectedPdfIdx(idx);
                    setUploadedPdfName(null);
                    setQuoteAmount(null);
                  } else {
                    setSelectedQuoteId('');
                    setSelectedPdfIdx('');
                    setUploadedPdfName(null);
                  }
                }}
                className="flex-1 px-2.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50/50 font-semibold text-slate-900"
              >
                {quoteCarts.length > 0 && (
                  <optgroup label="Printed Quote PDFs (Line Items Attached)">
                    {quoteCarts.map((c) => {
                      const itemsArr = Array.isArray(c.items) ? c.items : [];
                      const mult = 1 + (Number(c.markup_percent ?? 0) || 0) / 100;
                      const tot = itemsArr.reduce(
                        (s: number, it: any) =>
                          s + (Number(it.unitCost) || 0) * mult * (Number(it.quantity) || 0),
                        0
                      );
                      const dateLabel = c.quoted_at
                        ? new Date(c.quoted_at).toLocaleString([], {
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : 'Draft';
                      const previewSkus = itemsArr
                        .slice(0, 2)
                        .map((it: any) => [it.manufacturer, it.sku].filter(Boolean).join(' ') || it.description)
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <option key={c.id} value={`quote:${c.id}`}>
                          📄 {c.title}.pdf — {itemsArr.length} item(s)
                          {previewSkus ? ` [${previewSkus}${itemsArr.length > 2 ? ', ...' : ''}]` : ''} • $
                          {tot.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          ({c.status === 'quoted' ? `Printed ${dateLabel}` : 'Draft'})
                        </option>
                      );
                    })}
                  </optgroup>
                )}
                {pdfAttachments.length > 0 && (
                  <optgroup label="Attached Bid PDFs">
                    {pdfAttachments.map((att, idx) => (
                      <option key={`${att.fromBidId}-${att.filename}-${idx}`} value={`pdf:${idx}`}>
                        📎 {att.filename}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value="custom">✏️ Custom / Manual Line Items</option>
              </select>

              {selectedPdfIdx !== '' && (
                <button
                  type="button"
                  disabled={isParsingScope}
                  onClick={() => {
                    const att = pdfAttachments[Number(selectedPdfIdx)];
                    if (att) parseAttachedPdf(att);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{isParsingScope ? 'Extracting...' : 'Extract Line Items'}</span>
                </button>
              )}
            </div>

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

          {/* Handoff Notes */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Job Handoff Notes</span>
            </div>
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
