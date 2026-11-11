const fs = require('fs');
const dotenv = fs.readFileSync('.env.local', 'utf-8');
const env = {};
dotenv.split('\n').forEach(line => {
  const parts = line.trim().split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k) env[k] = v.replace(/^['"]|['"]$/g, '');
});

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testQuery(name, selectCols) {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/rest/v1/bid_requests?select=${encodeURIComponent(selectCols)}&order=created_at.desc&limit=650`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const text = await res.text();
    const duration = Date.now() - start;
    if (res.ok) {
      const json = JSON.parse(text);
      console.log(`[${name}] SUCCESS: ${json.length} rows in ${duration}ms, size: ${(text.length/1024).toFixed(1)} KB`);
    } else {
      console.log(`[${name}] ERROR ${res.status}: ${text.slice(0, 100)} in ${duration}ms`);
    }
  } catch (err) {
    console.log(`[${name}] EXCEPTION: ${err.message}`);
  }
}

async function run() {
  const allWithoutRawPayload = `
    id,
    bid_number,
    email_subject,
    sender_email,
    sender_name,
    email_received_at,
    job_code,
    project_name,
    client_company,
    duplicate_group_id,
    is_flagged_duplicate,
    duplicate_reasons,
    duplicate_resolution,
    triage_status,
    priority,
    assigned_estimator_id,
    bid_due_date,
    attachments,
    email_body_text,
    email_intent,
    filter_status,
    is_forwarded,
    forwarded_by,
    original_sender_email,
    original_sender_name,
    scope_summary,
    intent_explanation,
    intent_confidence,
    matched_bid_number,
    match_confidence,
    match_reason,
    match_status,
    estimator_status,
    is_human_labeled,
    human_label,
    human_labeled_at,
    is_due_date_revised,
    revised_due_date,
    is_gc_won_prime,
    project_address_street,
    project_address_city,
    project_address_state,
    project_address_zip,
    created_at
  `.replace(/\s+/g, ' ').trim();

  await testQuery('All without raw_payload', allWithoutRawPayload);
}
run();
