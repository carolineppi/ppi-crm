'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';

interface ChangeOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  co: any;
}

function fmt(n: number | null | undefined) {
  return `$${(Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ChangeOrderPrintModal({
  isOpen,
  onClose,
  job,
  co,
}: ChangeOrderPrintModalProps) {
  if (!isOpen || !job || !co) return null;

  const baseContract = Number(job.quote_amount) || 0;
  const coAmt = Math.abs(Number(co.amount) || 0);
  const isDeduction = co.type === 'deduction';
  const signedCo = isDeduction ? -coAmt : coAmt;

  const address = [
    job.address_street,
    [job.address_city, job.address_state].filter(Boolean).join(', '),
    job.address_zip,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-co-sheet,
          #printable-co-sheet * {
            visibility: visible;
          }
          #printable-co-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 print:my-0 print:shadow-none print:border-0">
        {/* Non-print Action Bar */}
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="text-xs font-bold">
            Change Order — {co.co_number} ({co.title})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/15"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document */}
        <div id="printable-co-sheet" className="p-8 bg-white text-slate-900 space-y-6 text-xs">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
            <div>
              <div className="text-xl font-black tracking-tight text-slate-900">
                PARTITION PLUS, INC.
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Commercial Toilet Partitions, Accessories &amp; Specialties
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-black uppercase tracking-wider text-purple-800">
                Change Order
              </div>
              <div className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                {co.co_number}
              </div>
              <div className="text-[11px] text-slate-500 uppercase font-bold mt-0.5">
                Status: {co.status}
              </div>
            </div>
          </div>

          {/* Customer & Project Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500">To (Customer / GC)</div>
              <div className="text-sm font-black text-slate-900">
                {job.client_company || job.client_name || 'Customer'}
              </div>
              {job.client_name && <div className="text-slate-700">Attn: {job.client_name}</div>}
              {job.client_phone && <div className="text-slate-600">Phone: {job.client_phone}</div>}
              {job.client_email && <div className="text-slate-600">Email: {job.client_email}</div>}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500">Project Information</div>
              <div className="text-sm font-black text-slate-900">
                {job.job_number ? `${job.job_number} — ` : ''}
                {job.project_name}
              </div>
              {address && <div className="text-slate-600">Site: {address}</div>}
              <div className="pt-1 text-[11px] text-slate-700">
                Date:{' '}
                <strong>
                  {co.created_at
                    ? new Date(co.created_at).toLocaleDateString()
                    : new Date().toLocaleDateString()}
                </strong>
                {' • '}PM: <strong>{job.project_manager || '—'}</strong>
              </div>
            </div>
          </div>

          {/* Scope / Description */}
          <div className="rounded-xl border border-slate-300 p-4 space-y-2">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Change Order Description ({isDeduction ? 'Deductive Credit' : 'Addition / Extra Work'})
            </div>
            <div className="text-sm font-black text-slate-900">{co.title}</div>
            {co.reason && (
              <div className="text-slate-700 whitespace-pre-wrap pt-1 border-t border-slate-200">
                {co.reason}
              </div>
            )}
          </div>

          {/* Financial Summary */}
          <div className="rounded-xl border border-slate-300 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-2.5 px-4 font-semibold text-slate-600">
                    Original Base Contract Amount
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold">
                    {fmt(baseContract)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-4 font-bold text-slate-900">
                    {isDeduction
                      ? `This Change Order Deduction (${co.co_number})`
                      : `This Change Order Addition (${co.co_number})`}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono font-black text-base ${
                      isDeduction ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {signedCo >= 0 ? '+' : '-'}
                    {fmt(coAmt)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Acceptance Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-[11px] text-slate-600">
            <div className="space-y-4">
              <div>
                <div className="border-b border-slate-400 h-7 mb-1" />
                <div>
                  Partition Plus, Inc. ({job.project_manager || 'Project Manager'})
                </div>
              </div>
              <div>
                <div className="border-b border-slate-400 h-7 mb-1" />
                <div>Date</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="border-b border-slate-400 h-7 mb-1" />
                <div>
                  Accepted By ({job.client_company || 'Customer / GC'})
                </div>
              </div>
              <div>
                <div className="border-b border-slate-400 h-7 mb-1" />
                <div>Date</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
