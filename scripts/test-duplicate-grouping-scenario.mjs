import assert from 'node:assert';
import crypto from 'node:crypto';

// In-memory mock database for bid_requests table
const mockDb = [];

function computeAttachmentHash(attachment) {
  if (attachment.checksum) return attachment.checksum.toLowerCase();
  if (attachment.content) {
    const buffer = Buffer.from(attachment.content, 'base64');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  const signature = `${attachment.filename.trim().toLowerCase()}_${attachment.size || 0}`;
  return crypto.createHash('sha256').update(signature).digest('hex');
}

function extractJobCode(text) {
  if (!text) return null;
  const match = text.match(/\b\d{2}-\d{4}[A-Za-z]{0,2}\b/);
  return match ? match[0].toUpperCase() : null;
}

const STOP_WORDS = new Set([
  're', 'fwd', 'fw', 'itb', 'rfp', 'rfi', 'bid', 'invitation', 'request',
  'to', 'for', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'of', 'from',
  'by', 'with', 'urgent', 'notice', 'external', 'new', 'update', 'plans',
  'specs', 'project', 'job'
]);

function extractSignificantTokens(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/[\[\]\(\)\{\}:;,\.!?\-_/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return new Set(cleaned.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

function calculateTokenSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionCount++;
  }
  const unionCount = new Set([...setA, ...setB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function compareBidRequests(incoming, candidate) {
  const reasons = [];
  let score = 0;

  const candidateHashes = new Set(candidate.attachment_hashes || []);
  const matchingHashes = incoming.attachmentHashes.filter((h) => candidateHashes.has(h));

  if (matchingHashes.length > 0) {
    score += 0.85;
    reasons.push(`Identical attachment checksum matched (${matchingHashes.length} file)`);
  }

  if (incoming.jobCode && candidate.job_code && incoming.jobCode === candidate.job_code) {
    score += 0.80;
    reasons.push(`Exact job code match: ${incoming.jobCode}`);
  }

  const candidateTokens = extractSignificantTokens(candidate.email_subject);
  const similarity = calculateTokenSimilarity(incoming.tokens, candidateTokens);

  if (similarity >= 0.70) {
    score += 0.50;
    reasons.push(`High subject keyword overlap (${Math.round(similarity * 100)}%)`);
  } else if (similarity >= 0.40) {
    score += 0.25;
    reasons.push(`Moderate subject keyword overlap (${Math.round(similarity * 100)}%)`);
  }

  if (incoming.senderEmail.toLowerCase().trim() === candidate.sender_email.toLowerCase().trim()) {
    score += 0.15;
    reasons.push(`Same sender: ${incoming.senderEmail}`);
  }

  const confidence = Math.min(1.0, Math.round(score * 100) / 100);
  return { confidence, reasons };
}

// Simulates the ingestion & deduplication insertion pipeline
function ingestBidRequest(payload) {
  const jobCode = extractJobCode(payload.subject) || extractJobCode(payload.body || '');
  const tokens = extractSignificantTokens(payload.subject);
  const processedAttachments = (payload.attachments || []).map((att) => ({
    filename: att.filename,
    size: att.size || 0,
    checksum: computeAttachmentHash(att),
  }));
  const attachmentHashes = processedAttachments.map((a) => a.checksum);
  const attachmentFilenames = processedAttachments.map((a) => a.filename);

  // Look for duplicates in existing records
  let bestMatch = null;
  for (const candidate of mockDb) {
    const comparison = compareBidRequests(
      {
        subject: payload.subject,
        senderEmail: payload.senderEmail,
        jobCode,
        attachmentHashes,
        attachmentFilenames,
        tokens,
      },
      candidate
    );

    if (comparison.confidence >= 0.50) {
      if (!bestMatch || comparison.confidence > bestMatch.confidence) {
        bestMatch = { candidate, ...comparison };
      }
    }
  }

  let groupId;
  let isDuplicate = false;
  let duplicateOfId = null;
  let confidence = 0;
  let reasons = [];

  if (bestMatch) {
    isDuplicate = true;
    duplicateOfId = bestMatch.candidate.id;
    confidence = bestMatch.confidence;
    reasons = bestMatch.reasons;
    groupId = bestMatch.candidate.duplicate_group_id;

    // If candidate didn't have group_id yet, assign one
    if (!groupId) {
      groupId = crypto.randomUUID();
      bestMatch.candidate.duplicate_group_id = groupId;
      bestMatch.candidate.is_flagged_duplicate = true;
    }
  } else {
    groupId = crypto.randomUUID();
  }

  const record = {
    id: `bid_${mockDb.length + 1}`,
    email_subject: payload.subject,
    sender_email: payload.senderEmail,
    job_code: jobCode,
    attachments: processedAttachments,
    attachment_hashes: attachmentHashes,
    duplicate_group_id: groupId,
    is_flagged_duplicate: isDuplicate,
    duplicate_of_id: duplicateOfId,
    duplicate_confidence: confidence,
    duplicate_reasons: reasons,
    triage_status: 'pending_triage',
    estimator_status: 'unassigned',
  };

  mockDb.push(record);
  return record;
}

// -------------------------------------------------------------
// SCENARIO SIMULATION
// -------------------------------------------------------------

console.log('=== SCENARIO: EMAIL INGESTION & AUTOMATED GROUPING ===\n');

// 1. Initial Inbound Email for Job 26-0208ST
const email1 = ingestBidRequest({
  subject: '26-0208ST - TEST DAVID - Initial Bid Invitation',
  senderEmail: 'purchasing@apexconstruction.com',
  body: 'Please provide pricing for the millwork package.',
  attachments: [{ filename: 'Apex_Plans_26-0208ST.pdf', content: 'PLAN-DATA-OCT-2026' }],
});

console.log('1. First Email Ingested:');
console.log(`   ID: ${email1.id}`);
console.log(`   Group ID: ${email1.duplicate_group_id}`);
console.log(`   Is Duplicate: ${email1.is_flagged_duplicate}\n`);

// 2. Duplicate Inbound Email from a PM forwarding to another inbox
const email2 = ingestBidRequest({
  subject: 'FW: 26-0208ST - TEST DAVID - Bid Invitation',
  senderEmail: 'pm@apexconstruction.com',
  body: 'Forwarding the plans for bidding.',
  attachments: [{ filename: 'Apex_Plans_26-0208ST.pdf', content: 'PLAN-DATA-OCT-2026' }],
});

console.log('2. Second Email Ingested (Duplicate):');
console.log(`   ID: ${email2.id}`);
console.log(`   Group ID: ${email2.duplicate_group_id}`);
console.log(`   Is Duplicate: ${email2.is_flagged_duplicate}`);
console.log(`   Confidence: ${email2.duplicate_confidence}`);
console.log(`   Reasons:`, email2.duplicate_reasons);
console.log(`   Linked to Parent: ${email2.duplicate_of_id}\n`);

assert.strictEqual(email2.is_flagged_duplicate, true);
assert.strictEqual(email2.duplicate_group_id, email1.duplicate_group_id, 'Both emails must share the exact same group ID!');

// 3. Independent Email for Job 26-0228JF
const email3 = ingestBidRequest({
  subject: '26-0228JF - TEST CAROLINE - Houston, Texas - Pricing Request',
  senderEmail: 'estimating@houstonbuilders.com',
  body: 'Scope for Houston site.',
  attachments: [{ filename: 'Houston_Site_Specs.pdf', content: 'HOUSTON-SPEC-DATA-NOV-2026' }],
});

console.log('3. Third Email Ingested (Distinct Job):');
console.log(`   ID: ${email3.id}`);
console.log(`   Group ID: ${email3.duplicate_group_id}`);
console.log(`   Is Duplicate: ${email3.is_flagged_duplicate}\n`);

assert.strictEqual(email3.is_flagged_duplicate, false);
assert.notStrictEqual(email3.duplicate_group_id, email1.duplicate_group_id);

// 4. Calendar Manager View: Grouped representation
console.log('=== CALENDAR MANAGER DISPATCH DASHBOARD (GROUPED VIEW) ===');
const grouped = mockDb.reduce((acc, row) => {
  acc[row.duplicate_group_id] = acc[row.duplicate_group_id] || [];
  acc[row.duplicate_group_id].push(row);
  return acc;
}, {});

for (const [groupId, items] of Object.entries(grouped)) {
  console.log(`\n📂 Group [${groupId}] (${items.length} email${items.length > 1 ? 's' : ''}):`);
  items.forEach((item, idx) => {
    const tag = item.is_flagged_duplicate ? `⚠️ DUPLICATE (${item.duplicate_reasons.join(' | ')})` : '⭐ PRIMARY REQUEST';
    console.log(`   [${idx + 1}] ${tag} - Subject: "${item.email_subject}" from <${item.sender_email}>`);
  });
}

console.log('\n✔ All scenario assertions passed! Calendar Manager can triage groups without manual deletion.');
