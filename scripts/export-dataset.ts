import fs from 'fs';
import path from 'path';
import { createServerSupabaseClient } from '../src/lib/supabase/server';
import { deconstructEmailThread } from '../src/lib/email-parser/thread-cleaner';

function escapeCsv(value: any): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ');
  return `"${str}"`;
}

async function exportDataset() {
  console.log('🔄 Fetching email records from Supabase in lightweight batches...');
  const supabase = createServerSupabaseClient();

  const allRecords: any[] = [];
  const pageSize = 100;
  let page = 0;

  // Lightweight column projection: avoids fetching multi-megabyte base64 payloads
  const columns =
    'id, email_intent, email_subject, email_body_text, sender_email, sender_name, attachments, duplicate_resolution, triage_status, estimator_status, email_received_at, created_at';

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('bid_requests')
      .select(columns)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error(`❌ Error fetching page ${page} (${from}-${to}):`, error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      break;
    }

    allRecords.push(...data);
    console.log(`  Fetched page ${page + 1}: ${data.length} records (Total so far: ${allRecords.length})`);

    if (data.length < pageSize) {
      break;
    }

    page++;
  }

  console.log(`\n📊 Processing features for ${allRecords.length} total records...`);

  const outputDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const csvPath = path.join(outputDir, 'emails_dataset.csv');
  const jsonlPath = path.join(outputDir, 'emails_dataset.jsonl');

  const headers = [
    'id',
    'label',
    'label_verified',
    'clean_subject',
    'original_subject',
    'sender_domain',
    'is_forwarded',
    'forwarded_by',
    'original_sender_name',
    'original_sender_email',
    'attachment_names',
    'attachment_count',
    'has_drawings',
    'has_addendum_doc',
    'top_message',
    'body_core_preview',
    'engineered_text',
    'received_at',
  ];

  const labelCounts: Record<string, number> = {
    ITB: 0,
    Addendum: 0,
    Won: 0,
    Lost: 0,
    Spam: 0,
    General: 0,
  };

  const csvRows: string[] = [headers.join(',')];
  const jsonlRows: string[] = [];

  for (const r of allRecords) {
    let label = 'ITB';
    if (r.email_intent === 'addendum_update') label = 'Addendum';
    else if (r.email_intent === 'bid_won') label = 'Won';
    else if (r.email_intent === 'bid_lost') label = 'Lost';
    else if (r.email_intent === 'spam_noise') label = 'Spam';
    else if (r.email_intent === 'general_inquiry') label = 'General';

    labelCounts[label] = (labelCounts[label] || 0) + 1;

    const rawSubject = r.email_subject || '';
    const rawBody = r.email_body_text || '';
    const senderEmail = r.sender_email || '';

    // Deconstruct thread to isolate top message and core content
    const d = deconstructEmailThread(rawSubject, rawBody, senderEmail, r.sender_name);

    // Extract attachment filenames from metadata (clean & fast)
    const rawAtts = Array.isArray(r.attachments) ? r.attachments : [];
    const attachmentNames = rawAtts.map((a: any) => a.filename).filter(Boolean);
    const attachmentNamesStr = attachmentNames.join(', ');
    const hasDrawings = attachmentNames.some((f: string) =>
      /\.(dwg|dxf|pdf)$/i.test(f) || /plan|drawing|sheet/i.test(f)
    );
    const hasAddendumDoc = attachmentNames.some((f: string) =>
      /addend|bulletin|rev/i.test(f)
    );

    // Sender domain (e.g. buildingconnected.com, lobar.com)
    const senderDomain = senderEmail.includes('@') ? senderEmail.split('@')[1].toLowerCase() : '';

    // Human verification indicator
    const labelVerified =
      r.duplicate_resolution === 'confirmed_duplicate' ||
      r.duplicate_resolution === 'marked_distinct' ||
      r.triage_status === 'assigned' ||
      r.estimator_status !== 'unassigned';

    // Engineered composite feature (perfect for TF-IDF / embeddings / BERT)
    const engineeredText = [
      `Subject: ${d.cleanSubject}`,
      attachmentNamesStr ? `Attachments: ${attachmentNamesStr}` : '',
      d.topMessage ? `Top Note: ${d.topMessage}` : '',
      `Body: ${d.forwardedBody.slice(0, 1500)}`,
    ]
      .filter(Boolean)
      .join(' | ')
      .replace(/\r?\n/g, ' ')
      .trim();

    const rowObj = {
      id: r.id,
      label,
      label_verified: labelVerified,
      clean_subject: d.cleanSubject,
      original_subject: rawSubject,
      sender_domain: senderDomain,
      is_forwarded: d.isForwarded,
      forwarded_by: d.forwardedBy || '',
      original_sender_name: d.originalSenderName || '',
      original_sender_email: d.originalSenderEmail || '',
      attachment_names: attachmentNamesStr,
      attachment_count: attachmentNames.length,
      has_drawings: hasDrawings,
      has_addendum_doc: hasAddendumDoc,
      top_message: d.topMessage,
      body_core_preview: d.forwardedBody.slice(0, 300),
      engineered_text: engineeredText,
      received_at: r.email_received_at || r.created_at,
    };

    jsonlRows.push(JSON.stringify(rowObj));

    const csvRow = [
      escapeCsv(rowObj.id),
      escapeCsv(rowObj.label),
      escapeCsv(rowObj.label_verified),
      escapeCsv(rowObj.clean_subject),
      escapeCsv(rowObj.original_subject),
      escapeCsv(rowObj.sender_domain),
      escapeCsv(rowObj.is_forwarded),
      escapeCsv(rowObj.forwarded_by),
      escapeCsv(rowObj.original_sender_name),
      escapeCsv(rowObj.original_sender_email),
      escapeCsv(rowObj.attachment_names),
      escapeCsv(rowObj.attachment_count),
      escapeCsv(rowObj.has_drawings),
      escapeCsv(rowObj.has_addendum_doc),
      escapeCsv(rowObj.top_message),
      escapeCsv(rowObj.body_core_preview),
      escapeCsv(rowObj.engineered_text),
      escapeCsv(rowObj.received_at),
    ];
    csvRows.push(csvRow.join(','));
  }

  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');
  fs.writeFileSync(jsonlPath, jsonlRows.join('\n'), 'utf8');

  console.log('\n✅ Datasheet Export Complete!');
  console.log(`📁 CSV:   ${csvPath}`);
  console.log(`📁 JSONL: ${jsonlPath}`);
  console.log('\n📈 Class Distribution:');
  Object.entries(labelCounts).forEach(([lbl, count]) => {
    const pct = ((count / allRecords.length) * 100).toFixed(1);
    console.log(`   - ${lbl.padEnd(10)}: ${count.toString().padStart(4)} (${pct}%)`);
  });
}

exportDataset().catch(console.error);
