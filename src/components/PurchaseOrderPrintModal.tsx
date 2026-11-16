'use client';

import React from 'react';
import { Printer, X } from 'lucide-react';

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  po: any;
  supplier?: any;
}

function fmt(n: number | null | undefined) {
  return `$${(Number(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PurchaseOrderPrintModal({
  isOpen,
  onClose,
  job,
  po,
  supplier,
}: PurchaseOrderPrintModalProps) {
  if (!isOpen || !job || !po) return null;

  const items: any[] = Array.isArray(po.items) ? po.items : [];
  const totalCost =
    Number(po.total_cost) ||
    items.reduce((s, it) => s + (Number(it.unitCost) || 0) * (Number(it.quantity) || 1), 0);

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
          #printable-po-sheet,
          #printable-po-sheet * {
            visibility: visible;
          }
          #printable-po-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 print:my-0 print:shadow-none print:border-0">
        {/* Non-print Action Bar */}
        <div className="px-5 py-3 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="text-xs font-bold">
            Purchase Order — {po.po_number} ({po.vendor})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
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
        <div id="printable-po-sheet" className="p-8 bg-white text-slate-900 space-y-6 text-xs">
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
              <div className="text-lg font-black uppercase tracking-wider text-blue-800">
                Purchase Order
              </div>
              <div className="font-mono text-sm font-extrabold text-slate-900 mt-0.5">
                {po.po_number}
              </div>
              <div className="text-[11px] text-slate-500 uppercase font-bold mt-0.5">
                Status: {po.status}
              </div>
            </div>
          </div>

          {/* Vendor + Ship To / Job Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500">Vendor / Supplier</div>
              <div className="text-sm font-black text-slate-900">{po.vendor}</div>
              {supplier?.representative && (
                <div className="text-slate-700">Attn: {supplier.representative}</div>
              )}
              {supplier?.representative_phone && (
                <div className="text-slate-600">Phone: {supplier.representative_phone}</div>
              )}
              {supplier?.representative_email && (
                <div className="text-slate-600">Email: {supplier.representative_email}</div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Job Reference &amp; Delivery Details
              </div>
              <div className="text-sm font-black text-slate-900">
                {job.job_number ? `${job.job_number} — ` : ''}
                {job.project_name}
              </div>
              {job.client_company && (
                <div className="text-slate-700">Customer: {job.client_company}</div>
              )}
              {address && <div className="text-slate-600">Site: {address}</div>}
              <div className="pt-1 flex flex-wrap gap-4 text-[11px] text-slate-700">
                <span>
                  Order Date: <strong>{po.order_date || '—'}</strong>
                </span>
                <span>
                  Expected Delivery: <strong>{po.expected_delivery_date || 'TBD'}</strong>
                </span>
              </div>
              {po.tracking_number && (
                <div className="text-[11px] text-slate-700">
                  Tracking #: <strong className="font-mono">{po.tracking_number}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="rounded-xl border border-slate-300 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900 text-white text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3 w-10">#</th>
                  <th className="py-2.5 px-3 w-16 text-center">Qty</th>
                  <th className="py-2.5 px-3 w-40">Manufacturer / SKU</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 w-28 text-right">Unit Cost</th>
                  <th className="py-2.5 px-3 w-28 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      No line items listed on this purchase order.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const qty = Math.max(1, Number(it.quantity) || 1);
                    const unit = Number(it.unitCost) || 0;
                    const lineTot = qty * unit;
                    return (
                      <tr key={idx}>
                        <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-3 text-center font-bold">{qty}</td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {[it.manufacturer, it.sku].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td className="py-2 px-3">{it.description}</td>
                        <td className="py-2 px-3 text-right font-mono">{fmt(unit)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {fmt(lineTot)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-300">
                  <td colSpan={5} className="py-3 px-3 text-right font-black uppercase text-slate-700">
                    Purchase Order Total
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-base font-black text-slate-900">
                    {fmt(totalCost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {po.notes && (
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50">
              <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                Shipping &amp; Order Notes
              </div>
              <div className="text-slate-800 whitespace-pre-wrap">{po.notes}</div>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-200 text-[11px] text-slate-600">
            <div>
              <div className="border-b border-slate-400 h-7 mb-1" />
              <div>
                Authorized By: <strong>{po.created_by || job.project_manager || 'Project Manager'}</strong>
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
  );
}
