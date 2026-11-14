'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Search,
  Plus,
  AlertTriangle,
  Users,
  Phone,
  Mail,
  MapPin,
  Star,
  Trash2,
  GitMerge,
  Save,
  X,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';

interface CustomerContact {
  id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
}

interface Customer {
  id: string;
  name: string;
  customer_type: string | null;
  standing: string | null;
  main_phone: string | null;
  billing_email: string | null;
  billing_postal_address: string | null;
  billing_phone: string | null;
  general_notes: string | null;
  bad_pay: boolean;
  bad_pay_notes: string | null;
  bad_pay_year: string | null;
  bad_pay_amount: string | null;
  bill_day: string | null;
  billing_platform: string | null;
  bill_to_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  credit: string | null;
  contacts: CustomerContact[];
  job_count?: number;
  jobs?: Array<{
    id: string;
    job_number: string | null;
    project_name: string | null;
    status: string | null;
    quote_amount: number | null;
  }>;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [standingFilter, setStandingFilter] = useState('ALL');
  const [badPayOnly, setBadPayOnly] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Add Contact form
  const [newContactFirst, setNewContactFirst] = useState('');
  const [newContactLast, setNewContactLast] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRole, setNewContactRole] = useState('Point of Contact');

  // New Customer modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustType, setNewCustType] = useState('Contractor');
  const [newCustStanding, setNewCustStanding] = useState('Good Standing');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustCity, setNewCustCity] = useState('');
  const [newCustState, setNewCustState] = useState('');
  const [newCustPocFirst, setNewCustPocFirst] = useState('');
  const [newCustPocLast, setNewCustPocLast] = useState('');
  const [newCustPocEmail, setNewCustPocEmail] = useState('');
  const [newCustPocPhone, setNewCustPocPhone] = useState('');

  // Merge Customers modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSearch, setMergeSearch] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (standingFilter !== 'ALL') params.set('standing', standingFilter);
      if (badPayOnly) params.set('badPayOnly', '1');
      const res = await fetch(`/api/customers?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.customers) {
        setCustomers(data.customers);
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, standingFilter, badPayOnly]);

  useEffect(() => {
    const t = setTimeout(fetchCustomers, 200);
    return () => clearTimeout(t);
  }, [fetchCustomers]);

  const loadCustomerDetail = async (id: string) => {
    setSelectedId(id);
    const res = await fetch(`/api/customers/${id}`);
    const data = await res.json();
    if (res.ok && data.customer) {
      setSelectedCustomer(data.customer);
      setEditForm(data.customer);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/customers/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (res.ok && data.customer) {
        setSelectedCustomer(data.customer);
        setEditForm(data.customer);
        setStatusMsg('Customer saved.');
        await fetchCustomers();
      } else {
        setStatusMsg(`Error: ${data.error || 'Failed to save'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;
    if (!newContactFirst.trim() && !newContactLast.trim() && !newContactEmail.trim()) return;
    const res = await fetch(`/api/customers/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_contact',
        contact: {
          firstName: newContactFirst.trim(),
          lastName: newContactLast.trim(),
          email: newContactEmail.trim(),
          phone: newContactPhone.trim(),
          role: newContactRole.trim() || 'Point of Contact',
        },
      }),
    });
    const data = await res.json();
    if (res.ok && data.customer) {
      setSelectedCustomer(data.customer);
      setNewContactFirst('');
      setNewContactLast('');
      setNewContactEmail('');
      setNewContactPhone('');
      setNewContactRole('Point of Contact');
      await fetchCustomers();
    }
  };

  const handleSetPrimaryContact = async (contactId: string) => {
    if (!selectedId) return;
    const res = await fetch(`/api/customers/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_primary_contact', contactId }),
    });
    const data = await res.json();
    if (res.ok && data.customer) {
      setSelectedCustomer(data.customer);
      await fetchCustomers();
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!selectedId) return;
    const res = await fetch(`/api/customers/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_contact', contactId }),
    });
    const data = await res.json();
    if (res.ok && data.customer) {
      setSelectedCustomer(data.customer);
      await fetchCustomers();
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCustName.trim(),
        customerType: newCustType,
        standing: newCustStanding,
        mainPhone: newCustPhone.trim() || null,
        billingEmail: newCustEmail.trim() || null,
        addressCity: newCustCity.trim() || null,
        addressState: newCustState.trim() || null,
        initialContact:
          newCustPocFirst.trim() || newCustPocLast.trim() || newCustPocEmail.trim()
            ? {
                firstName: newCustPocFirst.trim(),
                lastName: newCustPocLast.trim(),
                email: newCustPocEmail.trim(),
                phone: newCustPocPhone.trim(),
                role: 'Primary POC',
              }
            : null,
      }),
    });
    const data = await res.json();
    if (res.ok && data.customer) {
      setShowNewModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustEmail('');
      setNewCustCity('');
      setNewCustState('');
      setNewCustPocFirst('');
      setNewCustPocLast('');
      setNewCustPocEmail('');
      setNewCustPocPhone('');
      await fetchCustomers();
      await loadCustomerDetail(data.customer.id);
    }
  };

  const handleMergeCustomers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    setIsMerging(true);
    try {
      const res = await fetch('/api/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCustomerId: mergeSourceId,
          targetCustomerId: mergeTargetId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowMergeModal(false);
        setMergeSourceId('');
        setMergeTargetId('');
        setStatusMsg('Customers merged successfully. All contacts and jobs were moved.');
        await fetchCustomers();
        await loadCustomerDetail(data.mergedIntoId);
      } else {
        setStatusMsg(`Merge error: ${data.error || 'Failed to merge'}`);
      }
    } finally {
      setIsMerging(false);
    }
  };

  const mergeCandidates = customers.filter((c) => {
    const q = mergeSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.bill_to_name || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">Customer Master Directory</h1>
              <p className="text-xs text-slate-400">
                GCs &amp; Clients • Multi-POC Support • Credit &amp; Standing
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
            <Link href="/suppliers" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Suppliers
            </Link>
            <button
              type="button"
              onClick={() => {
                setMergeSourceId(selectedId || '');
                setMergeTargetId('');
                setMergeSearch('');
                setShowMergeModal(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 font-bold flex items-center gap-1.5"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge Customers</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Customer</span>
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

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name, bill-to, POC name, email, phone, city..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={standingFilter}
            onChange={(e) => setStandingFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
          >
            <option value="ALL">All Standings</option>
            <option value="Good Standing">Good Standing</option>
            <option value="No History">No History</option>
            <option value="Bad Pay">Bad Pay</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 cursor-pointer select-none px-3 py-2 rounded-xl border border-rose-200 bg-rose-50">
            <input
              type="checkbox"
              checked={badPayOnly}
              onChange={(e) => setBadPayOnly(e.target.checked)}
            />
            <span>Bad Pay Flagged Only</span>
          </label>
          <div className="text-xs font-bold text-slate-500 ml-auto">
            {customers.length} customers
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Customer List */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col max-h-[75vh]">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
              Directory
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {isLoading ? (
                <div className="p-6 text-center text-xs text-slate-400">Loading customers...</div>
              ) : customers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No customers match.</div>
              ) : (
                customers.map((c) => {
                  const isSelected = c.id === selectedId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => loadCustomerDetail(c.id)}
                      className={`w-full text-left px-4 py-3 transition flex items-start justify-between gap-2 ${
                        isSelected ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                          <span>{c.name}</span>
                          {c.bad_pay && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-extrabold uppercase">
                              Bad Pay
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {c.standing || 'No History'}
                          {c.address_city || c.address_state
                            ? ` • ${[c.address_city, c.address_state].filter(Boolean).join(', ')}`
                            : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] font-bold">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {c.contacts?.length || 0} POC
                        </span>
                        {(c.job_count || 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {c.job_count} Jobs
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Customer Detail & Multi-POC Panel */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
            {!selectedCustomer ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Select a customer on the left to view or edit details, manage multiple Points of Contact (POCs), or inspect linked jobs.
              </div>
            ) : (
              <>
                {selectedCustomer.bad_pay && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold">Bad Pay Flagged</div>
                      <div className="text-[11px] mt-0.5">
                        {selectedCustomer.bad_pay_notes || 'Flagged in Customer Master.'}
                        {selectedCustomer.bad_pay_year ? ` (${selectedCustomer.bad_pay_year})` : ''}
                        {selectedCustomer.bad_pay_amount ? ` — ${selectedCustomer.bad_pay_amount}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer Edit Form */}
                <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <h2 className="text-sm font-extrabold text-slate-900">
                      {selectedCustomer.name}
                    </h2>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Customer Name
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
                        Type
                      </label>
                      <input
                        type="text"
                        value={editForm.customer_type || ''}
                        onChange={(e) => setEditForm({ ...editForm, customer_type: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Standing
                      </label>
                      <select
                        value={editForm.standing || 'No History'}
                        onChange={(e) => setEditForm({ ...editForm, standing: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="Good Standing">Good Standing</option>
                        <option value="No History">No History</option>
                        <option value="Bad Pay">Bad Pay</option>
                        <option value="COD">COD</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Bill-To Name
                      </label>
                      <input
                        type="text"
                        value={editForm.bill_to_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, bill_to_name: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Billing Email
                      </label>
                      <input
                        type="email"
                        value={editForm.billing_email || ''}
                        onChange={(e) => setEditForm({ ...editForm, billing_email: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Main / Billing Phone
                      </label>
                      <input
                        type="text"
                        value={editForm.billing_phone || editForm.main_phone || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, billing_phone: e.target.value, main_phone: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={editForm.address_street || ''}
                        onChange={(e) => setEditForm({ ...editForm, address_street: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        City
                      </label>
                      <input
                        type="text"
                        value={editForm.address_city || ''}
                        onChange={(e) => setEditForm({ ...editForm, address_city: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                          State
                        </label>
                        <input
                          type="text"
                          value={editForm.address_state || ''}
                          onChange={(e) => setEditForm({ ...editForm, address_state: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                          Zip
                        </label>
                        <input
                          type="text"
                          value={editForm.address_zip || ''}
                          onChange={(e) => setEditForm({ ...editForm, address_zip: e.target.value })}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                        General Notes
                      </label>
                      <textarea
                        rows={2}
                        value={editForm.general_notes || ''}
                        onChange={(e) => setEditForm({ ...editForm, general_notes: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 font-bold text-rose-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(editForm.bad_pay)}
                          onChange={(e) => setEditForm({ ...editForm, bad_pay: e.target.checked })}
                        />
                        <span>Flag as Bad Pay</span>
                      </label>
                      <textarea
                        rows={2}
                        value={editForm.bad_pay_notes || ''}
                        onChange={(e) => setEditForm({ ...editForm, bad_pay_notes: e.target.value })}
                        placeholder="Bad pay notes / details..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>
                </form>

                {/* Multi-POC Contacts Section */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span>Points of Contact ({selectedCustomer.contacts?.length || 0})</span>
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {(selectedCustomer.contacts || []).map((contact) => (
                      <div
                        key={contact.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{contact.full_name || 'Unnamed Contact'}</span>
                            {contact.role && (
                              <span className="text-[10px] font-semibold text-slate-500">
                                ({contact.role})
                              </span>
                            )}
                            {contact.is_primary && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[9px] font-bold uppercase">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-3 mt-0.5">
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!contact.is_primary && (
                            <button
                              type="button"
                              onClick={() => handleSetPrimaryContact(contact.id)}
                              className="px-2 py-1 rounded-lg bg-white border border-slate-300 hover:bg-blue-50 text-[10px] font-bold flex items-center gap-1"
                              title="Set as Primary POC"
                            >
                              <Star className="w-3 h-3 text-amber-500" />
                              <span>Primary</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(contact.id)}
                            className="p-1 text-slate-400 hover:text-rose-600"
                            title="Delete contact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline Add POC Form */}
                  <form
                    onSubmit={handleAddContact}
                    className="p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 space-y-2 text-xs"
                  >
                    <div className="text-[10px] font-bold uppercase text-slate-500">
                      + Add New Point of Contact to {selectedCustomer.name}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <input
                        type="text"
                        value={newContactFirst}
                        onChange={(e) => setNewContactFirst(e.target.value)}
                        placeholder="First Name"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                      <input
                        type="text"
                        value={newContactLast}
                        onChange={(e) => setNewContactLast(e.target.value)}
                        placeholder="Last Name"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                      <input
                        type="email"
                        value={newContactEmail}
                        onChange={(e) => setNewContactEmail(e.target.value)}
                        placeholder="Email"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                      <input
                        type="text"
                        value={newContactPhone}
                        onChange={(e) => setNewContactPhone(e.target.value)}
                        placeholder="Phone"
                        className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold"
                      >
                        Add POC
                      </button>
                    </div>
                  </form>
                </div>

                {/* Linked Jobs */}
                <div className="border-t border-slate-200 pt-4 space-y-2">
                  <h3 className="text-xs font-extrabold uppercase text-slate-700 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-emerald-600" />
                    <span>Linked Jobs ({selectedCustomer.jobs?.length || 0})</span>
                  </h3>
                  {(selectedCustomer.jobs || []).length === 0 ? (
                    <div className="text-xs text-slate-400">No jobs linked to this customer yet.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(selectedCustomer.jobs || []).map((j) => (
                        <Link
                          key={j.id}
                          href={`/jobs/${j.id}`}
                          className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 transition text-xs"
                        >
                          <div className="font-bold text-slate-900 truncate">
                            {j.job_number ? `[${j.job_number}] ` : ''}
                            {j.project_name || 'Untitled Job'}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {j.status || 'Active'}
                            {j.quote_amount != null
                              ? ` • $${Number(j.quote_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                              : ''}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* New Customer Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCustomer}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs"
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <h2 className="font-bold text-sm">New Customer</h2>
              <button type="button" onClick={() => setShowNewModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Company / Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type</label>
                  <select
                    value={newCustType}
                    onChange={(e) => setNewCustType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Contractor">Contractor</option>
                    <option value="Other Business">Other Business</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standing</label>
                  <select
                    value={newCustStanding}
                    onChange={(e) => setNewCustStanding(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Good Standing">Good Standing</option>
                    <option value="No History">No History</option>
                    <option value="COD">COD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Main Phone"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
                <input
                  type="email"
                  value={newCustEmail}
                  onChange={(e) => setNewCustEmail(e.target.value)}
                  placeholder="Billing Email"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newCustCity}
                  onChange={(e) => setNewCustCity(e.target.value)}
                  placeholder="City"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
                <input
                  type="text"
                  value={newCustState}
                  onChange={(e) => setNewCustState(e.target.value)}
                  placeholder="State"
                  className="px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <div className="font-bold text-slate-700">Initial Primary POC (Optional)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newCustPocFirst}
                    onChange={(e) => setNewCustPocFirst(e.target.value)}
                    placeholder="First Name"
                    className="px-3 py-2 rounded-lg border border-slate-300"
                  />
                  <input
                    type="text"
                    value={newCustPocLast}
                    onChange={(e) => setNewCustPocLast(e.target.value)}
                    placeholder="Last Name"
                    className="px-3 py-2 rounded-lg border border-slate-300"
                  />
                  <input
                    type="email"
                    value={newCustPocEmail}
                    onChange={(e) => setNewCustPocEmail(e.target.value)}
                    placeholder="POC Email"
                    className="px-3 py-2 rounded-lg border border-slate-300"
                  />
                  <input
                    type="text"
                    value={newCustPocPhone}
                    onChange={(e) => setNewCustPocPhone(e.target.value)}
                    placeholder="POC Phone"
                    className="px-3 py-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>
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
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                Create Customer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Merge Customers Modal */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleMergeCustomers}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs"
          >
            <div className="px-5 py-3.5 bg-amber-600 text-white flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-1.5">
                <GitMerge className="w-4 h-4" />
                <span>Merge Duplicate Customers</span>
              </h2>
              <button type="button" onClick={() => setShowMergeModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-600">
                Moves all Points of Contact and Linked Jobs from the <strong>Duplicate (Source)</strong> customer into the <strong>Keep (Target)</strong> customer, then removes the duplicate.
              </p>
              <input
                type="text"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                placeholder="Filter customer dropdowns..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300"
              />
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Duplicate Customer to Merge &amp; Remove (Source) *
                </label>
                <select
                  required
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">Select source customer...</option>
                  {mergeCandidates.slice(0, 200).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.contacts?.length || 0} POC, {c.job_count || 0} Jobs)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Customer to Keep (Target) *
                </label>
                <select
                  required
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">Select target customer...</option>
                  {mergeCandidates
                    .filter((c) => c.id !== mergeSourceId)
                    .slice(0, 200)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.contacts?.length || 0} POC, {c.job_count || 0} Jobs)
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isMerging || !mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold"
              >
                {isMerging ? 'Merging...' : 'Merge Customers'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
