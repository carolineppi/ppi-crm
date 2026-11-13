import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const fullText = (Array.isArray(pages) ? pages : [String(pages)]).join('\n');
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    // Extract metadata
    let bidNumber: string | null = null;
    const bidNumMatch = fullText.match(/Bid\s*#:\s*([A-Za-z0-9-]+)/i);
    if (bidNumMatch) bidNumber = bidNumMatch[1].trim();

    let title = file.name.replace(/\.pdf$/i, '');
    const titleIdx = lines.findIndex((l) => /^MATERIAL QUOTE$/i.test(l));
    if (titleIdx !== -1 && lines[titleIdx + 1] && !lines[titleIdx + 1].startsWith('Date:')) {
      title = lines[titleIdx + 1];
    }

    let notes = '';
    const notesIdx = lines.findIndex((l) => /^Notes\s*&\s*Clarifications$/i.test(l));
    if (notesIdx !== -1) {
      notes = lines.slice(notesIdx + 1).join('\n').trim();
    }

    // Parse itemized lines:
    // Format from QuotePrintModal: "<qty> <Mfg> <SKU> <Description...> $<unit> $<total>"
    const parsedLines: Array<{
      quantity: number;
      manufacturer: string;
      sku: string;
      description: string;
      unitPrice: number;
    }> = [];

    const rowRe = /^(\d+)\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9._-]+)\s+(.+?)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$/;

    for (const line of lines) {
      const m = line.match(rowRe);
      if (!m) continue;
      const quantity = Math.max(1, parseInt(m[1], 10));
      const manufacturer = m[2].trim();
      const sku = m[3].trim();
      const description = m[4].trim();
      const unitPrice = Number(m[5].replace(/,/g, ''));

      if (sku && Number.isFinite(unitPrice)) {
        parsedLines.push({
          quantity,
          manufacturer,
          sku,
          description,
          unitPrice,
        });
      }
    }

    if (parsedLines.length === 0) {
      return NextResponse.json(
        { error: 'Could not find itemized quote rows in this PDF. Make sure it is a printed material quote PDF.' },
        { status: 400 }
      );
    }

    // Cross-reference SKUs against manufacturer_price_items for live priceBook IDs & net costs
    const supabase = createServerSupabaseClient();
    const skus = Array.from(new Set(parsedLines.map((l) => l.sku)));
    const { data: matchedDbItems } = await supabase
      .from('manufacturer_price_items')
      .select('id, manufacturer, sku, description, effective_net_price, list_price')
      .in('sku', skus);

    const dbByMfgSku = new Map<string, any>();
    const dbBySku = new Map<string, any>();
    for (const dbItem of matchedDbItems || []) {
      dbByMfgSku.set(`${dbItem.manufacturer.toLowerCase()}||${dbItem.sku.toLowerCase()}`, dbItem);
      if (!dbBySku.has(dbItem.sku.toLowerCase())) {
        dbBySku.set(dbItem.sku.toLowerCase(), dbItem);
      }
    }

    const items = parsedLines.map((line, idx) => {
      const match =
        dbByMfgSku.get(`${line.manufacturer.toLowerCase()}||${line.sku.toLowerCase()}`) ||
        dbBySku.get(line.sku.toLowerCase());

      return {
        priceItemId: match?.id || `pdf-${line.sku}-${idx}-${Date.now()}`,
        manufacturer: match?.manufacturer || line.manufacturer,
        sku: match?.sku || line.sku,
        description: match?.description || line.description,
        quantity: line.quantity,
        unitCost: Number(match?.effective_net_price ?? match?.list_price ?? line.unitPrice),
      };
    });

    return NextResponse.json({
      title,
      bidNumber,
      notes,
      items,
    });
  } catch (err: any) {
    console.error('Parse quote PDF error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse quote PDF' },
      { status: 500 }
    );
  }
}
