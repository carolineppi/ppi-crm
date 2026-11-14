'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Warehouse,
  PackageCheck,
  Truck,
  Boxes,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Plus,
  Printer,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  X,
} from 'lucide-react';
import {
  PRESET_STAGING_BAYS,
  INVENTORY_CATEGORIES,
  getWarehouseStatusMeta,
} from '@/lib/warehouse/helpers';

type TabKey = 'receiving' | 'staging' | 'loadout' | 'inventory';

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('receiving');
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [staffName, setStaffName] = useState('');

  // Warehouse core data
  const [incomingPOs, setIncomingPOs] = useState<any[]>([]);
  const [stagedJobs, setStagedJobs] = useState<any[]>([]);
  const [upcomingInstalls, setUpcomingInstalls] = useState<any[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<any[]>([]);

  // Stock inventory data
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [stockMovements, setStockMovements] = useState<any[]>([]);
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Filters
  const [poFilter, setPoFilter] = useState<'pending' | 'partial' | 'discrepancy' | 'received' | 'all'>('pending');
  const [stagingFilter, setStagingFilter] = useState<string>('all');

  // Receive PO Modal
  const [receivingPo, setReceivingPo] = useState<any | null>(null);
  const [rcvPackingSlip, setRcvPackingSlip] = useState('');
  const [rcvCarrier, setRcvCarrier] = useState('');
  const [rcvBayPreset, setRcvBayPreset] = useState('Bay A');
  const [rcvBayCustom, setRcvBayCustom] = useState('');
  const [rcvNotes, setRcvNotes] = useState('');
  const [rcvLines, setRcvLines] = useState<any[]>([]);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

  // Add Stock SKU Modal
  const [showNewSkuModal, setShowNewSkuModal] = useState(false);
  const [newSku, setNewSku] = useState({
    sku: '',
    name: '',
    manufacturer: '',
    category: 'Hardware',
    binLocation: '',
    quantityOnHand: '0',
    reorderPoint: '5',
    unit: 'EA',
    unitCost: '0',
    notes: '',
  });
  const [isSavingSku, setIsSavingSku] = useState(false);

  // Stock Movement Modal
  const [movementItem, setMovementItem] = useState<any | null>(null);
  const [movementType, setMovementType] = useState<'receive' | 'pull_to_job' | 'return' | 'adjustment'>('pull_to_job');
  const [movementQty, setMovementQty] = useState('1');
  const [movementJobId, setMovementJobId] = useState('');
  const [movementNotes, setMovementNotes] = useState('');
  const [isSavingMovement, setIsSavingMovement] = useState(false);

  // Pull Sheet Print Modal
  const [printTicket, setPrintTicket] = useState<any | null>(null);

  useEffect(() => {
    const savedStaff = localStorage.getItem('ppi_warehouse_staff');
    if (savedStaff) setStaffName(savedStaff);
    loadAll();
  }, []);

  const handleStaffChange = (val: string) => {
    setStaffName(val);
    localStorage.setItem('ppi_warehouse_staff', val);
  };

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [whRes, invRes] = await Promise.all([
        fetch('/api/warehouse'),
        fetch('/api/warehouse/inventory'),
      ]);
      const whData = await whRes.json();
      const invData = await invRes.json();
      if (whRes.ok) {
        setIncomingPOs(whData.incomingPOs || []);
        setStagedJobs(whData.stagedJobs || []);
        setUpcomingInstalls(whData.upcomingInstalls || []);
        setRecentReceipts(whData.recentReceipts || []);
      }
      if (invRes.ok) {
        setInventoryItems(invData.items || []);
        setStockMovements(invData.movements || []);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openReceiveModal = (po: any) => {
    setReceivingPo(po);
    setRcvPackingSlip(po.packing_slip_number || '');
    setRcvCarrier('');
    const existingLoc = po.warehouse_location || po.job?.warehouse_location || 'Bay A';
    if ((PRESET_STAGING_BAYS as readonly string[]).includes(existingLoc)) {
      setRcvBayPreset(existingLoc);
      setRcvBayCustom('');
    } else {
      setRcvBayPreset('CUSTOM');
      setRcvBayCustom(existingLoc);
    }
    setRcvNotes('');
    const poItems = Array.isArray(po.items) ? po.items : [];
    setRcvLines(
      poItems.map((it: any, index: number) => {
        const ordered = Number(it.quantity) || 1;
        const alreadyRcv = Number(it.qtyReceived) || 0;
        const remaining = Math.max(0, ordered - alreadyRcv);
        return {
          index,
          sku: it.sku || '',
          description: it.description || 'Item',
          qtyOrdered: ordered,
          alreadyReceived: alreadyRcv,
          qtyReceived: remaining,
          qtyDamaged: 0,
          condition: 'good',
          notes: '',
        };
      })
    );
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPo) return;
    setIsSavingReceipt(true);
    try {
      const stagingLocation =
        rcvBayPreset === 'CUSTOM' ? rcvBayCustom.trim() : rcvBayPreset;
      const res = await fetch('/api/warehouse/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poId: receivingPo.id,
          jobId: receivingPo.job_id,
          receivedBy: staffName || 'Warehouse',
          packingSlipNumber: rcvPackingSlip,
          carrier: rcvCarrier,
          stagingLocation,
          notes: rcvNotes,
          itemsReceived: rcvLines,
        }),
      });
      if (res.ok) {
        setReceivingPo(null);
        await loadAll();
      }
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const handleUpdateStaging = async (
    jobId: string,
    updates: { warehouseStatus?: string; warehouseLocation?: string; loadedBy?: string }
  ) => {
    const res = await fetch('/api/warehouse/staging', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, ...updates }),
    });
    if (res.ok) {
      await loadAll();
    }
  };

  const handleCreateSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.sku.trim() || !newSku.name.trim()) return;
    setIsSavingSku(true);
    try {
      const res = await fetch('/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSku),
      });
      if (res.ok) {
        setShowNewSkuModal(false);
        setNewSku({
          sku: '',
          name: '',
          manufacturer: '',
          category: 'Hardware',
          binLocation: '',
          quantityOnHand: '0',
          reorderPoint: '5',
          unit: 'EA',
          unitCost: '0',
          notes: '',
        });
        await loadAll();
      }
    } finally {
      setIsSavingSku(false);
    }
  };

  const handleSubmitMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementItem) return;
    setIsSavingMovement(true);
    try {
      const res = await fetch('/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'movement',
          inventoryId: movementItem.id,
          movementType,
          quantity: Number(movementQty) || 0,
          jobId: movementJobId || null,
          performedBy: staffName || 'Warehouse',
          notes: movementNotes,
        }),
      });
      if (res.ok) {
        setMovementItem(null);
        setMovementQty('1');
        setMovementJobId('');
        setMovementNotes('');
        await loadAll();
      }
    } finally {
      setIsSavingMovement(false);
    }
  };

  // Filtered lists
  const filteredPOs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return incomingPOs.filter((po) => {
      if (poFilter === 'pending' && !['ordered', 'shipped', 'partial', 'draft'].includes(po.status)) {
        return false;
      }
      if (poFilter === 'partial' && po.status !== 'partial') return false;
      if (poFilter === 'discrepancy' && !po.has_damage_or_shortage) return false;
      if (poFilter === 'received' && po.status !== 'received') return false;
      if (!q) return true;
      return `${po.po_number || ''} ${po.vendor || ''} ${po.tracking_number || ''} ${
        po.job?.job_number || ''
      } ${po.job?.project_name || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [incomingPOs, poFilter, searchQuery]);

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stagedJobs.filter((j) => {
      if (stagingFilter !== 'all' && j.warehouse_status !== stagingFilter) return false;
      if (!q) return true;
      return `${j.job_number || ''} ${j.project_name || ''} ${j.client_company || ''} ${
        j.warehouse_location || ''
      } ${j.project_manager || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [stagedJobs, stagingFilter, searchQuery]);

  const filteredInstalls = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return upcomingInstalls.filter((t) => {
      if (!q) return true;
      return `${t.job?.job_number || ''} ${t.job?.project_name || ''} ${
        t.assigned_crew || ''
      } ${t.job?.warehouse_location || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [upcomingInstalls, searchQuery]);

  const filteredInventory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventoryItems.filter((it) => {
      if (lowStockOnly && Number(it.quantity_on_hand || 0) > Number(it.reorder_point || 0)) {
        return false;
      }
      if (!q) return true;
      return `${it.sku || ''} ${it.name || ''} ${it.manufacturer || ''} ${it.category || ''} ${
        it.bin_location || ''
      }`
        .toLowerCase()
        .includes(q);
    });
  }, [inventoryItems, lowStockOnly, searchQuery]);

  // Summary metrics
  const awaitingDeliveryCount = incomingPOs.filter((p) =>
    ['ordered', 'shipped', 'partial'].includes(p.status)
  ).length;
  const discrepancyCount = incomingPOs.filter((p) => p.has_damage_or_shortage).length;
  const stagedReadyCount = stagedJobs.filter((j) => j.warehouse_status === 'staged_ready').length;
  const lowStockCount = inventoryItems.filter(
    (it) => Number(it.quantity_on_hand || 0) <= Number(it.reorder_point || 0)
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <header className="bg-slate-900 text-white px-6 py-4 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Warehouse className="w-6 h-6 text-amber-400" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">
                Warehouse, Receiving &amp; Inventory
              </h1>
              <p className="text-xs text-slate-400">
                Dock Check-In • Job Staging Bays • Install Load-Out • Division 10 Stock
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <span className="text-slate-400 font-semibold">Staff:</span>
              <input
                type="text"
                value={staffName}
                onChange={(e) => handleStaffChange(e.target.value)}
                placeholder="Your Name / Initials"
                className="bg-transparent text-white font-bold w-32 focus:outline-none placeholder:text-slate-500"
              />
            </div>
            <Link href="/jobs" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Jobs
            </Link>
            <Link href="/pm" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              PM Portal
            </Link>
            <Link href="/install" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Install Dept
            </Link>
            <Link href="/accounting" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700">
              Accounting
            </Link>
            <button
              type="button"
              onClick={loadAll}
              disabled={isLoading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
              title="Refresh Warehouse Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5 print:hidden">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-500 uppercase">Incoming POs</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{awaitingDeliveryCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ordered / Shipped / Partial</div>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-emerald-800 uppercase">Staged &amp; Ready</div>
            <div className="text-2xl font-black text-emerald-900 mt-1">{stagedReadyCount}</div>
            <div className="text-[11px] text-emerald-700 mt-0.5">Jobs ready for Install</div>
          </div>
          <div className="bg-white rounded-xl border border-rose-200 bg-rose-50/30 p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-rose-800 uppercase">Damage / Shortages</div>
            <div className="text-2xl font-black text-rose-900 mt-1">{discrepancyCount}</div>
            <div className="text-[11px] text-rose-700 mt-0.5">Flagged PO receipts</div>
          </div>
          <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-2xs">
            <div className="text-[11px] font-bold text-amber-800 uppercase">Low Stock SKUs</div>
            <div className="text-2xl font-black text-amber-900 mt-1">{lowStockCount}</div>
            <div className="text-[11px] text-amber-700 mt-0.5">At or below reorder point</div>
          </div>
        </div>

        {/* Tabs & Search */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('receiving')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'receiving'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
              <span>Receiving Dock ({awaitingDeliveryCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('staging')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'staging'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Job Staging ({stagedJobs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('loadout')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'loadout'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Install Load-Out ({upcomingInstalls.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Stock Inventory ({inventoryItems.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO, job #, vendor, SKU, bay..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* TAB 1: RECEIVING DOCK */}
        {activeTab === 'receiving' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['pending', 'Awaiting Delivery'],
                  ['partial', 'Partial'],
                  ['discrepancy', 'Damaged / Short'],
                  ['received', 'Received'],
                  ['all', 'All POs'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPoFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                    poFilter === key
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              {filteredPOs.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No purchase orders match this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="text-left px-4 py-3">PO #</th>
                        <th className="text-left px-4 py-3">Job</th>
                        <th className="text-left px-4 py-3">Vendor / Tracking</th>
                        <th className="text-left px-4 py-3">Expected ETA</th>
                        <th className="text-left px-4 py-3">Status / Bay</th>
                        <th className="text-right px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPOs.map((po) => (
                        <tr key={po.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">
                            {po.po_number}
                            <div className="text-[10px] font-sans text-slate-500">
                              {Array.isArray(po.items) ? po.items.length : 0} line items
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {po.job ? (
                              <Link
                                href={`/jobs/${po.job.id}`}
                                className="font-bold text-blue-700 hover:underline"
                              >
                                {po.job.job_number || 'JOB'} — {po.job.project_name}
                              </Link>
                            ) : (
                              <span className="text-slate-400">Unlinked</span>
                            )}
                            <div className="text-[11px] text-slate-500">
                              PM: {po.job?.project_manager || 'Unassigned'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{po.vendor}</div>
                            {po.tracking_number && (
                              <div className="text-[11px] font-mono text-slate-500">
                                Track: {po.tracking_number}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {po.expected_delivery_date || 'TBD'}
                            {po.actual_delivery_date && (
                              <div className="text-[11px] text-emerald-700 font-semibold">
                                Rcvd: {po.actual_delivery_date}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 space-y-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                po.status === 'received'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : po.status === 'partial'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {po.status}
                            </span>
                            {po.warehouse_location && (
                              <div className="text-[11px] font-semibold text-slate-600">
                                Bay: {po.warehouse_location}
                              </div>
                            )}
                            {po.has_damage_or_shortage && (
                              <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Damage / Shortage
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => openReceiveModal(po)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
                            >
                              Receive Delivery
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recent Receipts Log */}
            {recentReceipts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <h2 className="text-xs font-extrabold uppercase text-slate-500">
                  Recent Dock Receipts
                </h2>
                <div className="divide-y divide-slate-100 text-xs">
                  {recentReceipts.slice(0, 8).map((r) => (
                    <div key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold">{r.receipt_number}</span>
                        {r.job && (
                          <span className="ml-2 text-slate-700 font-semibold">
                            {r.job.job_number} — {r.job.project_name}
                          </span>
                        )}
                        {r.packing_slip_number && (
                          <span className="ml-2 text-slate-500">PS# {r.packing_slip_number}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        {r.staging_location && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {r.staging_location}
                          </span>
                        )}
                        {r.has_discrepancy && (
                          <span className="text-rose-700 font-bold">Discrepancy Logged</span>
                        )}
                        <span>By {r.received_by || 'Warehouse'}</span>
                        <span>{new Date(r.received_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: JOB STAGING & READINESS */}
        {activeTab === 'staging' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['all', 'All Jobs'],
                ['awaiting_materials', 'Awaiting Materials'],
                ['partial_received', 'Partial Received'],
                ['staged_ready', 'Staged & Ready'],
                ['loaded_out', 'Loaded / Dispatched'],
                ['delivered_to_site', 'Delivered to Site'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStagingFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                    stagingFilter === key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredJobs.map((job) => {
                const meta = getWarehouseStatusMeta(job.warehouse_status);
                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-sm font-extrabold text-blue-700 hover:underline"
                        >
                          {job.job_number || 'JOB'} — {job.project_name}
                        </Link>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {job.client_company || job.client_name || 'Client'} • PM:{' '}
                          {job.project_manager || 'Unassigned'}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span>
                        POs:{' '}
                        <strong>
                          {job.receivedPoCount}/{job.poCount} Received
                        </strong>
                      </span>
                      {job.requested_install_date && (
                        <span>
                          Req Install: <strong>{job.requested_install_date}</strong>
                        </span>
                      )}
                      {job.hasDiscrepancy && (
                        <span className="text-rose-700 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Shortage/Damage
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                      <select
                        value={job.warehouse_location || ''}
                        onChange={(e) =>
                          handleUpdateStaging(job.id, { warehouseLocation: e.target.value })
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">Assign Staging Bay...</option>
                        {PRESET_STAGING_BAYS.map((bay) => (
                          <option key={bay} value={bay}>
                            {bay}
                          </option>
                        ))}
                      </select>

                      <select
                        value={job.warehouse_status || 'awaiting_materials'}
                        onChange={(e) =>
                          handleUpdateStaging(job.id, {
                            warehouseStatus: e.target.value,
                            loadedBy: staffName || 'Warehouse',
                          })
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-semibold"
                      >
                        <option value="awaiting_materials">Awaiting Materials</option>
                        <option value="partial_received">Partial Received</option>
                        <option value="staged_ready">Staged &amp; Ready</option>
                        <option value="loaded_out">Loaded / Dispatched</option>
                        <option value="delivered_to_site">Delivered to Site</option>
                      </select>

                      {job.warehouse_status !== 'staged_ready' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateStaging(job.id, { warehouseStatus: 'staged_ready' })
                          }
                          className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Staged</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: OUTBOUND LOAD-OUT (INSTALL PULLS) */}
        {activeTab === 'loadout' && (
          <div className="space-y-3">
            {filteredInstalls.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-500">
                No upcoming install tickets in the load-out queue.
              </div>
            ) : (
              filteredInstalls.map((ticket) => {
                const job = ticket.job;
                const meta = getWarehouseStatusMeta(job?.warehouse_status);
                const installDate = ticket.confirmed_install_date || ticket.requested_install_date;
                return (
                  <div
                    key={ticket.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-extrabold">
                          {installDate}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>
                        {job?.warehouse_location && (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-bold">
                            Bay: {job.warehouse_location}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {job ? (
                          <Link href={`/jobs/${job.id}`} className="text-blue-700 hover:underline">
                            {job.job_number || 'JOB'} — {job.project_name}
                          </Link>
                        ) : (
                          'Job'
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Crew: <strong>{ticket.assigned_crew || 'Unassigned'}</strong> • Shift:{' '}
                        {ticket.work_shift} • {ticket.poCount} POs
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintTicket(ticket)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Pull Sheet</span>
                      </button>
                      {job && job.warehouse_status !== 'loaded_out' && (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateStaging(job.id, {
                              warehouseStatus: 'loaded_out',
                              loadedBy: staffName || 'Warehouse',
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Mark Loaded Out</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 4: STOCK INVENTORY */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLowStockOnly(!lowStockOnly)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    lowStockOnly
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  Low Stock Only ({lowStockCount})
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowNewSkuModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Stock SKU</span>
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
              {filteredInventory.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No stock inventory items yet. Click &quot;Add Stock SKU&quot; to add Division 10 stock.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="text-left px-4 py-3">SKU</th>
                        <th className="text-left px-4 py-3">Item / Manufacturer</th>
                        <th className="text-left px-4 py-3">Category / Bin</th>
                        <th className="text-right px-4 py-3">On Hand</th>
                        <th className="text-right px-4 py-3">Reorder Pt</th>
                        <th className="text-right px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInventory.map((it) => {
                        const isLow =
                          Number(it.quantity_on_hand || 0) <= Number(it.reorder_point || 0);
                        return (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-mono font-bold">{it.sku}</td>
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-900">{it.name}</div>
                              {it.manufacturer && (
                                <div className="text-[11px] text-slate-500">{it.manufacturer}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                                {it.category}
                              </span>
                              {it.bin_location && (
                                <span className="ml-2 text-slate-600 font-mono">
                                  Bin: {it.bin_location}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold">
                              <span className={isLow ? 'text-rose-700' : 'text-slate-900'}>
                                {it.quantity_on_hand} {it.unit}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">
                              {it.reorder_point} {it.unit}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMovementItem(it);
                                    setMovementType('receive');
                                  }}
                                  className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <ArrowDownToLine className="w-3 h-3" /> Receive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMovementItem(it);
                                    setMovementType('pull_to_job');
                                  }}
                                  className="px-2 py-1 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <ArrowUpFromLine className="w-3 h-3" /> Pull to Job
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {stockMovements.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
                <h2 className="text-xs font-extrabold uppercase text-slate-500">
                  Recent Stock Movements
                </h2>
                <div className="divide-y divide-slate-100 text-xs">
                  {stockMovements.slice(0, 12).map((m) => (
                    <div key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold">{m.inventory?.sku}</span>{' '}
                        <span className="text-slate-700">{m.inventory?.name}</span>
                        {m.job && (
                          <span className="ml-2 text-blue-700 font-semibold">
                            → {m.job.job_number} {m.job.project_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-extrabold ${
                            Number(m.quantity_delta) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {Number(m.quantity_delta) >= 0 ? '+' : ''}
                          {m.quantity_delta}
                        </span>
                        <span className="text-slate-500">{m.movement_type}</span>
                        <span className="text-slate-400">
                          {new Date(m.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* RECEIVE DELIVERY MODAL */}
      {receivingPo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
          <form
            onSubmit={handleSubmitReceipt}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Receive PO {receivingPo.po_number}
                </h2>
                <p className="text-xs text-slate-500">
                  {receivingPo.vendor} • {receivingPo.job?.job_number}{' '}
                  {receivingPo.job?.project_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Packing Slip #</label>
                <input
                  type="text"
                  value={rcvPackingSlip}
                  onChange={(e) => setRcvPackingSlip(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Carrier</label>
                <input
                  type="text"
                  value={rcvCarrier}
                  onChange={(e) => setRcvCarrier(e.target.value)}
                  placeholder="FedEx, Estes, R+L..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Staging Bay / Zone</label>
                <select
                  value={rcvBayPreset}
                  onChange={(e) => setRcvBayPreset(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  {PRESET_STAGING_BAYS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Location...</option>
                </select>
                {rcvBayPreset === 'CUSTOM' && (
                  <input
                    type="text"
                    value={rcvBayCustom}
                    onChange={(e) => setRcvBayCustom(e.target.value)}
                    placeholder="e.g. Pallet 14"
                    className="w-full mt-1.5 px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 border-b">
                  <tr>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-right px-3 py-2">Ordered</th>
                    <th className="text-right px-3 py-2">Rcvd Now</th>
                    <th className="text-right px-3 py-2">Damaged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rcvLines.map((ln, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">{ln.description}</div>
                        {ln.sku && <div className="text-[10px] font-mono text-slate-500">{ln.sku}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {ln.qtyOrdered}
                        {ln.alreadyReceived > 0 && (
                          <div className="text-[10px] text-emerald-700">
                            ({ln.alreadyReceived} prev)
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={ln.qtyReceived}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setRcvLines((prev) =>
                              prev.map((row, i) => (i === idx ? { ...row, qtyReceived: val } : row))
                            );
                          }}
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={ln.qtyDamaged}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setRcvLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, qtyDamaged: val, condition: val > 0 ? 'damaged' : 'good' }
                                  : row
                              )
                            );
                          }}
                          className="w-16 px-2 py-1 border border-slate-300 rounded text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                Receiving / Damage Notes
              </label>
              <textarea
                rows={2}
                value={rcvNotes}
                onChange={(e) => setRcvNotes(e.target.value)}
                placeholder="Note any short shipments, backorders, or freight damage..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceivingPo(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingReceipt}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>{isSavingReceipt ? 'Saving...' : 'Confirm Receipt & Stage'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NEW STOCK SKU MODAL */}
      {showNewSkuModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
          <form
            onSubmit={handleCreateSku}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 shadow-xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">Add Division 10 Stock SKU</h2>
              <button type="button" onClick={() => setShowNewSkuModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">SKU *</label>
                <input
                  required
                  value={newSku.sku}
                  onChange={(e) => setNewSku({ ...newSku, sku: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Category</label>
                <select
                  value={newSku.category}
                  onChange={(e) => setNewSku({ ...newSku, category: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white"
                >
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">Item Name *</label>
              <input
                required
                value={newSku.name}
                onChange={(e) => setNewSku({ ...newSku, name: e.target.value })}
                className="w-full px-3 py-1.5 border rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Manufacturer</label>
                <input
                  value={newSku.manufacturer}
                  onChange={(e) => setNewSku({ ...newSku, manufacturer: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Bin Location</label>
                <input
                  value={newSku.binLocation}
                  onChange={(e) => setNewSku({ ...newSku, binLocation: e.target.value })}
                  placeholder="Rack B-3"
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-bold block mb-1">Initial Qty</label>
                <input
                  type="number"
                  value={newSku.quantityOnHand}
                  onChange={(e) => setNewSku({ ...newSku, quantityOnHand: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Reorder Pt</label>
                <input
                  type="number"
                  value={newSku.reorderPoint}
                  onChange={(e) => setNewSku({ ...newSku, reorderPoint: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">Unit</label>
                <input
                  value={newSku.unit}
                  onChange={(e) => setNewSku({ ...newSku, unit: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewSkuModal(false)}
                className="px-4 py-2 border rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingSku}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold"
              >
                {isSavingSku ? 'Saving...' : 'Create SKU'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STOCK MOVEMENT MODAL */}
      {movementItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:hidden">
          <form
            onSubmit={handleSubmitMovement}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 shadow-xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">
                {movementType === 'pull_to_job' ? 'Pull Stock to Job' : 'Receive Stock'}:{' '}
                {movementItem.sku}
              </h2>
              <button type="button" onClick={() => setMovementItem(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600">
              {movementItem.name} • Current On-Hand:{' '}
              <strong>
                {movementItem.quantity_on_hand} {movementItem.unit}
              </strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">Action</label>
                <select
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value as any)}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white"
                >
                  <option value="pull_to_job">Pull to Job (-)</option>
                  <option value="receive">Receive Stock (+)</option>
                  <option value="return">Job Return (+)</option>
                  <option value="adjustment">Cycle Adjustment (+/-)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">Quantity</label>
                <input
                  type="number"
                  required
                  value={movementQty}
                  onChange={(e) => setMovementQty(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg"
                />
              </div>
            </div>
            {movementType === 'pull_to_job' && (
              <div>
                <label className="font-bold block mb-1">Target Job</label>
                <select
                  value={movementJobId}
                  onChange={(e) => setMovementJobId(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white"
                >
                  <option value="">Select Job (optional)...</option>
                  {stagedJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number || 'JOB'} — {j.project_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="font-bold block mb-1">Notes</label>
              <input
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                className="w-full px-3 py-1.5 border rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMovementItem(null)}
                className="px-4 py-2 border rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingMovement}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold"
              >
                {isSavingMovement ? 'Saving...' : 'Save Movement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE PULL SHEET MODAL */}
      {printTicket && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl print:shadow-none print:max-w-none">
            <div className="flex items-center justify-between print:hidden">
              <h2 className="text-base font-extrabold">Warehouse Pull &amp; Load-Out Sheet</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button
                  type="button"
                  onClick={() => setPrintTicket(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="border-b pb-3">
              <div className="text-lg font-black">
                PARTITION PLUS — WAREHOUSE PULL SHEET
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Job: <strong>{printTicket.job?.job_number} — {printTicket.job?.project_name}</strong> |
                Staging Bay: <strong>{printTicket.job?.warehouse_location || 'TBD'}</strong>
              </div>
              <div className="text-xs text-slate-600">
                Install Date: <strong>{printTicket.confirmed_install_date || printTicket.requested_install_date}</strong> |
                Crew: <strong>{printTicket.assigned_crew || 'Unassigned'}</strong>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold uppercase text-slate-500">Job Scope Items to Load</div>
              <table className="w-full border border-slate-300">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-2 py-1.5 border-b">Check</th>
                    <th className="text-left px-2 py-1.5 border-b">SKU / Mfr</th>
                    <th className="text-left px-2 py-1.5 border-b">Description</th>
                    <th className="text-right px-2 py-1.5 border-b">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(printTicket.job?.line_items) ? printTicket.job.line_items : []).map(
                    (it: any, idx: number) => (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1.5">[ &nbsp; ]</td>
                        <td className="px-2 py-1.5 font-mono">
                          {it.manufacturer || ''} {it.sku || ''}
                        </td>
                        <td className="px-2 py-1.5">{it.description}</td>
                        <td className="px-2 py-1.5 text-right font-bold">{it.quantity || 1}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-4 grid grid-cols-2 gap-6 text-xs">
              <div className="border-t border-slate-400 pt-1">Pulled By / Date</div>
              <div className="border-t border-slate-400 pt-1">Installer Sign-Off / Date</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
