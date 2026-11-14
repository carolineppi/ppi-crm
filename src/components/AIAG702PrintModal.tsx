'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';
import { G703Line, calculateG702AndG703 } from '@/lib/accounting/aia-helpers';

interface AIAG702PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  payApp: any;
}

function fmt(n: number | null | undefined) {
  return `$${(Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AIAG702PrintModal({
  isOpen,
  onClose,
  job,
  payApp,
}: AIAG702PrintModalProps) {
  if (!isOpen || !job || !payApp) return null;

  const lines: G703Line[] = Array.isArray(payApp.g703_lines) ? payApp.g703_lines : [];
  const summary = calculateG702AndG703({
    lines,
    completedRetainagePercent: Number(payApp.completed_retainage_percent ?? 10),
    storedRetainagePercent: Number(payApp.stored_retainage_percent ?? 10),
    lessPreviousCertificates: Number(payApp.less_previous_certificates ?? 0),
    isRetainageRelease: Boolean(payApp.is_retainage_release),
  });

  const balanceToFinishIncRetainage =
    summary.contractSumToDate - summary.totalEarnedLessRetainage;

  const additions = lines
    .filter((l) => l.source === 'change_order' && l.scheduledValue >= 0)
    .reduce((s, l) => s + l.scheduledValue, 0);
  const deductions = lines
    .filter((l) => l.source === 'change_order' && l.scheduledValue < 0)
    .reduce((s, l) => s + Math.abs(l.scheduledValue), 0);

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-aia-sheet,
          #printable-aia-sheet * {
            visibility: visible;
          }
          #printable-aia-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:shadow-none print:border-none">
        <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="text-xs font-bold">
            AIA G702 / G703 — Application #{payApp.application_number} ({job.job_number || job.project_name})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save as PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div id="printable-aia-sheet" className="p-8 overflow-y-auto space-y-8 text-slate-900 bg-white">
          {/* G702 Page */}
          <div className="space-y-4">
            <div className="border-b-2 border-slate-900 pb-2 flex items-end justify-between">
              <div>
                <h1 className="text-lg font-black uppercase tracking-tight">
                  Application and Certificate for Payment (G702)
                </h1>
                <p className="text-xs text-slate-600">
                  Partition Plus, Inc. • P.O. Box 8, Fallston, MD 21047 • 410-879-6200
                </p>
              </div>
              <div className="text-right text-xs">
                <div>
                  <strong>Application No:</strong> {payApp.application_number}
                </div>
                <div>
                  <strong>Period To:</strong> {payApp.period_to || '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border border-slate-300 p-3 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">To (Contractor / Owner)</div>
                <div className="font-bold mt-0.5">{job.client_company || '—'}</div>
                <div>Attn: {job.client_name || 'Accounts Payable'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Project</div>
                <div className="font-bold mt-0.5">{job.project_name || '—'}</div>
                <div>
                  {[job.address_street, job.address_city, job.address_state].filter(Boolean).join(', ')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Job / Contract Info</div>
                <div>
                  <strong>Job #:</strong> {job.job_number || '—'}
                </div>
                <div>
                  <strong>PM:</strong> {job.project_manager || '—'}
                </div>
                <div>
                  <strong>Status:</strong> {payApp.is_retainage_release ? 'Retainage Release' : 'Progress Billing'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* G702 Lines 1-9 */}
              <div className="border border-slate-300 p-4 space-y-2 text-xs">
                <div className="font-black uppercase text-[11px] border-b border-slate-300 pb-1">
                  Contractor&apos;s Application for Payment
                </div>
                <div className="flex justify-between">
                  <span>1. ORIGINAL CONTRACT SUM</span>
                  <span className="font-mono font-bold">{fmt(summary.originalContractSum)}</span>
                </div>
                <div className="flex justify-between">
                  <span>2. NET CHANGE BY CHANGE ORDERS</span>
                  <span className="font-mono font-bold">{fmt(summary.netChangeOrders)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                  <span>3. CONTRACT SUM TO DATE (Line 1 ± 2)</span>
                  <span className="font-mono">{fmt(summary.contractSumToDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>4. TOTAL COMPLETED &amp; STORED TO DATE (G703 Col G)</span>
                  <span className="font-mono font-bold">{fmt(summary.totalCompletedAndStored)}</span>
                </div>
                <div className="pl-3 space-y-1 text-[11px] text-slate-700">
                  <div className="flex justify-between">
                    <span>
                      5a. {payApp.is_retainage_release ? '0' : payApp.completed_retainage_percent}% of Completed Work
                    </span>
                    <span className="font-mono">{fmt(summary.retainageOnCompleted)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>
                      5b. {payApp.is_retainage_release ? '0' : payApp.stored_retainage_percent}% of Stored Material
                    </span>
                    <span className="font-mono">{fmt(summary.retainageOnStored)}</span>
                  </div>
                </div>
                <div className="flex justify-between font-bold">
                  <span>5. TOTAL RETAINAGE (Lines 5a + 5b)</span>
                  <span className="font-mono">{fmt(summary.retainageAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                  <span>6. TOTAL EARNED LESS RETAINAGE (Line 4 - 5)</span>
                  <span className="font-mono">{fmt(summary.totalEarnedLessRetainage)}</span>
                </div>
                <div className="flex justify-between">
                  <span>7. LESS PREVIOUS CERTIFICATES FOR PAYMENT</span>
                  <span className="font-mono">{fmt(summary.lessPreviousCertificates)}</span>
                </div>
                <div className="flex justify-between border-t-2 border-slate-900 pt-1.5 text-sm font-black">
                  <span>8. CURRENT PAYMENT DUE</span>
                  <span className="font-mono">{fmt(summary.currentPaymentDue)}</span>
                </div>
                <div className="flex justify-between pt-1 text-slate-700">
                  <span>9. BALANCE TO FINISH, INCLUDING RETAINAGE</span>
                  <span className="font-mono font-semibold">{fmt(balanceToFinishIncRetainage)}</span>
                </div>
              </div>

              {/* Change Order Summary & Certification */}
              <div className="space-y-4 text-xs">
                <div className="border border-slate-300 p-4 space-y-1.5">
                  <div className="font-black uppercase text-[11px] border-b border-slate-300 pb-1">
                    Change Order Summary
                  </div>
                  <div className="flex justify-between">
                    <span>Total Additions Approved</span>
                    <span className="font-mono">{fmt(additions)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Deductions Approved</span>
                    <span className="font-mono">({fmt(deductions)})</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
                    <span>NET CHANGES by Change Orders</span>
                    <span className="font-mono">{fmt(summary.netChangeOrders)}</span>
                  </div>
                </div>

                <div className="border border-slate-300 p-4 space-y-3">
                  <div className="font-black uppercase text-[11px]">Contractor&apos;s Certification</div>
                  <p className="text-[11px] text-slate-700 leading-relaxed">
                    The undersigned Contractor certifies that to the best of the Contractor&apos;s knowledge,
                    information and belief the Work covered by this Application for Payment has been
                    completed in accordance with the Contract Documents, and that current payment shown
                    herein is now due.
                  </p>
                  <div className="pt-3 flex justify-between border-t border-slate-200">
                    <span>By: ___________________________</span>
                    <span>Date: ______________</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* G703 Page */}
          <div className="space-y-3 break-before-page pt-4 border-t-2 border-dashed border-slate-300 print:border-none">
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
              <h2 className="text-base font-black uppercase">
                Continuation Sheet (AIA Document G703)
              </h2>
              <div className="text-xs">
                App #{payApp.application_number} • Period To: {payApp.period_to || '—'}
              </div>
            </div>

            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="border-b-2 border-slate-800 bg-slate-100 text-[10px] uppercase">
                  <th className="p-1.5 border border-slate-300">A. Item</th>
                  <th className="p-1.5 border border-slate-300">B. Description of Work</th>
                  <th className="p-1.5 border border-slate-300 text-right">C. Scheduled Value</th>
                  <th className="p-1.5 border border-slate-300 text-right">D. Prev. App</th>
                  <th className="p-1.5 border border-slate-300 text-right">E. This Period</th>
                  <th className="p-1.5 border border-slate-300 text-right">F. Stored Matl</th>
                  <th className="p-1.5 border border-slate-300 text-right">G. Total (D+E+F)</th>
                  <th className="p-1.5 border border-slate-300 text-right">% (G÷C)</th>
                  <th className="p-1.5 border border-slate-300 text-right">H. Balance (C-G)</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((l, idx) => (
                  <tr key={l.sovItemId || idx}>
                    <td className="p-1.5 border border-slate-300 font-mono">{l.itemNumber}</td>
                    <td className="p-1.5 border border-slate-300">{l.description}</td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {fmt(l.scheduledValue)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {fmt(l.previousCompleted)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {fmt(l.thisPeriod)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {fmt(l.storedMaterials)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">
                      {fmt(l.totalCompletedAndStored)}
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {l.percentComplete.toFixed(1)}%
                    </td>
                    <td className="p-1.5 border border-slate-300 text-right font-mono">
                      {fmt(l.balanceToFinish)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-900 bg-slate-100 font-bold">
                  <td colSpan={2} className="p-1.5 border border-slate-300 text-right uppercase">
                    Grand Totals
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.contractSumToDate)}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.lines.reduce((s, l) => s + l.previousCompleted, 0))}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.lines.reduce((s, l) => s + l.thisPeriod, 0))}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.totalStoredMaterials)}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.totalCompletedAndStored)}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {summary.contractSumToDate > 0
                      ? `${((summary.totalCompletedAndStored / summary.contractSumToDate) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-right font-mono">
                    {fmt(summary.contractSumToDate - summary.totalCompletedAndStored)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
