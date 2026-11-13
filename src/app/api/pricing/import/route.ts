import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  parseExcelPriceBook,
  parsePdfPriceBook,
} from '@/lib/pricing/price-book-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const manufacturerOverride = (formData.get('manufacturer') as string | null)?.trim() || undefined;
    const effectiveDateOverride = (formData.get('effectiveDate') as string | null)?.trim() || undefined;
    const multiplierRaw = formData.get('defaultMultiplier') as string | null;
    const defaultMultiplier = multiplierRaw ? Number(multiplierRaw) : 1.0;

    if (!file) {
      return NextResponse.json({ error: 'Price sheet file is required' }, { status: 400 });
    }
    if (!Number.isFinite(defaultMultiplier) || defaultMultiplier <= 0 || defaultMultiplier > 5) {
      return NextResponse.json({ error: 'Invalid multiplier' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    const parsed =
      lowerName.endsWith('.pdf')
        ? await parsePdfPriceBook(buffer, file.name, manufacturerOverride)
        : parseExcelPriceBook(buffer, file.name, manufacturerOverride);

    if (parsed.items.length === 0) {
      return NextResponse.json(
        { error: 'No pricing rows could be extracted from this file. Check the file format or manufacturer selection.' },
        { status: 400 }
      );
    }

    const manufacturer = manufacturerOverride || parsed.manufacturer;
    const effectiveDate = effectiveDateOverride || parsed.effectiveDate;

    const supabase = createServerSupabaseClient();

    // 1. Create price book record
    const { data: book, error: bookErr } = await supabase
      .from('manufacturer_price_books')
      .insert({
        manufacturer,
        book_name: file.name,
        effective_date: effectiveDate,
        default_multiplier: defaultMultiplier,
        item_count: parsed.items.length,
      })
      .select()
      .single();

    if (bookErr || !book) {
      return NextResponse.json({ error: bookErr?.message || 'Failed to create price book' }, { status: 500 });
    }

    // 2. Batch insert items in chunks of 500
    const rows = parsed.items.map((item) => ({
      price_book_id: book.id,
      manufacturer,
      sku: item.sku,
      alt_sku: item.altSku || null,
      description: item.description,
      category: item.category || null,
      finish_or_color: item.finishOrColor || null,
      list_price: item.listPrice ?? null,
      distributor_net_price: item.distributorNetPrice ?? null,
      multiplier: defaultMultiplier,
      map_price: item.mapPrice ?? null,
      shipping_flat_rate: item.shippingFlatRate ?? null,
      availability: item.availability || null,
      effective_date: effectiveDate,
    }));

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: insertErr } = await supabase
        .from('manufacturer_price_items')
        .insert(chunk);

      if (insertErr) {
        // Clean up partial book on failure
        await supabase.from('manufacturer_price_books').delete().eq('id', book.id);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json(
      {
        book,
        importedCount: rows.length,
        manufacturer,
        effectiveDate,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Price book import error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import price book' },
      { status: 500 }
    );
  }
}
