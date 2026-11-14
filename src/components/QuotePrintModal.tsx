'use client';

import React, { useState } from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import {
  QuoteCartItem,
  QuoteSectionConfig,
  groupItemsBySection,
} from '@/lib/pricing/quote-sections';

export type { QuoteCartItem, QuoteSectionConfig };

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
  sections?: QuoteSectionConfig[];
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
  sections = [],
  bidSwitchedToQuoted,
}: QuotePrintModalProps) {
  const [showLinePrices, setShowLinePrices] = useState(false);

  if (!isOpen) return null;

  const groupedSections = groupItemsBySection(items, sections, markupPercent);
  const grandTotal = groupedSections.reduce((sum, g) => sum + g.totals.sectionTotal, 0);
  const todayStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
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
        <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between gap-3 flex-wrap print:hidden">
          <div className="flex items-center gap-2 text-xs">
            {bidSwitchedToQuoted && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Bid status updated to Bid Submitted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">
              <input
                type="checkbox"
                checked={showLinePrices}
                onChange={(e) => setShowLinePrices(e.target.checked)}
                className="rounded border-slate-500"
              />
              <span>Show Line-Item Prices</span>
            </label>
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
        <div
          id="printable-quote-sheet"
          className="p-8 overflow-y-auto space-y-5 text-slate-900 bg-white font-serif"
        >
          {/* Letterhead */}
          <div className="text-center space-y-0.5 pb-2">
            <h1 className="text-2xl font-bold underline tracking-tight text-slate-900">
              Partition Plus, Inc
            </h1>
            <div className="text-sm text-slate-800">P.O. Box 8</div>
            <div className="text-sm text-slate-800">Fallston, MD. 21047</div>
            <div className="text-sm text-slate-800">Phone: 410-879-6200</div>
            <div className="text-sm text-slate-800">
              E-Mail: <span className="underline">harrison@partitionplus.com</span>
            </div>
          </div>

          {/* Date, GC & Ref */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{contractorName || 'General Contractor'}</div>
              <div>{todayStr}</div>
            </div>
            <div className="pl-6 font-bold">
              Ref: {projectName || quoteTitle}
              {bidNumber ? <span className="font-normal text-slate-600 ml-2">(Bid #{bidNumber})</span> : null}
            </div>
            <div>Attn: Estimating</div>
          </div>

          {/* Boxed Scope Sections */}
          <div className="space-y-4">
            {groupedSections.map((group) => {
              const { sectionName, config, items: secItems, totals } = group;
              const secMarkupMult = 1 + (Number(config.markupPercent ?? markupPercent) || 0) / 100;
              const isCombined = config.pricingMode === 'furnish_and_install';
              const combinedTotal = totals.furnishSell + totals.installSell;

              return (
                <div
                  key={sectionName}
                  className="border border-slate-800 px-3.5 py-2.5 space-y-2 break-inside-avoid"
                >
                  <div className="text-sm">
                    We are pleased to enter our price on the following{' '}
                    <strong className="font-bold">{sectionName}:</strong>
                  </div>

                  {secItems.length > 0 && (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="text-slate-900">
                          <th className="py-0.5 pr-3 font-normal underline">Description</th>
                          <th className="py-0.5 px-2 font-normal underline w-36">Quantity</th>
                          {showLinePrices && (
                            <>
                              <th className="py-0.5 px-2 font-normal underline text-right w-24">
                                Unit Price
                              </th>
                              <th className="py-0.5 pl-2 font-normal underline text-right w-24">
                                Line Total
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {secItems.map((it) => {
                          const unitSell = it.unitCost * secMarkupMult;
                          const lineTotal = unitSell * it.quantity;
                          const qtyDisplay = it.unitLabel
                            ? `${it.quantity} ${it.unitLabel}`
                            : String(it.quantity);
                          return (
                            <tr key={it.priceItemId}>
                              <td className="py-0.5 pr-3">
                                {it.description}
                                {it.sku && it.sku !== 'CUSTOM' ? (
                                  <span className="text-slate-600 ml-1.5 text-[11px]">
                                    ({it.manufacturer} {it.sku})
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-0.5 px-2">{qtyDisplay}</td>
                              {showLinePrices && (
                                <>
                                  <td className="py-0.5 px-2 text-right font-sans">
                                    {fmt(unitSell)}
                                  </td>
                                  <td className="py-0.5 pl-2 text-right font-sans font-semibold">
                                    {fmt(lineTotal)}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {config.notes && config.notes.trim() && (
                    <div className="text-xs font-bold text-slate-900 whitespace-pre-wrap pt-1">
                      {config.notes}
                    </div>
                  )}

                  {/* Section Pricing Lines */}
                  <div className="pt-1.5 space-y-0.5 text-xs font-bold">
                    {isCombined ? (
                      <div className="flex items-center justify-between">
                        <span>FURNISH AND INSTALL F.O.B. JOBSITE EXCLUDING TAX</span>
                        <span className="font-sans">{fmt(combinedTotal)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span>FURNISH ONLY F.O.B. JOBSITE EXCLUDING TAX</span>
                          <span className="font-sans">{fmt(totals.furnishSell)}</span>
                        </div>
                        {totals.installSell > 0 && (
                          <div className="flex items-center justify-between">
                            <span>ADD TO INSTALL</span>
                            <span className="font-sans">{fmt(totals.installSell)}</span>
                          </div>
                        )}
                      </>
                    )}

                    {(config.addons || []).map((addon) => (
                      <div key={addon.id} className="flex items-center justify-between">
                        <span className="uppercase">{addon.label}</span>
                        <span className="font-sans">{fmt(Number(addon.amount) || 0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {groupedSections.length > 1 && (
            <div className="flex items-center justify-between border-t border-b border-slate-400 py-1.5 px-1 text-sm font-bold">
              <span>TOTAL COMPLETE PACKAGE (EXCLUDING TAX)</span>
              <span className="font-sans">{fmt(grandTotal)}</span>
            </div>
          )}

          {notes && notes.trim() && (
            <div className="p-3 border border-slate-300 bg-slate-50 text-xs">
              <div className="font-bold uppercase text-[10px] text-slate-700 mb-1">
                General Quote Notes / Clarifications
              </div>
              <p className="text-slate-900 whitespace-pre-wrap">{notes}</p>
            </div>
          )}

          {/* Terms Of Offer */}
          <div className="pt-3 space-y-3 text-xs leading-relaxed break-inside-avoid">
            <div className="text-center font-bold underline text-sm">Terms Of Offer</div>
            <p>
              This offer is good for 15 days, after the above date. Terms are net 30 after written
              credit approval from this office. We specifically excluded and BIM requirements,
              delegated design, in wall cutouts, in wall blocking, unless specifically noted as
              included. Invoice on delivery or installation. Please indicate Acceptance with
              Contract, Purchase Order, or by signing this agreement. The above prices are based
              upon award as a complete package. If individual sections are Awarded, prices are
              subject to change.
            </p>
            <div className="flex justify-end pr-12 pt-1">
              <div>
                <div>Respectfully Submitted,</div>
                <div>Harrison Schumaker</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 text-sm">
              <div>Acceptance___________________________________</div>
              <div>Date:___________________________</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
