import { NextRequest, NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface ParsedJobLineItem {
  id: string;
  lineNumber: number;
  manufacturer?: string;
  sku?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice?: number;
}

function deterministicParseScopeLines(fullText: string): ParsedJobLineItem[] {
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const items: ParsedJobLineItem[] = [];
  const quoteRowRe =
    /^(\d+)\s+([A-Za-z0-9_-]+)\s+([A-Za-z0-9._-]+)\s+(.+?)\s+\$([\d,]+\.\d{2})\s+\$([\d,]+\.\d{2})$/;
  const numberedOrBulletRe = /^(?:(\d+)[.)]\s+|[-•*]\s+)(.{6,240})$/;
  const qtyLeadRe = /^(\d+)\s*(?:ea|pcs?|sets?|units?|x)?\s+([A-Za-z0-9][A-Za-z0-9\s\-/,().#]{4,180})$/i;

  let lineNum = 1;
  for (const line of lines) {
    // Skip obvious headers/footers
    if (
      /^(page\s+\d+|date:|bid\s*#:|material quote|subtotal|total|grand total|notes\s*&)/i.test(line)
    ) {
      continue;
    }

    const qm = line.match(quoteRowRe);
    if (qm) {
      const qty = Math.max(1, parseInt(qm[1], 10));
      const unitPrice = parseFloat(qm[5].replace(/,/g, ''));
      items.push({
        id: `li-${lineNum}`,
        lineNumber: lineNum++,
        manufacturer: qm[2].trim(),
        sku: qm[3].trim(),
        description: qm[4].trim(),
        quantity: qty,
        unit: 'EA',
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
      });
      continue;
    }

    const nm = line.match(numberedOrBulletRe);
    if (nm) {
      const desc = nm[2].trim();
      const qtyMatch = desc.match(/^(\d+)\s*(?:ea|pcs?|sets?|units?|x)\s+(.+)$/i);
      items.push({
        id: `li-${lineNum}`,
        lineNumber: lineNum++,
        description: qtyMatch ? qtyMatch[2].trim() : desc,
        quantity: qtyMatch ? Math.max(1, parseInt(qtyMatch[1], 10)) : 1,
        unit: 'EA',
      });
      continue;
    }

    const ql = line.match(qtyLeadRe);
    if (ql && items.length < 100) {
      const qty = parseInt(ql[1], 10);
      if (qty > 0 && qty < 10000) {
        items.push({
          id: `li-${lineNum}`,
          lineNumber: lineNum++,
          description: ql[2].trim(),
          quantity: qty,
          unit: 'EA',
        });
      }
    }
  }

  return items;
}

async function aiParseScopeLines(fullText: string): Promise<{
  items: ParsedJobLineItem[];
  scopeSummary?: string;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const truncated = fullText.slice(0, 28000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extract every scope item, product, fixture, hardware item, or line item from this construction scope/quote/schedule PDF into structured JSON line items.
Return JSON matching:
{
  "scopeSummary": "1-2 sentence summary of overall scope",
  "items": [
    {
      "manufacturer": "string or empty",
      "sku": "model/part number or empty",
      "description": "clear item description",
      "quantity": 1,
      "unit": "EA",
      "unitPrice": null
    }
  ]
}

PDF TEXT:
${truncated}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const items: ParsedJobLineItem[] = rawItems
      .filter((it: any) => it && String(it.description || '').trim().length > 0)
      .map((it: any, idx: number) => ({
        id: `li-${idx + 1}`,
        lineNumber: idx + 1,
        manufacturer: it.manufacturer ? String(it.manufacturer).trim() : undefined,
        sku: it.sku ? String(it.sku).trim() : undefined,
        description: String(it.description).trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
        unit: it.unit ? String(it.unit).trim() : 'EA',
        unitPrice:
          it.unitPrice !== null && it.unitPrice !== undefined && !isNaN(Number(it.unitPrice))
            ? Number(it.unitPrice)
            : undefined,
      }));

    return {
      items,
      scopeSummary: parsed?.scopeSummary ? String(parsed.scopeSummary).trim() : undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    let buffer: Buffer | null = null;
    let filename = 'scope.pdf';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'PDF file is required' }, { status: 400 });
      }
      filename = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await request.json();
      const { storageUrl, bidId, fromBidId, filename: reqFilename } = body || {};
      filename = reqFilename || 'scope.pdf';

      if (storageUrl && typeof storageUrl === 'string' && /^https?:\/\//i.test(storageUrl)) {
        const fileRes = await fetch(storageUrl);
        if (!fileRes.ok) {
          return NextResponse.json(
            { error: `Failed to fetch stored PDF (${fileRes.status})` },
            { status: 502 }
          );
        }
        buffer = Buffer.from(await fileRes.arrayBuffer());
      } else if (fromBidId || bidId) {
        const lookupBidId = fromBidId || bidId;
        const supabase = createServerSupabaseClient();
        const { data: bidRow } = await supabase
          .from('bid_requests')
          .select('attachments, raw_payload')
          .eq('id', lookupBidId)
          .single();

        const candidates = [
          ...(Array.isArray(bidRow?.attachments) ? bidRow.attachments : []),
          ...(Array.isArray(bidRow?.raw_payload?.attachments)
            ? bidRow.raw_payload.attachments
            : []),
        ];
        const matched = candidates.find(
          (a: any) =>
            a?.filename &&
            reqFilename &&
            a.filename.toLowerCase() === String(reqFilename).toLowerCase()
        );

        if (matched?.storageUrl && /^https?:\/\//i.test(matched.storageUrl)) {
          const fileRes = await fetch(matched.storageUrl);
          if (fileRes.ok) {
            buffer = Buffer.from(await fileRes.arrayBuffer());
          }
        } else if (matched?.content || matched?.data || matched?.base64) {
          const b64 = matched.content || matched.data || matched.base64;
          buffer = Buffer.from(b64, 'base64');
        }
      }
    }

    if (!buffer) {
      return NextResponse.json(
        { error: 'Could not load PDF bytes for that attachment. You can upload the PDF file directly below.' },
        { status: 404 }
      );
    }

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const fullText = (Array.isArray(pages) ? pages : [String(pages)]).join('\n');

    const aiResult = await aiParseScopeLines(fullText);
    const deterministicItems = deterministicParseScopeLines(fullText);

    const items =
      aiResult && aiResult.items.length > 0 ? aiResult.items : deterministicItems;

    return NextResponse.json({
      filename,
      items,
      scopeSummary: aiResult?.scopeSummary || null,
      extractedTextPreview: fullText.slice(0, 600),
    });
  } catch (err: any) {
    console.error('Error in /api/jobs/parse-scope-pdf:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse scope PDF' },
      { status: 500 }
    );
  }
}
