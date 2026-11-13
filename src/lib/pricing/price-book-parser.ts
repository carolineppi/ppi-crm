import * as XLSX from 'xlsx';
import { extractText, getDocumentProxy } from 'unpdf';

export interface ParsedPriceItem {
  sku: string;
  altSku?: string | null;
  description: string;
  category?: string | null;
  finishOrColor?: string | null;
  listPrice?: number | null;
  distributorNetPrice?: number | null;
  mapPrice?: number | null;
  shippingFlatRate?: number | null;
  availability?: string | null;
}

export interface ParsedPriceBookResult {
  manufacturer: string;
  effectiveDate: string | null;
  items: ParsedPriceItem[];
}

function parseMoney(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.round(val * 100) / 100;
  }
  const str = String(val).replace(/[$,\s]/g, '').trim();
  if (!str || str === '-' || str === 'N/A') return null;
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

export function detectManufacturer(fileName: string, textSample = ''): string {
  const combined = `${fileName} ${textSample}`.toLowerCase();
  if (combined.includes('bobrick')) return 'Bobrick';
  if (combined.includes('bradley')) return 'Bradley';
  if (combined.includes('sova') || combined.includes('foundations')) return 'Sova';
  if (combined.includes('asi ') || combined.includes('asi-') || combined.includes('american specialties')) return 'ASI';
  return 'Other';
}

export function detectEffectiveDate(textSample: string): string | null {
  const match = textSample.match(
    /(?:effective\s*(?:date)?[:\s]*)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(20\d{2})/i
  );
  if (match) {
    const parsed = new Date(`${match[1]} ${match[2]}, ${match[3]}`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  const monthYear = textSample.match(/(20\d{2})\s+(?:distributor\s+pricing|price)/i);
  if (monthYear) {
    return `${monthYear[1]}-01-01`;
  }
  return null;
}

const SKIP_SHEET_PATTERNS = [
  /index/i,
  /cover/i,
  /terms/i,
  /map\s*policy/i,
  /^sorted~/i,
];

export function parseExcelPriceBook(
  buffer: Buffer,
  fileName: string,
  manufacturerHint?: string
): ParsedPriceBookResult {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const items: ParsedPriceItem[] = [];
  let sampleText = '';

  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEET_PATTERNS.some((re) => re.test(sheetName))) {
      // Grab cover text for metadata detection only
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
      sampleText += ' ' + rows.slice(0, 10).flat().filter(Boolean).join(' ');
      continue;
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
    if (rows.length === 0) continue;

    sampleText += ' ' + rows.slice(0, 5).flat().filter(Boolean).join(' ');

    // Locate header row within first 15 rows
    let headerIdx = -1;
    let colSku = -1;
    let colDesc = -1;
    let colNet = -1;
    let colList = -1;
    let colMap = -1;

    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r] || [];
      const cells = row.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase());

      const skuIdx = cells.findIndex(
        (c) =>
          c === 'item' ||
          c === 'sku' ||
          c.includes('model number') ||
          c.includes('model no') ||
          c.includes('part number') ||
          c === 'model'
      );
      const descIdx = cells.findIndex(
        (c) =>
          c.includes('description') ||
          c.includes('part name') ||
          c.includes('asi grab bars') ||
          c.includes('asi mirrors')
      );
      const priceIdx = cells.findIndex(
        (c) => c.includes('price') || c.includes('net') || c.includes('cost')
      );

      if (skuIdx !== -1 && (descIdx !== -1 || priceIdx !== -1)) {
        headerIdx = r;
        colSku = skuIdx;
        colDesc = descIdx !== -1 ? descIdx : skuIdx + 1;

        cells.forEach((c, idx) => {
          if (idx === colSku || idx === colDesc) return;
          if (c.includes('distributor net') || c === 'net' || c.includes('distributor cost')) {
            if (colNet === -1) colNet = idx;
          } else if (c.includes('map') || c.includes('minimum advertised')) {
            if (colMap === -1) colMap = idx;
          } else if (
            c.includes('list price') ||
            c.includes('price each') ||
            c.includes('dealer price') ||
            c.includes('msrp') ||
            (c.includes('price') && !c.includes('commercial') && !c.includes('map'))
          ) {
            if (colList === -1) colList = idx;
          }
        });
        break;
      }
    }

    if (headerIdx === -1 || colSku === -1) continue;

    let currentCategory = sheetName.replace(/^ASI\s*/i, '').replace(/\s*Prices$/i, '').trim();

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const rawSku = String(row[colSku] ?? '').trim();
      const rawDesc = String(row[colDesc] ?? '').replace(/\s+/g, ' ').trim();

      if (!rawSku && !rawDesc) continue;
      if (rawSku.toUpperCase() === 'CATEGORY') {
        if (rawDesc) currentCategory = rawDesc;
        continue;
      }
      if (rawSku.toLowerCase() === 'model number' || rawSku.toLowerCase() === 'item') {
        continue;
      }
      if (!rawSku || !rawDesc) continue;

      const netPrice = colNet !== -1 ? parseMoney(row[colNet]) : null;
      const listPrice = colList !== -1 ? parseMoney(row[colList]) : null;
      const mapPrice = colMap !== -1 ? parseMoney(row[colMap]) : null;

      if (netPrice === null && listPrice === null) continue;

      items.push({
        sku: rawSku,
        description: rawDesc,
        category: currentCategory || null,
        distributorNetPrice: netPrice,
        listPrice,
        mapPrice,
      });
    }
  }

  const manufacturer = manufacturerHint || detectManufacturer(fileName, sampleText);
  const effectiveDate = detectEffectiveDate(sampleText);

  return { manufacturer, effectiveDate, items };
}

