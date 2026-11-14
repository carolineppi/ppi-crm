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
