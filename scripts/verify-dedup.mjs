import assert from 'node:assert';
import crypto from 'node:crypto';

// Replicating pure logic for standalone node verification
const STOP_WORDS = new Set([
  're', 'fwd', 'fw', 'itb', 'rfp', 'rfi', 'bid', 'invitation', 'request',
  'to', 'for', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'of', 'from',
  'by', 'with', 'urgent', 'notice', 'external', 'new', 'update', 'plans',
  'specs', 'project', 'job'
]);

function extractJobCode(text) {
  if (!text) return null;
  const match = text.match(/\b\d{2}-\d{4}[A-Za-z]{0,2}\b/);
  return match ? match[0].toUpperCase() : null;
}

function computeAttachmentHash(attachment) {
  if (attachment.checksum) {
    return attachment.checksum.toLowerCase();
  }
  if (attachment.content) {
    const buffer = Buffer.from(attachment.content, 'base64');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  const signature = `${attachment.filename.trim().toLowerCase()}_${attachment.size || 0}`;
  return crypto.createHash('sha256').update(signature).digest('hex');
}

function extractSignificantTokens(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/[\[\]\(\)\{\}:;,\.!?\-_/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  return new Set(tokens);
}

function calculateTokenSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersectionCount++;
    }
  }
  const unionCount = new Set([...setA, ...setB]).size;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

function compareBidRequests(incoming, candidate) {
  const reasons = [];
  let score = 0;

  // 1. Identical Attachment Checksums
  const candidateHashes = new Set(candidate.attachment_hashes || []);
  const matchingHashes = incoming.attachmentHashes.filter((h) => candidateHashes.has(h));

  if (matchingHashes.length > 0) {
    score += 0.85;
    reasons.push(
      `Identical attachment checksum matched (${matchingHashes.length} file${
        matchingHashes.length > 1 ? 's' : ''
      })`
    );
  } else if (candidate.attachments && candidate.attachments.length > 0 && incoming.attachmentFilenames.length > 0) {
    const candidateFilenames = candidate.attachments.map((a) => a.filename.toLowerCase());
    const matchingNames = incoming.attachmentFilenames.filter((name) =>
      candidateFilenames.includes(name.toLowerCase())
    );
    if (matchingNames.length > 0) {
      score += 0.35;
      reasons.push(`Matching attachment filenames: ${matchingNames.join(', ')}`);
    }
  }

  // 2. Exact Job Code Match (from Jobs-Filterable.csv conventions)
  if (incoming.jobCode && candidate.job_code && incoming.jobCode === candidate.job_code) {
    score += 0.80;
    reasons.push(`Exact job code match: ${incoming.jobCode}`);
  }

  // 3. Subject Keyword Similarity
  const candidateTokens = extractSignificantTokens(candidate.email_subject);
  const similarity = calculateTokenSimilarity(incoming.tokens, candidateTokens);

  if (similarity >= 0.70) {
    score += 0.50;
    reasons.push(`High subject keyword overlap (${Math.round(similarity * 100)}%)`);
  } else if (similarity >= 0.40) {
    score += 0.25;
    reasons.push(`Moderate subject keyword overlap (${Math.round(similarity * 100)}%)`);
  }

  // 4. Same Sender
  if (
    incoming.senderEmail.toLowerCase().trim() ===
    candidate.sender_email.toLowerCase().trim()
  ) {
    score += 0.15;
    reasons.push(`Same sender: ${incoming.senderEmail}`);
  }

  const confidence = Math.min(1.0, Math.round(score * 100) / 100);
  return { confidence, reasons };
}

// ---------------------------------------------------------
// RUN TEST SUITE
// ---------------------------------------------------------

console.log('--- RUNNING DEDUPLICATION & GROUPING TESTS ---\n');

