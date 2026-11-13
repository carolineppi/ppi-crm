'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Sparkles,
  ShoppingCart,
  Plus,
  Minus,
  Printer,
  Save,
  X,
} from 'lucide-react';
import {
  PARENT_CATEGORIES,
  getParentCategoryId,
  getSubCategoryShortLabel,
} from '@/lib/pricing/category-hierarchy';
import QuotePrintModal, { QuoteCartItem } from '@/components/QuotePrintModal';

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

  // Auto-tagging & staggered category groups
  const [equivGroups, setEquivGroups] = useState<Array<{ group: string; count: number }>>([]);
  const [untaggedCount, setUntaggedCount] = useState<number>(0);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [selectedParentCat, setSelectedParentCat] = useState<string>('ALL');

  // Quote Cart & Job Linking
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [cartId, setCartId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<QuoteCartItem[]>([]);
  const [linkedBidId, setLinkedBidId] = useState<string>('');
  const [cartTitle, setCartTitle] = useState('Job Material Quote');
  const [cartMarkup, setCartMarkup] = useState<string>('0');
  const [cartNotes, setCartNotes] = useState<string>('');
  const [isSavingCart, setIsSavingCart] = useState(false);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [cartTab, setCartTab] = useState<'active' | 'saved'>('active');
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [bidsList, setBidsList] = useState<Array<{ id: string; bid_number: string | null; project_name: string | null; email_subject: string; client_company: string | null; estimator_status: string | null }>>([]);
  const [savedCarts, setSavedCarts] = useState<any[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [bidSwitchedToQuoted, setBidSwitchedToQuoted] = useState(false);
  const [printSnapshot, setPrintSnapshot] = useState<{
    quoteTitle: string;
    projectName?: string | null;
    contractorName?: string | null;
    bidNumber?: string | null;
    markupPercent: number;
    notes?: string;
    items: QuoteCartItem[];
    bidSwitchedToQuoted: boolean;
  } | null>(null);
  const [bidLinkSearch, setBidLinkSearch] = useState('');

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

  const fetchItems = useCallback(async (q: string, mfg: string, equiv: string, parentCatId: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (mfg && mfg !== 'ALL') params.set('manufacturer', mfg);
      if (equiv) {
        params.set('equivalentGroup', equiv);
      } else if (parentCatId === 'untagged') {
        params.set('equivalentGroup', '__UNTAGGED__');
      } else if (parentCatId !== 'ALL') {
        const matchingGroups = equivGroups
          .filter((g) => getParentCategoryId(g.group) === parentCatId)
          .map((g) => g.group);
        if (matchingGroups.length > 0) {
          params.set('equivalentGroups', matchingGroups.join('||'));
        }
      }
      params.set('limit', '120');

      const res = await fetch(`/api/pricing/search?${params.toString()}`);
      const data = await res.json();
      if (data.items) setItems(data.items);
    } finally {
      setIsSearching(false);
    }
  }, [equivGroups]);

  const fetchBidsAndCarts = useCallback(async () => {
    try {
      const [bidsRes, cartsRes] = await Promise.all([
        fetch('/api/bid-requests?summary=1'),
        fetch('/api/pricing/cart'),
      ]);
      const bidsData = await bidsRes.json();
      if (bidsData.bidRequests) {
        setBidsList(
          bidsData.bidRequests.filter(
            (b: any) => b.filter_status !== 'auto_filtered' && b.filter_status !== 'duplicate_folder'
          )
        );
      }
      const cartsData = await cartsRes.json();
      if (cartsData.carts) setSavedCarts(cartsData.carts);
    } catch (err) {
      console.error('Failed to load bids/carts:', err);
    }
  }, []);

  useEffect(() => {
    fetchBooks();
    fetchGroups();
    fetchBidsAndCarts();
    if (typeof window !== 'undefined') {
      const bidIdParam = new URLSearchParams(window.location.search).get('bidId');
      if (bidIdParam) {
        setLinkedBidId(bidIdParam);
        setShowCartDrawer(true);
        fetch(`/api/pricing/cart?bidId=${encodeURIComponent(bidIdParam)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.cart) {
              setCartId(d.cart.id);
              setCartTitle(d.cart.title || 'Job Material Quote');
              setCartMarkup(String(d.cart.markup_percent ?? 0));
              setCartNotes(d.cart.notes || '');
              setCartItems(Array.isArray(d.cart.items) ? d.cart.items : []);
            }
          })
          .finally(() => setCartHydrated(true));
      } else {
        try {
          const raw = localStorage.getItem('ppi_active_quote_cart_v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              if (parsed.cartId) setCartId(parsed.cartId);
              if (parsed.linkedBidId) setLinkedBidId(parsed.linkedBidId);
              if (parsed.cartTitle) setCartTitle(parsed.cartTitle);
              if (parsed.cartMarkup !== undefined) setCartMarkup(String(parsed.cartMarkup));
              if (parsed.cartNotes !== undefined) setCartNotes(parsed.cartNotes);
              if (Array.isArray(parsed.cartItems)) setCartItems(parsed.cartItems);
            }
          }
        } catch {
          // ignore corrupted localStorage
        }
        setCartHydrated(true);
      }
    }
  }, [fetchBooks, fetchGroups, fetchBidsAndCarts]);

  useEffect(() => {
    if (!cartHydrated || typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        'ppi_active_quote_cart_v1',
        JSON.stringify({
          cartId,
          linkedBidId,
          cartTitle,
          cartMarkup,
          cartNotes,
          cartItems,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [cartHydrated, cartId, linkedBidId, cartTitle, cartMarkup, cartNotes, cartItems]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat, fetchItems]);

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
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
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
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
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
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
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
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
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
      await fetchItems(searchQuery, selectedMfg, selectedEquivGroup, selectedParentCat);
    }
  };

  // Cart Helpers
  const addToCart = (item: PriceItem) => {
    const unitCost = Number(item.effective_net_price ?? item.list_price ?? 0);
    setCartItems((prev) => {
      const idx = prev.findIndex((c) => c.priceItemId === item.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          priceItemId: item.id,
          manufacturer: item.manufacturer,
          sku: item.sku,
          description: item.description,
          quantity: 1,
          unitCost,
        },
      ];
    });
  };

  const updateCartQty = (priceItemId: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((c) => c.priceItemId !== priceItemId));
      return;
    }
    setCartItems((prev) =>
      prev.map((c) => (c.priceItemId === priceItemId ? { ...c, quantity: qty } : c))
    );
  };

  const draftCarts = savedCarts.filter((c) => c.status === 'draft');

  const clearActiveCart = () => {
    setCartId(null);
    setCartItems([]);
    setLinkedBidId('');
    setCartTitle('Job Material Quote');
    setCartMarkup('0');
    setCartNotes('');
    setBidLinkSearch('');
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('ppi_active_quote_cart_v1');
      } catch {
        // ignore
      }
    }
  };

  const saveOrPrintCart = async (mode: 'draft' | 'quoted', overrideCart?: any) => {
    const targetItems: QuoteCartItem[] = overrideCart
      ? Array.isArray(overrideCart.items)
        ? overrideCart.items
        : []
      : cartItems;
    if (targetItems.length === 0) return;

    const targetId = overrideCart ? overrideCart.id : cartId;
    const targetBidId = overrideCart ? overrideCart.bid_request_id || '' : linkedBidId;
    const targetTitle = overrideCart ? overrideCart.title || 'Job Material Quote' : cartTitle;
    const targetMarkup = overrideCart ? Number(overrideCart.markup_percent ?? 0) : Number(cartMarkup) || 0;
    const targetNotes = overrideCart ? overrideCart.notes || '' : cartNotes;
    const targetBid = bidsList.find((b) => b.id === targetBidId);

    setIsSavingCart(true);
    setBidSwitchedToQuoted(false);
    try {
      const res = await fetch('/api/pricing/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: targetId,
          bidRequestId: targetBidId || null,
          title: targetTitle,
          markupPercent: targetMarkup,
          notes: targetNotes,
          items: targetItems,
          status: mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(`Error: ${data.error || 'Failed to save quote cart'}`);
        return;
      }

      if (mode === 'quoted') {
        const switched = Boolean(targetBidId);
        setBidSwitchedToQuoted(switched);
        setPrintSnapshot({
          quoteTitle: targetTitle,
          projectName: targetBid?.project_name || targetBid?.email_subject,
          contractorName: targetBid?.client_company,
          bidNumber: targetBid?.bid_number,
          markupPercent: targetMarkup,
          notes: targetNotes,
          items: targetItems,
          bidSwitchedToQuoted: switched,
        });
        setShowPrintModal(true);
      } else {
        setStatusMessage('Bid saved to Saved Bids and active cart cleared.');
      }

      if (!overrideCart || overrideCart.id === cartId) {
        clearActiveCart();
      }
      await fetchBidsAndCarts();
    } finally {
      setIsSavingCart(false);
    }
  };

  const handleUploadRevisionPdf = async (file: File) => {
    setIsParsingPdf(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/pricing/parse-quote-pdf', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage(`Error: ${data.error || 'Failed to read PDF quote'}`);
        return;
      }
      const parsedItems: QuoteCartItem[] = Array.isArray(data.items) ? data.items : [];
      if (parsedItems.length === 0) {
        setStatusMessage('No line items were detected in that PDF quote.');
        return;
      }
      setCartId(null);
      setCartTitle(data.title || file.name.replace(/\.pdf$/i, '') || 'Revised Quote');
      setCartNotes(data.notes || '');
      setCartItems(parsedItems);
      if (data.bidNumber) {
        const matchedBid = bidsList.find(
          (b) => b.bid_number && b.bid_number.toLowerCase() === String(data.bidNumber).toLowerCase()
        );
        if (matchedBid) setLinkedBidId(matchedBid.id);
      }
      setCartTab('active');
      setStatusMessage(`Loaded ${parsedItems.length} line item(s) from PDF into the active cart for revision.`);
    } finally {
      setIsParsingPdf(false);
    }
  };

  const parentCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of equivGroups) {
      const pid = getParentCategoryId(g.group);
      counts[pid] = (counts[pid] || 0) + g.count;
    }
    return counts;
  }, [equivGroups]);

  const activeSubGroups = useMemo(() => {
    if (selectedParentCat === 'ALL' || selectedParentCat === 'untagged') return [];
    return equivGroups.filter((g) => getParentCategoryId(g.group) === selectedParentCat);
  }, [equivGroups, selectedParentCat]);

  const totalCartQty = useMemo(
    () => cartItems.reduce((sum, it) => sum + it.quantity, 0),
    [cartItems]
  );

  const cartSubtotalCost = useMemo(
    () => cartItems.reduce((sum, it) => sum + it.unitCost * it.quantity, 0),
    [cartItems]
  );

  const linkedBid = useMemo(
    () => bidsList.find((b) => b.id === linkedBidId) || null,
    [bidsList, linkedBidId]
  );

  const filteredBidsForLink = useMemo(() => {
    const q = bidLinkSearch.trim().toLowerCase();
    if (!q) return bidsList.slice(0, 30);
    return bidsList
      .filter((b) => {
        const num = (b.bid_number || '').toLowerCase();
        const proj = (b.project_name || '').toLowerCase();
        const subj = (b.email_subject || '').toLowerCase();
        const gc = (b.client_company || '').toLowerCase();
        return num.includes(q) || proj.includes(q) || subj.includes(q) || gc.includes(q);
      })
      .slice(0, 40);
  }, [bidsList, bidLinkSearch]);

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
              onClick={() => setShowCartDrawer(true)}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Quote Cart ({totalCartQty})</span>
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

          {/* Staggered 2-Level Store Category Filter */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            {/* Level 1: Broad Category Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                Category:
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedParentCat('ALL');
                  setSelectedEquivGroup('');
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                  selectedParentCat === 'ALL' && !selectedEquivGroup
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All Categories
              </button>
              {PARENT_CATEGORIES.map((cat) => {
                const cnt = parentCategoryCounts[cat.id] || 0;
                if (cnt === 0) return null;
                const isSelected = selectedParentCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedParentCat(isSelected ? 'ALL' : cat.id);
                      setSelectedEquivGroup('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cat.label} ({cnt})
                  </button>
                );
              })}
              {untaggedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedParentCat(selectedParentCat === 'untagged' ? 'ALL' : 'untagged');
                    setSelectedEquivGroup('');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                    selectedParentCat === 'untagged'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Untagged ({untaggedCount})
                </button>
              )}
            </div>

            {/* Level 2: Staggered Sub-Category Facets */}
            {activeSubGroups.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pl-3 border-l-2 border-blue-300 bg-blue-50/40 p-2 rounded-r-xl">
                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider mr-1">
                  Narrow Down:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedEquivGroup('')}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${
                    !selectedEquivGroup
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  All in Category
                </button>
                {activeSubGroups.map((g) => (
                  <button
                    key={g.group}
                    type="button"
                    onClick={() =>
                      setSelectedEquivGroup(selectedEquivGroup === g.group ? '' : g.group)
                    }
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${
                      selectedEquivGroup === g.group
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    {getSubCategoryShortLabel(g.group)} ({g.count})
                  </button>
                ))}
              </div>
            )}
          </div>

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
                  <th className="py-2.5 px-3 text-right">Quote Cart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
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
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {(() => {
                            const inCart = cartItems.find((c) => c.priceItemId === item.id);
                            return (
                              <button
                                type="button"
                                onClick={() => addToCart(item)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors inline-flex items-center gap-1 ${
                                  inCart
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                    : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-500'
                                }`}
                              >
                                <Plus className="w-3 h-3" />
                                <span>{inCart ? `In Cart (${inCart.quantity})` : 'Add'}</span>
                              </button>
                            );
                          })()}
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

      {/* Slide-Over Job Quote Cart Drawer */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-sm font-bold">Job Quote Cart ({totalCartQty} items)</h2>
                  <p className="text-[11px] text-slate-400">
                    Link to a job, save draft, or print PDF quote
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCartDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Active Cart vs Saved Bids Tabs & PDF Revision Upload */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCartTab('active')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                      cartTab === 'active'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active Cart ({cartItems.reduce((sum, it) => sum + it.quantity, 0)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCartTab('saved')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition ${
                      cartTab === 'saved'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Saved Bids ({draftCarts.length})
                  </button>
                </div>
                {cartTab === 'active' && (cartItems.length > 0 || cartId || linkedBidId) && (
                  <button
                    type="button"
                    onClick={clearActiveCart}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Clear Cart
                  </button>
                )}
              </div>

              <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer transition">
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>{isParsingPdf ? 'Reading Printed PDF Quote...' : 'Upload Printed PDF Bid for Revision'}</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={isParsingPdf}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleUploadRevisionPdf(file);
                  }}
                />
              </label>

              {cartTab === 'saved' ? (
                <div className="space-y-2.5">
                  {draftCarts.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                      No saved draft bids yet. Save an active cart to hold it here, or print a saved bid to mark it Bid Submitted and remove it from this list.
                    </div>
                  ) : (
                    draftCarts.map((c) => {
                      const itemsArr: QuoteCartItem[] = Array.isArray(c.items) ? c.items : [];
                      const bidObj = bidsList.find((b) => b.id === c.bid_request_id);
                      const costSum = itemsArr.reduce((sum, it) => sum + it.unitCost * it.quantity, 0);
                      const quoteSum = costSum * (1 + (Number(c.markup_percent ?? 0) || 0) / 100);
                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{c.title}</div>
                              <div className="text-[11px] text-slate-500">
                                {itemsArr.length} lines • Quote Total: <strong>{formatCurrency(quoteSum)}</strong>
                              </div>
                              {bidObj && (
                                <div className="text-[11px] text-emerald-700 font-semibold truncate mt-0.5">
                                  Bid {bidObj.bid_number ? `#${bidObj.bid_number}` : ''} — {bidObj.project_name || bidObj.email_subject}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCartId(c.id);
                                setLinkedBidId(c.bid_request_id || '');
                                setCartTitle(c.title || 'Job Material Quote');
                                setCartMarkup(String(c.markup_percent ?? 0));
                                setCartNotes(c.notes || '');
                                setCartItems(itemsArr);
                                setCartTab('active');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-[11px] font-bold"
                            >
                              Load into Cart
                            </button>
                            <button
                              type="button"
                              disabled={isSavingCart || itemsArr.length === 0}
                              onClick={() => saveOrPrintCart('quoted', c)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Print / PDF</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <>

              {/* Link to Job / Bid (Searchable by Bid # or Name) */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase text-slate-500">
                  Link to Bid / Job (Printing marks bid as Bid Submitted)
                </label>

                {linkedBid ? (
                  <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-300 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-blue-900 truncate">
                        {linkedBid.bid_number ? `[${linkedBid.bid_number}] ` : ''}
                        {linkedBid.project_name || linkedBid.email_subject}
                      </div>
                      {linkedBid.client_company && (
                        <div className="text-[11px] text-blue-700 truncate">
                          {linkedBid.client_company}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkedBidId('');
                        setBidLinkSearch('');
                      }}
                      className="px-2 py-1 rounded-lg bg-white border border-blue-200 text-[11px] font-bold text-blue-800 hover:bg-blue-100 flex-shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={bidLinkSearch}
                        onChange={(e) => setBidLinkSearch(e.target.value)}
                        placeholder="Search by Bid # (e.g. 2026-001) or bid/project name..."
                        className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {bidLinkSearch && (
                        <button
                          type="button"
                          onClick={() => setBidLinkSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                      {filteredBidsForLink.length === 0 ? (
                        <div className="p-2.5 text-center text-[11px] text-slate-400">
                          No matching bids found.
                        </div>
                      ) : (
                        filteredBidsForLink.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              setLinkedBidId(b.id);
                              setCartTitle(b.project_name || b.email_subject || 'Job Material Quote');
                              setBidLinkSearch('');
                            }}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 transition-colors"
                          >
                            <div className="font-semibold text-slate-900 truncate">
                              {b.bid_number ? (
                                <span className="font-mono text-blue-700 mr-1.5">[{b.bid_number}]</span>
                              ) : null}
                              {b.project_name || b.email_subject}
                            </div>
                            {b.client_company && (
                              <div className="text-[10px] text-slate-500 truncate">
                                {b.client_company}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Quote Title
                  </label>
                  <input
                    type="text"
                    value={cartTitle}
                    onChange={(e) => setCartTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Markup %
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={cartMarkup}
                    onChange={(e) => setCartMarkup(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono"
                  />
                </div>
              </div>

              {/* Cart Items */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Items in Quote ({cartItems.length} lines)
                </div>
                {cartItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl">
                    Click <strong>+ Add</strong> on any product in the price book to build this job&apos;s quote.
                  </div>
                ) : (
                  cartItems.map((it) => {
                    const sellUnit = it.unitCost * (1 + (Number(cartMarkup) || 0) / 100);
                    return (
                      <div
                        key={it.priceItemId}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900">
                            {it.manufacturer} • <span className="font-mono">{it.sku}</span>
                          </div>
                          <div className="text-[11px] text-slate-600 truncate">{it.description}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Net: {formatCurrency(it.unitCost)} → Quote: <strong>{formatCurrency(sellUnit)}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(it.priceItemId, it.quantity - 1)}
                            className="p-1 rounded bg-white border border-slate-300 hover:bg-slate-100"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => updateCartQty(it.priceItemId, Number(e.target.value) || 1)}
                            className="w-11 text-center font-bold py-0.5 border border-slate-300 rounded bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(it.priceItemId, it.quantity + 1)}
                            className="p-1 rounded bg-white border border-slate-300 hover:bg-slate-100"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCartQty(it.priceItemId, 0)}
                            className="p-1 text-slate-400 hover:text-rose-600 ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  Quote Notes / Clarifications
                </label>
                <textarea
                  rows={2}
                  value={cartNotes}
                  onChange={(e) => setCartNotes(e.target.value)}
                  placeholder="e.g. Furnish Only — Freight Included, Lead time 2-3 weeks..."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
              </div>
                </>
              )}
            </div>

            {/* Cart Footer */}
            {cartTab === 'active' && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Material Cost: {formatCurrency(cartSubtotalCost)}</span>
                  <span className="text-sm font-black text-slate-900">
                    Quote Total: {formatCurrency(cartSubtotalCost * (1 + (Number(cartMarkup) || 0) / 100))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSavingCart || cartItems.length === 0}
                    onClick={() => saveOrPrintCart('draft')}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save for Later</span>
                  </button>
                  <button
                    type="button"
                    disabled={isSavingCart || cartItems.length === 0}
                    onClick={() => saveOrPrintCart('quoted')}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / PDF Quote</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <QuotePrintModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        quoteTitle={printSnapshot?.quoteTitle ?? cartTitle}
        projectName={printSnapshot?.projectName ?? (linkedBid?.project_name || linkedBid?.email_subject)}
        contractorName={printSnapshot?.contractorName ?? linkedBid?.client_company}
        bidNumber={printSnapshot?.bidNumber ?? linkedBid?.bid_number}
        markupPercent={printSnapshot?.markupPercent ?? (Number(cartMarkup) || 0)}
        notes={printSnapshot?.notes ?? cartNotes}
        items={printSnapshot?.items ?? cartItems}
        bidSwitchedToQuoted={printSnapshot?.bidSwitchedToQuoted ?? bidSwitchedToQuoted}
      />
    </div>
  );
}
