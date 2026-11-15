export interface QuoteCartItem {
  priceItemId: string;
  manufacturer: string;
  sku: string;
  description: string;
  quantity: number;
  unitCost: number;
  section?: string;
  unitLabel?: string;
}

export interface QuoteSectionAddon {
  id: string;
  label: string;
  amount: number;
}

export type QuoteSectionPricingMode = 'furnish_only_plus_install' | 'furnish_and_install';

export interface QuoteSectionConfig {
  id: string;
  name: string;
  notes?: string;
  pricingMode: QuoteSectionPricingMode;
  markupPercent: number;
  freight: number;
  taxPercent: number;
  installCost: number;
  materialSellOverride?: number | null;
  addons?: QuoteSectionAddon[];
}

export const DEFAULT_SCOPE_PRESETS = [
  'Toilet Accessories',
  'Toilet Partitions',
  'Fire Protection',
  'Lockers',
  'Mirrors & Specialties',
];

export function createDefaultSection(
  name: string,
  markupPercent = 0
): QuoteSectionConfig {
  return {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'General',
    notes: '',
    pricingMode:
      name.toLowerCase().includes('partition')
        ? 'furnish_and_install'
        : 'furnish_only_plus_install',
    markupPercent,
    freight: 0,
    taxPercent: 0,
    installCost: 0,
    materialSellOverride: null,
    addons: [],
  };
}

export interface SectionTotals {
  materialCost: number;
  freight: number;
  calculatedMaterialSell: number;
  furnishSell: number;
  installSell: number;
  addonsTotal: number;
  sectionTotal: number;
}

export function computeSectionTotals(
  section: Partial<QuoteSectionConfig> | undefined,
  items: QuoteCartItem[],
  fallbackMarkupPercent = 0
): SectionTotals {
  const materialCost = items.reduce(
    (sum, it) => sum + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0),
    0
  );
  const freight = Number(section?.freight) || 0;
  const taxRate = (Number(section?.taxPercent) || 0) / 100;
  const markupRate =
    (Number(section?.markupPercent ?? fallbackMarkupPercent) || 0) / 100;

  const baseCost = materialCost + freight;
  const calculatedMaterialSell = baseCost * (1 + taxRate) * (1 + markupRate);
  const furnishSell =
    section?.materialSellOverride !== null &&
    section?.materialSellOverride !== undefined &&
    Number.isFinite(Number(section.materialSellOverride))
      ? Number(section.materialSellOverride)
      : calculatedMaterialSell;
  const installSell = Number(section?.installCost) || 0;
  const addonsTotal = (section?.addons || []).reduce(
    (sum, a) => sum + (Number(a.amount) || 0),
    0
  );
  const sectionTotal = furnishSell + installSell + addonsTotal;

  return {
    materialCost,
    freight,
    calculatedMaterialSell,
    furnishSell,
    installSell,
    addonsTotal,
    sectionTotal,
  };
}

export function groupItemsBySection(
  items: QuoteCartItem[],
  sections: QuoteSectionConfig[],
  fallbackMarkupPercent = 0
): Array<{
  sectionName: string;
  config: QuoteSectionConfig;
  items: QuoteCartItem[];
  totals: SectionTotals;
}> {
  const configByName = new Map<string, QuoteSectionConfig>();
  const orderedNames: string[] = [];

  for (const sec of sections) {
    const key = (sec.name || 'General').trim() || 'General';
    if (!configByName.has(key)) {
      configByName.set(key, sec);
      orderedNames.push(key);
    }
  }

  const itemsBySection = new Map<string, QuoteCartItem[]>();
  for (const it of items) {
    const key = (it.section || orderedNames[0] || 'General').trim() || 'General';
    if (!itemsBySection.has(key)) {
      itemsBySection.set(key, []);
    }
    itemsBySection.get(key)!.push(it);
    if (!orderedNames.includes(key)) {
      orderedNames.push(key);
    }
  }

  return orderedNames
    .map((name) => {
      const secItems = itemsBySection.get(name) || [];
      const config =
        configByName.get(name) || createDefaultSection(name, fallbackMarkupPercent);
      return {
        sectionName: name,
        config,
        items: secItems,
        totals: computeSectionTotals(config, secItems, fallbackMarkupPercent),
      };
    })
    .filter((group) => group.items.length > 0 || configByName.has(group.sectionName));
}