// Test 1: Job code regex matches patterns from Jobs-Filterable.csv
console.log('Test 1: Job code extraction from real project summaries');
assert.strictEqual(extractJobCode('24-0791MP - Tested - TEST Customer'), '24-0791MP');
assert.strictEqual(extractJobCode('FW: 25-0803ST - TEST JOB - TEST Customer'), '25-0803ST');
assert.strictEqual(extractJobCode('26-0228JF - TEST CAROLINE - TEST Customer - Houston, Texas'), '26-0228JF');
assert.strictEqual(extractJobCode('ITB: 23-0000 - TEST CAROLINE'), '23-0000');
console.log('✔ Job code extraction passed.\n');

// Test 2: Attachment hash generation
console.log('Test 2: Attachment hash collision detection');
const dummyPdfContent = Buffer.from('PDF-SAMPLE-DRAWING-CONTENT-12345').toString('base64');
const att1 = { filename: 'Architectural_Plans.pdf', content: dummyPdfContent };
const att2 = { filename: 'Architectural_Plans_Copy.pdf', content: dummyPdfContent };
const hash1 = computeAttachmentHash(att1);
const hash2 = computeAttachmentHash(att2);
assert.strictEqual(hash1, hash2, 'Identical content must produce identical hash regardless of filename');
console.log(`✔ Identical content produced exact SHA-256 match: ${hash1}\n`);

// Test 3: Compare candidate email with duplicate email (identical attachment + forwarded subject)
console.log('Test 3: Duplicate detection with identical attachment & forwarded subject');
const existingBidRequest = {
  id: 'bid-req-001',
  email_subject: '26-0208ST - TEST DAVID - Plans and Specifications',
  sender_email: 'estimator@generalcontractor.com',
  job_code: '26-0208ST',
  attachment_hashes: [hash1],
  attachments: [{ filename: 'Architectural_Plans.pdf', size: 1024 }],
  duplicate_group_id: 'group-uuid-001'
};

const incomingDuplicate = {
  subject: 'FW: 26-0208ST - TEST DAVID - Bid Opportunity',
  senderEmail: 'another-pm@generalcontractor.com',
  jobCode: extractJobCode('FW: 26-0208ST - TEST DAVID - Bid Opportunity'),
  attachmentHashes: [hash2],
  attachmentFilenames: ['Architectural_Plans_Copy.pdf'],
  tokens: extractSignificantTokens('FW: 26-0208ST - TEST DAVID - Bid Opportunity')
};

const matchResult = compareBidRequests(incomingDuplicate, existingBidRequest);
console.log('Match Result for Duplicate:', matchResult);
assert(matchResult.confidence >= 0.85, 'Confidence must be very high for identical attachment + job code');
assert(matchResult.reasons.some(r => r.includes('Identical attachment checksum matched')));
assert(matchResult.reasons.some(r => r.includes('Exact job code match: 26-0208ST')));
console.log('✔ Duplicate correctly identified and tagged with clear reasons.\n');

// Test 4: Completely distinct bid request
console.log('Test 4: Distinct bid request must NOT be flagged');
const distinctIncoming = {
  subject: '26-0198MM - TEST Job - St. Jude Medical Clinic',
  senderEmail: 'bids@healthcarebuilder.com',
  jobCode: extractJobCode('26-0198MM - TEST Job - St. Jude Medical Clinic'),
  attachmentHashes: ['unrelated-hash-999'],
  attachmentFilenames: ['Clinic_Specs.pdf'],
  tokens: extractSignificantTokens('26-0198MM - TEST Job - St. Jude Medical Clinic')
};

const distinctResult = compareBidRequests(distinctIncoming, existingBidRequest);
console.log('Match Result for Distinct Request:', distinctResult);
assert.strictEqual(distinctResult.confidence, 0, 'Distinct bid must have 0 confidence score');
assert.strictEqual(distinctResult.reasons.length, 0);
console.log('✔ Distinct request passed cleanly without false positive.\n');

console.log('--- ALL DEDUPLICATION TESTS COMPLETED SUCCESSFULLY ---');
