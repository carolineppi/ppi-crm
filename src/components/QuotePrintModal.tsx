'use client';

import React from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';

export interface QuoteCartItem {
  priceItemId: string;
  manufacturer: string;
  sku: string;
  description: string;
  quantity: number;
  unitCost: number;
}

interface QuotePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteTitle: string;
  projectName?: string | null;
  contractorName?: string | null;
  bidNumber?: string | null;
  markupPercent: number;
  notes?: string | null;
  items: QuoteCartItem[];
  bidSwitchedToQuoted?: boolean;
}

function fmt(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuotePrintModal({
  isOpen,
  onClose,
  quoteTitle,
  projectName,
  contractorName,
  bidNumber,
  markupPercent,
  notes,
  items,
  bidSwitchedToQuoted,
}: QuotePrintModalProps) {
  if (!isOpen) return null;

  const mult = 1 + (Number(markupPercent) || 0) / 100;
  const grandTotal = items.reduce((sum, it) => sum + it.unitCost * mult * it.quantity, 0);
  const todayStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-quote-sheet,
          #printable-quote-sheet * {
            visibility: visible;
          }
          #printable-quote-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none">
        {/* Non-printing Toolbar */}
        <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs">
            {bidSwitchedToQuoted && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bid status updated to Quoted
              </span>
            )}
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

        {/* Printable Quote Document */}
        <div id="printable-quote-sheet" className="p-8 overflow-y-auto space-y-6 text-slate-900 bg-white">
          <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">MATERIAL QUOTE</h2>
              <p className="text-xs text-slate-600 mt-0.5">{quoteTitle}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <div className="font-bold text-slate-900">Date: {todayStr}</div>
              {bidNumber && <div className="font-mono text-slate-700">Bid #: {bidNumber}</div>}
            </div>
          </div>

          {(projectName || contractorName) && (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Project</div>
                <div className="font-bold text-slate-900 mt-0.5">{projectName || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500">Contractor / GC</div>
                <div className="font-bold text-slate-900 mt-0.5">{contractorName || '—'}</div>
              </div>
            </div>
          )}

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-slate-300 text-[10px] uppercase tracking-wider text-slate-600">
                <th className="py-2 pr-2">Qty</th>
                <th className="py-2 px-2">Mfg</th>
                <th className="py-2 px-2">Model / SKU</th>
                <th className="py-2 px-2">Description</th>
                <th className="py-2 px-2 text-right">Unit Price</th>
                <th className="py-2 pl-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((it) => {
                const unitSell = it.unitCost * mult;
                const lineTotal = unitSell * it.quantity;
                return (
                  <tr key={it.priceItemId}>
                    <td className="py-2.5 pr-2 font-bold">{it.quantity}</td>
                    <td className="py-2.5 px-2 font-semibold">{it.manufacturer}</td>
                    <td className="py-2.5 px-2 font-mono font-bold">{it.sku}</td>
                    <td className="py-2.5 px-2">{it.description}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{fmt(unitSell)}</td>
                    <td className="py-2.5 pl-2 text-right font-mono font-bold">{fmt(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-900">
                <td colSpan={5} className="py-3 pr-2 text-right font-black text-sm uppercase">
                  Quote Total
                </td>
                <td className="py-3 pl-2 text-right font-mono font-black text-base text-slate-900">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>

          {notes && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-bold text-slate-700 uppercase text-[10px] mb-1">
                Notes &amp; Clarifications
              </div>
              <p className="text-slate-800 whitespace-pre-wrap">{notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
