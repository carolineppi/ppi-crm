'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  Search,
  DollarSign,
  Trash2,
  Check,
  Loader2,
  Tag,
  TrendingDown,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface PriceBook {
  id: string;
  manufacturer: string;
  book_name: string;
  effective_date: string | null;
  default_multiplier: number;
  item_count: number;
  created_at: string;
}

interface PriceItem {
  id: string;
  price_book_id: string;
  manufacturer: string;
  sku: string;
  alt_sku: string | null;
  description: string;
  category: string | null;
  list_price: number | null;
  distributor_net_price: number | null;
  multiplier: number;
  effective_net_price: number | null;
  map_price: number | null;
  shipping_flat_rate: number | null;
  availability: string | null;
  effective_date: string | null;
  equivalent_group: string | null;
}

const MFG_BADGES: Record<string, string> = {
  Bobrick: 'bg-blue-100 text-blue-800 border-blue-300',
  ASI: 'bg-purple-100 text-purple-800 border-purple-300',
  Bradley: 'bg-amber-100 text-amber-800 border-amber-300',
  Sova: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getFreshnessBadge(dateStr: string | null) {
  if (!dateStr) return { label: 'No Date', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 90) return { label: dateStr, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (days <= 180) return { label: `${dateStr} (Aging)`, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: `${dateStr} (Verify)`, cls: 'bg-rose-50 text-rose-700 border-rose-200' };
}

export default function PricingPage() {
  const [books, setBooks] = useState<PriceBook[]>([]);
  const [items, setItems] = useState<PriceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMfg, setSelectedMfg] = useState('ALL');
  const [selectedEquivGroup, setSelectedEquivGroup] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMfg, setUploadMfg] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const [uploadMultiplier, setUploadMultiplier] = useState('1.0');
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Multiplier editing
  const [editingBookMult, setEditingBookMult] = useState<Record<string, string>>({});
  const [editingEquivItemId, setEditingEquivItemId] = useState<string | null>(null);
  const [equivInput, setEquivInput] = useState('');

  // Auto-tagging & category groups
  const [equivGroups, setEquivGroups] = useState<Array<{ group: string; count: number }>>([]);
  const [untaggedCount, setUntaggedCount] = useState<number>(0);
  const [isAutoTagging, setIsAutoTagging] = useState(false);

  const fetchBooks = useCallback(async () => {
    const res = await fetch('/api/pricing/books');
    const data = await res.json();
    if (data.books) setBooks(data.books);
  }, []);

  const fetchGroups = useCallback(async () => {
    const res = await fetch('/api/pricing/auto-tag');
    const data = await res.json();
    if (data.groups) setEquivGroups(data.groups);
    if (typeof data.untaggedCount === 'number') setUntaggedCount(data.untaggedCount);
  }, []);

  const fetchItems = useCallback(async (q: string, mfg: string, equiv: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (mfg && mfg !== 'ALL') params.set('manufacturer', mfg);
      if (equiv) params.set('equivalentGroup', equiv);
      params.set('limit', '120');

      const res = await fetch(`/api/pricing/search?${params.toString()}`);
      const data = await res.json();
      if (data.items) setItems(data.items);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
    fetchGroups();
  }, [fetchBooks, fetchGroups]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, selectedMfg, selectedEquivGroup, fetchItems]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setStatusMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      if (uploadMfg) fd.append('manufacturer', uploadMfg);
      if (uploadDate) fd.append('effectiveDate', uploadDate);
      fd.append('defaultMultiplier', uploadMultiplier || '1.0');

      const res = await fetch('/api/pricing/import', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(`Error: ${data.error || 'Import failed'}`);
        return;
      }

      setStatusMessage(
        `Imported ${data.importedCount} items for ${data.manufacturer} (${uploadFile.name}).`
      );
      setUploadFile(null);
      setUploadMfg('');
      setUploadDate('');
      setUploadMultiplier('1.0');
      setShowUpload(false);
      await fetchBooks();
      await fetchGroups();
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveBookMultiplier = async (bookId: string) => {
    const val = Number(editingBookMult[bookId]);
    if (!Number.isFinite(val) || val <= 0) return;

    const res = await fetch('/api/pricing/books', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookId, defaultMultiplier: val }),
    });
    if (res.ok) {
      setStatusMessage(`Updated multiplier to ${val} and recalculated net prices.`);
      await fetchBooks();
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    }
  };

  const handleDeleteBook = async (book: PriceBook) => {
    if (!confirm(`Delete ${book.manufacturer} (${book.book_name}) and its ${book.item_count} items?`)) {
      return;
    }
    const res = await fetch(`/api/pricing/books?id=${encodeURIComponent(book.id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setStatusMessage(`Removed ${book.book_name}.`);
      await fetchBooks();
      await fetchGroups();
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    }
  };

  const handleAutoTag = async () => {
    setIsAutoTagging(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/pricing/auto-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useAi: true, aiLimit: 120 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(`Error: ${data.error || 'Auto-tagging failed'}`);
        return;
      }
      setStatusMessage(
        `Preliminary tagging complete: ${data.ruleTaggedCount} rule-tagged, ${data.aiTaggedCount} AI-tagged (${data.remainingUntaggedCount} untagged remaining).`
      );
      await fetchGroups();
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    } finally {
      setIsAutoTagging(false);
    }
  };

  const handleSaveEquivGroup = async (itemId: string) => {
    const res = await fetch('/api/pricing/search', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, equivalentGroup: equivInput.trim() || null }),
    });
    if (res.ok) {
      setEditingEquivItemId(null);
      setEquivInput('');
      await fetchGroups();
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup);
    }
  };

  const manufacturers = ['ALL', ...Array.from(new Set(books.map((b) => b.manufacturer)))];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="bg-slate-900 text-white px-4 sm:px-6 py-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Back to Dispatch & Calendar"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Manufacturer Price Book &amp; Cost Comparison</span>
              </h1>
              <p className="text-xs text-slate-400">
                Search SKUs &amp; specs across all uploaded manufacturer sheets sorted by cheapest net cost
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/estimator"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700"
            >
              Estimator Portal
            </Link>
            <button
              type="button"
              onClick={handleAutoTag}
              disabled={isAutoTagging}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              title="Run AI-assisted granular preliminary tagging on untagged items"
            >
              {isAutoTagging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>{isAutoTagging ? 'Tagging...' : `AI Auto-Tag (${untaggedCount})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUpload((prev) => !prev)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Price Sheet</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {statusMessage && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-900 flex items-center justify-between">
            <span>{statusMessage}</span>
            <button onClick={() => setStatusMessage(null)} className="text-blue-600 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Upload Drawer */}
        {showUpload && (
          <form
            onSubmit={handleUpload}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Import Manufacturer Price Sheet (.xlsx, .csv, .pdf)</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Price Sheet File *</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-slate-50"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Manufacturer</label>
                <input
                  type="text"
                  value={uploadMfg}
                  onChange={(e) => setUploadMfg(e.target.value)}
                  placeholder="Auto-detect (Bobrick, ASI, Bradley, Sova...)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  List Multiplier (e.g. 0.50 or 1.0)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="5"
                  value={uploadMultiplier}
                  onChange={(e) => setUploadMultiplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <label className="font-bold text-slate-700">Effective Date (optional):</label>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-slate-300"
                />
              </div>
              <button
                type="submit"
                disabled={isUploading || !uploadFile}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                <span>{isUploading ? 'Parsing & Importing...' : 'Import Price Sheet'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Loaded Price Books */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Loaded Price Books ({books.length})
            </h2>
          </div>

          {books.length === 0 ? (
            <div className="bg-white p-6 rounded-2xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
              No manufacturer price books uploaded yet. Click <strong>Upload Price Sheet</strong> above to import Excel or PDF pricing.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {books.map((book) => {
                const freshness = getFreshnessBadge(book.effective_date);
                const multVal = editingBookMult[book.id] ?? String(book.default_multiplier);
                return (
                  <div
                    key={book.id}
                    className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between gap-2.5 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            MFG_BADGES[book.manufacturer] || 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {book.manufacturer}
                        </span>
                        <button
                          onClick={() => handleDeleteBook(book)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Delete price book"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="font-bold text-slate-900 truncate" title={book.book_name}>
                        {book.book_name}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{book.item_count.toLocaleString()} items</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${freshness.cls}`}>
                          {freshness.label}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">Multiplier:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="5"
                          value={multVal}
                          onChange={(e) =>
                            setEditingBookMult((prev) => ({ ...prev, [book.id]: e.target.value }))
                          }
                          className="w-16 px-1.5 py-0.5 text-[11px] font-bold border border-slate-300 rounded bg-slate-50 text-right"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveBookMultiplier(book.id)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold"
                          title="Apply multiplier to all list-priced items in this book"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Search & Filter Bar */}
        <section className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU, old SKU, or product (e.g. 'grab bar 36', 'baby changing', 'soap dispenser', '265')..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {manufacturers.map((mfg) => (
                <button
                  key={mfg}
                  type="button"
                  onClick={() => setSelectedMfg(mfg)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    selectedMfg === mfg
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {mfg === 'ALL' ? 'All Manufacturers' : mfg}
                </button>
              ))}
              {selectedEquivGroup && (
                <button
                  type="button"
                  onClick={() => setSelectedEquivGroup('')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300"
                >
                  Group: {selectedEquivGroup === '__UNTAGGED__' ? 'Untagged' : selectedEquivGroup} ✕
                </button>
              )}
            </div>
          </div>

          {/* Granular Category / Equivalent Group Picker */}
          {(equivGroups.length > 0 || untaggedCount > 0) && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Category Group:
              </span>
              <select
                value={selectedEquivGroup}
                onChange={(e) => setSelectedEquivGroup(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 max-w-xs"
              >
                <option value="">All Categories</option>
                {untaggedCount > 0 && (
                  <option value="__UNTAGGED__">Untagged Only ({untaggedCount})</option>
                )}
                {equivGroups.map((g) => (
                  <option key={g.group} value={g.group}>
                    {g.group} ({g.count})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 flex-wrap">
                {equivGroups.slice(0, 8).map((g) => (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() =>
                      setSelectedEquivGroup(selectedEquivGroup === g.group ? '' : g.group)
                    }
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                      selectedEquivGroup === g.group
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    {g.group} ({g.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 font-medium">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
              Sorted by <strong>cheapest effective net cost</strong> first
            </span>
            <span>
              {isSearching ? 'Searching...' : `Showing ${items.length} matching items`}
            </span>
          </div>
        </section>

        {/* Results Table */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-3">Mfg</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Description &amp; Category</th>
                  <th className="py-2.5 px-3 text-right">List Price</th>
                  <th className="py-2.5 px-3 text-right">Mult / Source</th>
                  <th className="py-2.5 px-3 text-right">Net Cost</th>
                  <th className="py-2.5 px-3 text-right">MAP / Ship</th>
                  <th className="py-2.5 px-3">Equivalent Group</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      {books.length === 0
                        ? 'Upload a price sheet to start comparing prices.'
                        : 'No matching items found. Try another SKU or keyword.'}
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    const isCheapest = idx === 0 && item.effective_net_price !== null;
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 ${isCheapest ? 'bg-emerald-50/50' : ''}`}
                      >
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              MFG_BADGES[item.manufacturer] || 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                          >
                            {item.manufacturer}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div>{item.sku}</div>
                          {item.alt_sku && (
                            <div className="text-[10px] text-slate-500 font-normal">
                              Old: {item.alt_sku}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-md">
                          <div className="font-medium text-slate-900">{item.description}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            {item.category && <span>{item.category}</span>}
                            {item.availability && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {item.availability}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                          {formatCurrency(item.list_price)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {item.distributor_net_price !== null ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                              Direct Net
                            </span>
                          ) : (
                            <span className="font-mono text-slate-600">×{item.multiplier}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <span
                            className={`font-mono font-black text-sm ${
                              isCheapest ? 'text-emerald-700' : 'text-slate-900'
                            }`}
                          >
                            {formatCurrency(item.effective_net_price)}
                          </span>
                          {isCheapest && (
                            <div className="text-[9px] font-bold text-emerald-700 uppercase">
                              Cheapest
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-500 whitespace-nowrap">
                          <div>MAP: {formatCurrency(item.map_price)}</div>
                          {item.shipping_flat_rate !== null && (
                            <div>Ship: {formatCurrency(item.shipping_flat_rate)}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {editingEquivItemId === item.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={equivInput}
                                onChange={(e) => setEquivInput(e.target.value)}
                                placeholder="e.g. 36in Grab Bar"
                                className="w-28 px-1.5 py-0.5 text-[11px] border border-blue-300 rounded"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveEquivGroup(item.id)}
                                className="p-1 bg-blue-600 text-white rounded"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </div>
                          ) : item.equivalent_group ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedEquivGroup(item.equivalent_group || '')}
                                className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold hover:bg-indigo-100"
                              >
                                {item.equivalent_group}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingEquivItemId(item.id);
                                  setEquivInput(item.equivalent_group || '');
                                }}
                                className="text-[10px] text-slate-400 hover:text-slate-700"
                              >
                                Edit
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingEquivItemId(item.id);
                                setEquivInput('');
                              }}
                              className="text-[11px] text-slate-400 hover:text-blue-600 flex items-center gap-1"
                            >
                              <Tag className="w-3 h-3" />
                              <span>Tag Group</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