function parseBradleyPdfPages(pages: string[]): ParsedPriceItem[] {
  const items: ParsedPriceItem[] = [];
  const text = pages.join('\n');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Bradley model numbers look like: 2B1-110000, 2B1-110000-BB, 150-15, 8120-001000, SA12-001, etc.
  const skuLineRe = /^(?:[A-Za-z][A-Za-z\s/-]{2,28}\s+)?([A-Z0-9]{1,6}(?:-[A-Z0-9]+)+|\d{3,5}[A-Z0-9-]*)\s+(.+)$/;
  const priceTokenRe = /^\$?\s*([\d,]+\.\d{2})(?:\s+[A-Z]{1,2})?$/;

  let currentCategory: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip obvious headers/footers
    if (
      line.startsWith('Effective Date') ||
      line.startsWith('Washroom Accessories') ||
      line.startsWith('TEL:') ||
      line.startsWith('Web Site:') ||
      line.startsWith('Model No.') ||
      line.includes('Price Book - US') ||
      line === 'Cu.Ft. Wt.Lbs USD'
    ) {
      continue;
    }

    // Track short section headings
    if (
      !skuLineRe.test(line) &&
      !priceTokenRe.test(line) &&
      line.length >= 4 &&
      line.length <= 45 &&
      !/^\d/.test(line) &&
      !line.includes('$')
    ) {
      currentCategory = line;
      continue;
    }

    const m = line.match(skuLineRe);
    if (!m) continue;

    const sku = m[1].trim();
    // Skip TOC / date / phone false positives
    if (/^\d{4}-\d{2}/.test(sku) || sku.includes('BRADLEY')) continue;

    let rest = m[2].trim();
    let price: number | null = null;

    // Look for price at end of current line (with optional trailing BradEx flag like "B") OR on next 1-2 lines
    const inlinePriceMatch = rest.match(
      /^(.*?)(?:\s+\d+\.\d{2}\s+\d+\.\d{2})?\s+\$?\s*([\d,]+\.\d{2})(?:\s+[A-Z]{1,2})?$/
    );
    if (inlinePriceMatch) {
      rest = inlinePriceMatch[1].trim();
      price = parseMoney(inlinePriceMatch[2]);
    } else {
      rest = rest.replace(/\s+\d+\.\d{2}\s+\d+\.\d{2}$/, '').trim();
      for (let look = 1; look <= 2 && i + look < lines.length; look++) {
        const nextLine = lines[i + look];
        const pm = nextLine.match(priceTokenRe);
        if (pm) {
          price = parseMoney(pm[1]);
          i += look;
          break;
        }
        if (skuLineRe.test(nextLine)) break;
      }
    }

    if (price !== null && rest.length >= 2) {
      items.push({
        sku,
        description: rest,
        category: currentCategory,
        listPrice: price,
      });
    }
  }

  return items;
}