export interface JobLineItemFromCart {
  id: string;
  lineNumber: number;
  manufacturer: string;
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  section?: string;
  isAddon?: boolean;
  addonStatus?: 'pending' | 'approved' | 'declined';
}

/**
 * Converts a saved job_quote_carts record into Job Scope Line Items,
 * respecting section-level Furnish Sell Overrides (materialSellOverride)
 * so overridden lump-sum packages never transfer as $0 items.
 */
export function buildJobLineItemsFromQuoteCart(cart: any): {
  lineItems: JobLineItemFromCart[];
  quoteTotal: number;
} {
  const itemsArr: QuoteCartItem[] = Array.isArray(cart?.items) ? cart.items : [];
  const sectionsArr: QuoteSectionConfig[] = Array.isArray(cart?.sections) ? cart.sections : [];
  const fallbackMarkup = Number(cart?.markup_percent ?? 0) || 0;

  if (sectionsArr.length === 0) {
    const mult = 1 + fallbackMarkup / 100;
    const lineItems: JobLineItemFromCart[] = itemsArr.map((it: any, idx: number) => ({
      id: it.priceItemId || `cart-${idx + 1}`,
      lineNumber: idx + 1,
      manufacturer: it.manufacturer || '',
      sku: it.sku || '',
      description: it.description || '',
      quantity: Math.max(1, Number(it.quantity) || 1),
      unit: it.unitLabel || 'EA',
      unitPrice: Math.round((Number(it.unitCost) || 0) * mult * 100) / 100,
      section: it.section || undefined,
    }));
    const quoteTotal =
      Math.round(
        lineItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0) * 100
      ) / 100;
    return { lineItems, quoteTotal };
  }

  const grouped = groupItemsBySection(itemsArr, sectionsArr, fallbackMarkup);
  const lineItems: JobLineItemFromCart[] = [];
  let quoteTotal = 0;
  let lineCounter = 1;

  for (const group of grouped) {
    const { sectionName, config, items: secItems, totals } = group;
    quoteTotal += totals.sectionTotal;

    const totalQty = secItems.reduce(
      (s, it) => s + Math.max(1, Number(it.quantity) || 1),
      0
    );
    const hasOverride =
      config.materialSellOverride !== null &&
      config.materialSellOverride !== undefined &&
      Number.isFinite(Number(config.materialSellOverride));

    const targetMaterialSell = hasOverride
      ? totals.furnishSell
      : totals.calculatedMaterialSell;

    for (let idx = 0; idx < secItems.length; idx++) {
      const it = secItems[idx];
      const qty = Math.max(1, Number(it.quantity) || 1);
      const itemCost = Number(it.unitCost) || 0;

      let unitPrice = 0;
      if (totals.materialCost > 0) {
        unitPrice =
          Math.round(itemCost * (targetMaterialSell / totals.materialCost) * 100) / 100;
      } else if (targetMaterialSell > 0 && totalQty > 0) {
        // Items had $0 individual cost and a section override was entered for the full set
        unitPrice = Math.round((targetMaterialSell / totalQty) * 100) / 100;
      }

      lineItems.push({
        id: it.priceItemId || `cart-${lineCounter}`,
        lineNumber: lineCounter++,
        manufacturer: it.manufacturer || '',
        sku: it.sku || '',
        description: it.description || '',
        quantity: qty,
        unit: it.unitLabel || 'EA',
        unitPrice,
        section: sectionName,
      });
    }

    for (const addon of config.addons || []) {
      if (!addon?.label?.trim()) continue;
      lineItems.push({
        id: addon.id || `addon-${lineCounter}`,
        lineNumber: lineCounter++,
        manufacturer: 'Optional Add-On',
        sku: 'ADDON',
        description: addon.label.trim(),
        quantity: 1,
        unit: 'EA',
        unitPrice: Math.round((Number(addon.amount) || 0) * 100) / 100,
        section: sectionName,
        isAddon: true,
        addonStatus: 'pending',
      });
    }
  }

  return {
    lineItems,
    quoteTotal: Math.round(quoteTotal * 100) / 100,
  };
}
