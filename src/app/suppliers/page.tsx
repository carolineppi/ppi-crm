'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Save,
  X,
  CheckCircle2,
  User,
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  address: string | null;
  representative: string | null;
  representative_phone: string | null;
  representative_email: string | null;
  quickbooks_name: string | null;
  po_history: string | null;
  notes: string | null;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQbName, setNewQbName] = useState('');
  const [newRep, setNewRep] = useState('');
  const [newRepPhone, setNewRepPhone] = useState('');
  const [newRepEmail, setNewRepEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      const res = await fetch(`/api/suppliers?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.suppliers) {
        setSuppliers(data.suppliers);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(fetchSuppliers, 200);
    return () => clearTimeout(t);
  }, [fetchSuppliers]);

  const handleSelect = (s: Supplier) => {
    setSelected(s);
    setEditForm(s);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/suppliers/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (res.ok && data.supplier) {
        setSelected(data.supplier);
        setEditForm(data.supplier);
        setStatusMsg('Supplier saved.');
        await fetchSuppliers();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName.trim(),
        quickbooksName: newQbName.trim() || newName.trim(),
        representative: newRep.trim() || null,
        representativePhone: newRepPhone.trim() || null,
        representativeEmail: newRepEmail.trim() || null,
        address: newAddress.trim() || null,
      }),
    });
    const data = await res.json();
    if (res.ok && data.supplier) {
      setShowNewModal(false);
      setNewName('');
      setNewQbName('');
      setNewRep('');
      setNewRepPhone('');
      setNewRepEmail('');
      setNewAddress('');
      setStatusMsg(`Added ${data.supplier.name}.`);
      await fetchSuppliers();
      handleSelect(data.supplier);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">Supplier Master Directory</h1>
              <p className="text-xs text-slate-400">
                Manufacturers, Reps, QuickBooks Names &amp; PO Contacts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link href="/" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Calendar
            </Link>
            <Link href="/estimator" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Estimator
            </Link>
            <Link href="/jobs" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Jobs
            </Link>
            <Link href="/customers" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Customers
            </Link>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Supplier</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4">
        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {statusMsg}
            </span>
            <button onClick={() => setStatusMsg(null)} className="text-emerald-700 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search supplier name, QuickBooks name, rep, email, phone..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="text-xs font-bold text-slate-500 ml-auto">
            {suppliers.length} suppliers
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Supplier List */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col max-h-[75vh]">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
              Suppliers
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {isLoading ? (
                <div className="p-6 text-center text-xs text-slate-400">Loading suppliers...</div>
              ) : suppliers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No suppliers match.</div>
              ) : (
                suppliers.map((s) => {
                  const isSelected = s.id === selected?.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelect(s)}
                      className={`w-full text-left px-4 py-3 transition ${
                        isSelected ? 'bg-amber-50 border-l-4 border-l-amber-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-xs text-slate-900 truncate">{s.name}</div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {s.representative ? `Rep: ${s.representative}` : s.quickbooks_name || 'No rep listed'}
                        {s.representative_phone ? ` • ${s.representative_phone}` : ''}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Supplier Detail */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            {!selected ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Select a supplier on the left to view or edit representative info, QuickBooks name, and PO history.
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h2 className="text-sm font-extrabold text-slate-900">{selected.name}</h2>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      QuickBooks Name
                    </label>
                    <input
                      type="text"
                      value={editForm.quickbooks_name || ''}
                      onChange={(e) => setEditForm({ ...editForm, quickbooks_name: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Representative
                    </label>
                    <div className="relative">
                      <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={editForm.representative || ''}
                        onChange={(e) => setEditForm({ ...editForm, representative: e.target.value })}
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Rep Phone
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={editForm.representative_phone || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, representative_phone: e.target.value })
                        }
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                      Rep Email
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={editForm.representative_email || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, representative_email: e.target.value })
                        }
                        className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                    Address
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.address || ''}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                    Notes
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>

                {selected.po_history && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-500">
                      Imported PO History Reference
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 max-h-28 overflow-y-auto break-all">
                      {selected.po_history}
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </main>

      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="font-bold text-sm">New Supplier</h2>
              <button type="button" onClick={() => setShowNewModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">QuickBooks Name</label>
                  <input
                    type="text"
                    value={newQbName}
                    onChange={(e) => setNewQbName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newRep}
                  onChange={(e) => setNewRep(e.target.value)}
                  placeholder="Rep Name"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
                <input
                  type="text"
                  value={newRepPhone}
                  onChange={(e) => setNewRepPhone(e.target.value)}
                  placeholder="Rep Phone"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
                <input
                  type="email"
                  value={newRepEmail}
                  onChange={(e) => setNewRepEmail(e.target.value)}
                  placeholder="Rep Email"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <textarea
                rows={3}
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder="Supplier Address"
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                Create Supplier
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