function parseSovaPdfPages(pages: string[]): ParsedPriceItem[] {
  const items: ParsedPriceItem[] = [];
  const lines = pages
    .join('\n')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Sova row format on single line:
  // 10VS0101 [100-EV] Origin Vertical Surface Mount Light Gray 249.99$ 269.99$ 175.50$ 20.00$ In Stock
  const sovaRowRe = /^(\d{2}[A-Z]{2}\d{4})\s+(.+)$/;
  const oldSkuRe = /^(\d{3}[A-Z0-9-]{2,}|[A-Z0-9]{5,}-\w+)\b/;
  const moneyTokenRe = /([\d,]+\.\d{2})\s*\$|\$\s*([\d,]+\.\d{2})/g;

  let currentCategory: string | null = null;

  for (const line of lines) {
    if (line.includes('Collection') || line === 'Liners') {
      currentCategory = line;
      continue;
    }

    const rowMatch = line.match(sovaRowRe);
    if (!rowMatch) continue;

    const sku = rowMatch[1];
    let rest = rowMatch[2].trim();

    let availability: string | null = null;
    if (/\bIn Stock$/i.test(rest)) {
      availability = 'In Stock';
      rest = rest.replace(/\s*\bIn Stock$/i, '').trim();
    } else if (/\bComing Soon$/i.test(rest)) {
      availability = 'Coming Soon';
      rest = rest.replace(/\s*\bComing Soon$/i, '').trim();
    }

    // Extract all money values from the line
    const moneyValues: number[] = [];
    for (const mm of rest.matchAll(moneyTokenRe)) {
      const val = parseMoney(mm[1] || mm[2]);
      if (val !== null) moneyValues.push(val);
    }

    // Remove money tokens and trailing dash placeholders from description
    let descPart = rest.replace(moneyTokenRe, '').replace(/\s+-\s*$/, '').trim();

    let altSku: string | null = null;
    const altMatch = descPart.match(oldSkuRe);
    if (altMatch) {
      altSku = altMatch[1];
      descPart = descPart.slice(altSku.length).trim();
    }

    // Sova money columns order: MAP, MSRP, Distributor Cost, Flat Rate Shipping
    const mapPrice = moneyValues.length >= 1 ? moneyValues[0] : null;
    const listPrice = moneyValues.length >= 2 ? moneyValues[1] : null;
    const distributorNetPrice = moneyValues.length >= 3 ? moneyValues[2] : null;
    const shippingFlatRate = moneyValues.length >= 4 ? moneyValues[3] : null;

    if (descPart && (distributorNetPrice !== null || listPrice !== null || mapPrice !== null)) {
      items.push({
        sku,
        altSku,
        description: descPart,
        category: currentCategory,
        mapPrice,
        listPrice,
        distributorNetPrice,
        shippingFlatRate,
        availability,
      });
    }
  }

  return items;
}

export async function parsePdfPriceBook(
  buffer: Buffer,
  fileName: string,
  manufacturerHint?: string
): Promise<ParsedPriceBookResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const pageList = Array.isArray(pages) ? pages : [String(pages)];
  const sampleText = pageList.slice(0, 2).join(' ');

  const manufacturer = manufacturerHint || detectManufacturer(fileName, sampleText);
  const effectiveDate = detectEffectiveDate(sampleText);

  let items: ParsedPriceItem[] = [];
  if (manufacturer === 'Sova') {
    items = parseSovaPdfPages(pageList);
  } else {
    items = parseBradleyPdfPages(pageList);
  }

  return { manufacturer, effectiveDate, items };
}
