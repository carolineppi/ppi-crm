import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import type { UserRole } from '../src/lib/auth/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const IGNORED_DEPARTMENTS = new Set([
  'All',
  'Leadership',
  'Local Sales',
  'Outside Sales',
  'Online',
]);

const FORCE_ADMIN_EMAILS = new Set([
  'caroline@partitionplus.com',
  'caroline.gross144@gmail.com',
]);

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && content[i + 1] === '\n') {
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function mapDepartmentsToRoles(rawDepartments: string, email: string): UserRole[] {
  if (FORCE_ADMIN_EMAILS.has(email)) {
    return ['admin'];
  }

  const parts = rawDepartments
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !IGNORED_DEPARTMENTS.has(s));

  const roles = new Set<UserRole>();
  const hasPmOrWarehouse =
    parts.includes('Project Management') || parts.includes('Warehouse');

  for (const dept of parts) {
    switch (dept) {
      case 'Administration':
        roles.add('admin');
        break;
      case 'Accounting':
        roles.add('accounting');
        break;
      case 'Project Management':
        roles.add('pm');
        break;
      case 'Estimating':
        roles.add('estimator');
        break;
      case 'Warehouse':
        roles.add('warehouse');
        break;
      case 'Installation':
        roles.add(hasPmOrWarehouse ? 'install_coordinator' : 'installer');
        break;
      default:
        break;
    }
  }

  // Fallback for employees whose CSV tags were all ignored/blank
  if (roles.size === 0) {
    roles.add('estimator');
  }

  return Array.from(roles);
}

async function main() {
  const csvPath = path.resolve(process.cwd(), 'Employees-Filterable.csv');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsvRows(raw);
  const headers = rows[0].map((h) => h.trim());

  const idxName = headers.indexOf('Employee');
  const idxEmail = headers.indexOf('Email');
  const idxDepts = headers.indexOf('Departments');

  const toUpsert: any[] = [];
  const skippedNoEmail: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fullName = (r[idxName] || '').trim();
    const email = (r[idxEmail] || '').trim().toLowerCase();
    const depts = (r[idxDepts] || '').trim();

    if (!fullName) continue;
    if (!email) {
      skippedNoEmail.push(fullName);
      continue;
    }

    const roles = mapDepartmentsToRoles(depts, email);
    toUpsert.push({
      email,
      full_name: fullName,
      primary_role: roles[0],
      roles,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(toUpsert, { onConflict: 'email' })
    .select('email, full_name, primary_role, roles');

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`Upserted ${data?.length || 0} employee profiles.`);
  if (skippedNoEmail.length > 0) {
    console.log(`Skipped (no email in CSV): ${skippedNoEmail.join(', ')}`);
  }
}

main();
