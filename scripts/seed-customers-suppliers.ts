import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { normalizeCompanyName } from '../src/lib/customers/matchCustomer';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local');
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * RFC-4180 compliant CSV parser supporting multi-line quoted fields and escaped quotes ("").
 */
function parseCsv(content: string): Array<Record<string, string>> {
  const clean = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const records: Array<Record<string, string>> = [];

  for (let r = 1; r < rows.length; r++) {
    const vals = rows[r];
    if (vals.length === 1 && !vals[0].trim()) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (vals[c] ?? '').trim();
    }
    records.push(obj);
  }
  return records;
}

async function seedCustomers() {
  const csvPath = path.resolve(process.cwd(), 'Customers-Grid view.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw).filter((r) => r['Name']);

  console.log(`Parsed ${rows.length} customer rows from Customers-Grid view.csv`);

  const batchSize = 200;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize).map((r) => {
      const name = r['Name'].trim();
      const badPayRaw = (r['Bad Pay'] || '').toLowerCase();
      const isBadPay =
        badPayRaw === 'checked' ||
        badPayRaw === 'true' ||
        badPayRaw === 'yes' ||
        badPayRaw === '1' ||
        (r['Standing'] || '').toLowerCase().includes('bad pay') ||
        Boolean(r['Bad Pay Notes'] || r['Bad Pay Amount']);

      return {
        airtable_record_id: r['Record ID'] || null,
        name,
        normalized_name: normalizeCompanyName(name) || name.toLowerCase(),
        customer_type: r['Type'] || null,
        standing: r['Standing'] || 'No History',
        main_phone: r['Main Phone'] || null,
        billing_email: r['Billing Email Address'] || null,
        billing_postal_address: r['Billing Postal Address'] || null,
        billing_phone: r['Billing Phone'] || null,
        general_notes: r['General Notes'] || null,
        bad_pay: isBadPay,
        bad_pay_notes: r['Bad Pay Notes'] || null,
        bad_pay_year: r['Bad Pay Year'] || null,
        bad_pay_amount: r['Bad Pay Amount'] || null,
        bill_day: r['Bill Day'] || null,
        billing_platform: r['Billing Platform'] || null,
        bill_to_name: r['Bill to Name'] || null,
        address_street: r['Customer Address'] || null,
        address_city: r['Customer City'] || null,
        address_state: r['Customer State'] || null,
        address_zip: r['Customer Zip'] || null,
        credit: r['Credit'] || null,
      };
    });

    const { error } = await supabase
      .from('customers')
      .upsert(chunk, { onConflict: 'airtable_record_id' });

    if (error) {
      throw new Error(`Customer upsert failed at batch ${i}: ${error.message}`);
    }
    upserted += chunk.length;
  }

  console.log(`Successfully upserted ${upserted} customers.`);
}

async function seedSuppliers() {
  const csvPath = path.resolve(process.cwd(), 'Suppliers-Supplier Directory.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(raw).filter((r) => r['Name']);

  console.log(`Parsed ${rows.length} supplier rows from Suppliers-Supplier Directory.csv`);

  const deduped = new Map<string, any>();
  for (const r of rows) {
    const name = r['Name'].trim();
    const norm = normalizeCompanyName(name) || name.toLowerCase();
    const address = r['Address'] && r['Address'] !== 'Unknown' ? r['Address'] : null;
    deduped.set(norm, {
      name,
      normalized_name: norm,
      address,
      representative: r['Representative'] || null,
      representative_phone: r['Representative Phone'] || null,
      representative_email: r['Representative Email'] || null,
      quickbooks_name: r['Quickbooks Name'] || null,
      po_history: r['POs'] || null,
    });
  }

  const all = Array.from(deduped.values());
  const batchSize = 150;
  let upserted = 0;

  for (let i = 0; i < all.length; i += batchSize) {
    const chunk = all.slice(i, i + batchSize);
    const { error } = await supabase
      .from('suppliers')
      .upsert(chunk, { onConflict: 'normalized_name' });

    if (error) {
      throw new Error(`Supplier upsert failed at batch ${i}: ${error.message}`);
    }
    upserted += chunk.length;
  }

  console.log(`Successfully upserted ${upserted} suppliers.`);
}

async function main() {
  await seedCustomers();
  await seedSuppliers();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
