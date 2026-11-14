import { SupabaseClient } from '@supabase/supabase-js';

export interface CustomerContactRecord {
  id: string;
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  is_primary: boolean;
}

export interface CustomerRecord {
  id: string;
  airtable_record_id: string | null;
  name: string;
  normalized_name: string;
  customer_type: string | null;
  standing: string | null;
  main_phone: string | null;
  billing_email: string | null;
  billing_postal_address: string | null;
  billing_phone: string | null;
  general_notes: string | null;
  bad_pay: boolean;
  bad_pay_notes: string | null;
  bad_pay_year: string | null;
  bad_pay_amount: string | null;
  bill_day: string | null;
  billing_platform: string | null;
  bill_to_name: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  credit: string | null;
  contacts?: CustomerContactRecord[];
}

export interface CustomerMatchCandidate {
  customer: CustomerRecord;
  score: number;
  matchReason: string;
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'verizon.net',
  'comcast.net',
  'icloud.com',
  'live.com',
  'msn.com',
  'me.com',
  'protonmail.com',
  'att.net',
  'sbcglobal.net',
]);

const COMPANY_SUFFIXES =
  /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|pc|group|enterprises|enterprise)\b/g;

export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,/#!$%^*;:{}=\-_`~()'"]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCorporateDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx === -1) return null;
  const domain = trimmed.slice(atIdx + 1).trim();
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function tokenOverlapScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter >= 4 ? Math.round(70 + (shorter / longer) * 20) : 55;
  }
  const tokensA = new Set(a.split(' ').filter((t) => t.length > 1));
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  if (overlap === 0) return 0;
  return Math.round((overlap / Math.max(tokensA.size, tokensB.size)) * 80);
}

export async function findBestCustomerMatches(
  supabase: SupabaseClient,
  params: { companyName?: string | null; email?: string | null; phone?: string | null }
): Promise<{
  bestMatch: CustomerMatchCandidate | null;
  candidates: CustomerMatchCandidate[];
}> {
  const normQuery = normalizeCompanyName(params.companyName);
  const domain = extractCorporateDomain(params.email);
  const cleanEmail = params.email?.trim().toLowerCase() || '';

  const [{ data: customers }, { data: contacts }] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true }),
    supabase
      .from('customer_contacts')
      .select('*')
      .order('is_primary', { ascending: false }),
  ]);

  const contactsByCustomer = new Map<string, CustomerContactRecord[]>();
  for (const c of (contacts || []) as CustomerContactRecord[]) {
    if (!contactsByCustomer.has(c.customer_id)) {
      contactsByCustomer.set(c.customer_id, []);
    }
    contactsByCustomer.get(c.customer_id)!.push(c);
  }

  const scored: CustomerMatchCandidate[] = [];

  for (const cust of (customers || []) as CustomerRecord[]) {
    const custContacts = contactsByCustomer.get(cust.id) || [];
    const custWithContacts: CustomerRecord = { ...cust, contacts: custContacts };

    let bestScore = 0;
    let reason = '';

    // 1. Exact email match on billing_email or any customer_contact
    if (cleanEmail) {
      const hasExactContactEmail = custContacts.some(
        (c) => (c.email || '').trim().toLowerCase() === cleanEmail
      );
      if (hasExactContactEmail || (cust.billing_email || '').trim().toLowerCase() === cleanEmail) {
        bestScore = 100;
        reason = 'Exact email match';
      }
    }

    // 2. Normalized name or bill_to_name match
    if (normQuery && bestScore < 100) {
      const normName = cust.normalized_name || normalizeCompanyName(cust.name);
      const normBillTo = normalizeCompanyName(cust.bill_to_name);
      if (normName === normQuery || (normBillTo && normBillTo === normQuery)) {
        bestScore = 98;
        reason = 'Exact company name match';
      } else {
        const s1 = tokenOverlapScore(normQuery, normName);
        const s2 = normBillTo ? tokenOverlapScore(normQuery, normBillTo) : 0;
        const nameScore = Math.max(s1, s2);
        if (nameScore > bestScore && nameScore >= 55) {
          bestScore = nameScore;
          reason = 'Similar company name';
        }
      }
    }

    // 3. Corporate email domain match
    if (domain && bestScore < 92) {
      const billingDomain = extractCorporateDomain(cust.billing_email);
      const contactDomainMatch = custContacts.some(
        (c) => extractCorporateDomain(c.email) === domain
      );
      if (billingDomain === domain || contactDomainMatch) {
        bestScore = Math.max(bestScore, 90);
        reason = reason ? `${reason} + @${domain}` : `Email domain @${domain}`;
      }
    }

    if (bestScore >= 55) {
      scored.push({
        customer: custWithContacts,
        score: bestScore,
        matchReason: reason,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name));
  const candidates = scored.slice(0, 8);
  const bestMatch = candidates[0] && candidates[0].score >= 80 ? candidates[0] : null;

  return { bestMatch, candidates };
}

export async function upsertCustomerContact(
  supabase: SupabaseClient,
  customerId: string,
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }
): Promise<void> {
  const email = contact.email?.trim() || null;
  const phone = contact.phone?.trim() || null;
  const firstName = contact.firstName?.trim() || null;
  const lastName = contact.lastName?.trim() || null;
  const fullName =
    contact.fullName?.trim() ||
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    email ||
    phone ||
    null;

  if (!fullName && !email && !phone) return;

  const { data: existing } = await supabase
    .from('customer_contacts')
    .select('*')
    .eq('customer_id', customerId);

  const list = (existing || []) as CustomerContactRecord[];
  const matched = list.find((c) => {
    if (email && c.email && c.email.trim().toLowerCase() === email.toLowerCase()) return true;
    if (fullName && c.full_name && c.full_name.trim().toLowerCase() === fullName.toLowerCase()) {
      if (!email || !c.email) return true;
    }
    return false;
  });

  if (matched) {
    await supabase
      .from('customer_contacts')
      .update({
        first_name: firstName || matched.first_name,
        last_name: lastName || matched.last_name,
        full_name: fullName || matched.full_name,
        email: email || matched.email,
        phone: phone || matched.phone,
        role: contact.role?.trim() || matched.role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matched.id);
    return;
  }

  await supabase.from('customer_contacts').insert({
    customer_id: customerId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email,
    phone,
    role: contact.role?.trim() || 'Point of Contact',
    is_primary: contact.isPrimary ?? list.length === 0,
  });
}
