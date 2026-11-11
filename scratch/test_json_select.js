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

async function run() {
  try {
    const res = await fetch(`${url}/rest/v1/bid_requests?select=id,assigned_estimator_name:raw_payload->>assigned_estimator_name&limit=5`, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const text = await res.text();
    console.log('Result:', text);
  } catch (err) {
    console.log('Error:', err.message);
  }
}
run();
