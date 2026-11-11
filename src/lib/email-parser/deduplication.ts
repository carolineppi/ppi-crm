import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EmailAttachmentPayload,
  DuplicateCheckResult,
} from '@/types/bid-request';

// Common stop words to ignore during subject keyword extraction
const STOP_WORDS = new Set([
  're', 'fwd', 'fw', 'itb', 'rfp', 'rfi', 'bid', 'invitation', 'request',
  'to', 'for', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'of', 'from',
  'by', 'with', 'urgent', 'notice', 'external', 'new', 'update', 'plans',
  'specs', 'project', 'job'
]);

export interface ParsedBidRequestInput {
  subject: string;
  senderEmail: string;
  senderName?: string | null;
  bodyText?: string | null;
  attachments?: EmailAttachmentPayload[];
  projectName?: string | null;
  projectAddress?: string | null;
  clientCompany?: string | null;
  emailIntent?: string | null;
}

/**
 * Extracts job code pattern (e.g., '26-0228JF', '25-0803ST', '24-0791MP', '23-0000')
 * from subject line or body text.
 */
export function extractJobCode(text: string): string | null {
  if (!text) return null;
  // Matches YY-NNNN or YY-NNNNXX (e.g. 26-0228JF or 23-0000)
  const match = text.match(/\b\d{2}-\d{4}[A-Za-z]{0,2}\b/);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Computes SHA-256 hash of attachment content or normalizes an existing checksum.
 */
export function computeAttachmentHash(attachment: EmailAttachmentPayload): string {
  if (attachment.checksum) {
    return attachment.checksum.toLowerCase();
  }
  if (attachment.content) {
    // If base64 content was provided
    const buffer = Buffer.from(attachment.content, 'base64');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
  // Fallback: stable composite hash based on normalized filename and byte size
  const signature = `${attachment.filename.trim().toLowerCase()}_${attachment.size || 0}`;
  return crypto.createHash('sha256').update(signature).digest('hex');
}

/**
 * Tokenizes and cleans subject text into significant keywords.
 */
export function extractSignificantTokens(text: string): Set<string> {
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

/**
 * Calculates Jaccard similarity between two token sets.
 * Score is between 0.0 (no overlap) and 1.0 (identical keywords).
 */
export function calculateTokenSimilarity(setA: Set<string>, setB: Set<string>): number {
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

/**
 * Evaluates match confidence and specific reasons between an incoming bid request
 * and an existing candidate record.
 */
export function compareBidRequests(
  incoming: {
    subject: string;
    senderEmail: string;
    jobCode: string | null;
    attachmentHashes: string[];
    attachmentFilenames: string[];
    tokens: Set<string>;
    projectName?: string | null;
    projectAddress?: string | null;
    clientCompany?: string | null;
  },
  candidate: {
    id: string;
    email_subject: string;
    sender_email: string;
    job_code: string | null;
    project_name?: string | null;
    project_address_city?: string | null;
    client_company?: string | null;
    attachment_hashes: string[] | null;
    attachments: Array<{ filename: string; checksum?: string; size?: number }> | null;
    duplicate_group_id: string | null;
    bid_number?: string | null;
  }
): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. Identical Attachment Checksums (Highest confidence)
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
    // Check filename matches with identical extensions
    const candidateFilenames = candidate.attachments.map((a) => a.filename.toLowerCase());
    const matchingNames = incoming.attachmentFilenames.filter((name) =>
      candidateFilenames.includes(name.toLowerCase())
    );
    if (matchingNames.length > 0) {
      score += 0.35;
      reasons.push(`Matching attachment filenames: ${matchingNames.join(', ')}`);
    }
  }

  // 2. Exact Job Code Match (e.g. 26-0228JF)
  if (incoming.jobCode && candidate.job_code && incoming.jobCode === candidate.job_code) {
    score += 0.80;
    reasons.push(`Exact job code match: ${incoming.jobCode}`);
  }

  // 3. Project Name / Job Site Similarity (Cross-Contractor Multi-GC Sibling Detection)
  if (incoming.projectName && candidate.project_name) {
    const normIn = incoming.projectName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const normCand = candidate.project_name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

    if (
      (normIn.length > 3 && normCand.length > 3) &&
      (normIn === normCand || normIn.includes(normCand) || normCand.includes(normIn))
    ) {
      score += 0.70;
      const isDiffSender = incoming.senderEmail.toLowerCase() !== candidate.sender_email?.toLowerCase();
      if (isDiffSender) {
        reasons.push(`🏢 Multi-GC Sibling: Same Job Site ("${candidate.project_name}") from different bidding contractor`);
      } else {
        reasons.push(`Matching Project Name: "${candidate.project_name}"`);
      }
    }
  }

  // 4. Subject Keyword Similarity
  const candidateTokens = extractSignificantTokens(candidate.email_subject);
  const similarity = calculateTokenSimilarity(incoming.tokens, candidateTokens);

  if (similarity >= 0.70) {
    score += 0.50;
    reasons.push(`High subject keyword overlap (${Math.round(similarity * 100)}%)`);
  } else if (similarity >= 0.40) {
    score += 0.25;
    reasons.push(`Moderate subject keyword overlap (${Math.round(similarity * 100)}%)`);
  }

  // 5. Same Sender Correlation
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

/**
 * Main Duplicate Detection & Grouping Utility.
 * 
 * Runs before or on insertion of a new bid request.
 * If potential duplicates are found:
 *  - Groups them under the same duplicate_group_id so the Calendar Manager can view them grouped.
 *  - Updates the existing parent record if it doesn't already have a duplicate_group_id.
 *  - Returns duplicate flags, reasons, confidence, and the canonical group ID.
 */
export async function detectAndGroupDuplicates(
  incoming: ParsedBidRequestInput,
  supabase: SupabaseClient
): Promise<DuplicateCheckResult> {
  const jobCode = extractJobCode(incoming.subject) || (incoming.bodyText ? extractJobCode(incoming.bodyText) : null);
  const incomingTokens = extractSignificantTokens(incoming.subject);
  const incomingAttachments = incoming.attachments || [];
  const attachmentHashes = incomingAttachments.map(computeAttachmentHash);
  const attachmentFilenames = incomingAttachments.map((a) => a.filename);

  // Query candidate records: search within recent records (last 90 days or matching job code / hashes / sender / project)
  let query = supabase
    .from('bid_requests')
    .select('id, email_subject, sender_email, job_code, project_name, project_address_city, client_company, attachment_hashes, attachments, duplicate_group_id, bid_number')
    .order('created_at', { ascending: false })
    .limit(100);

  // If we have jobCode or attachment hashes, we can also target specific matches
  const { data: candidates, error } = await query;

  if (error || !candidates || candidates.length === 0) {
    // No candidates found in database, this is the first of its group
    const newGroupId = crypto.randomUUID();
    return {
      isDuplicate: false,
      duplicateGroupId: newGroupId,
      duplicateOfId: null,
      confidence: 0.0,
      reasons: [],
    };
  }

  let bestMatch: {
    candidate: (typeof candidates)[0];
    confidence: number;
    reasons: string[];
  } | null = null;

  for (const candidate of candidates) {
    const { confidence, reasons } = compareBidRequests(
      {
        subject: incoming.subject,
        senderEmail: incoming.senderEmail,
        jobCode,
        attachmentHashes,
        attachmentFilenames,
        tokens: incomingTokens,
        projectName: incoming.projectName,
        projectAddress: incoming.projectAddress,
        clientCompany: incoming.clientCompany,
      },
      candidate
    );

    // Threshold for duplicate detection (0.50 with attachment/job code or 0.60 combined)
    if (confidence >= 0.50) {
      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { candidate, confidence, reasons };
      }
    }
  }

  if (bestMatch) {
    const matchedRecord = bestMatch.candidate;
    let groupId = matchedRecord.duplicate_group_id;

    // If the matched record doesn't have a group_id yet, create one and assign it to both
    if (!groupId) {
      groupId = crypto.randomUUID();
      // Backfill the matched record with this canonical group_id
      await supabase
        .from('bid_requests')
        .update({
          duplicate_group_id: groupId,
          is_flagged_duplicate: true, // both are part of a duplicate group
        })
        .eq('id', matchedRecord.id);
    }

    return {
      isDuplicate: true,
      duplicateGroupId: groupId,
      duplicateOfId: matchedRecord.id,
      confidence: bestMatch.confidence,
      reasons: bestMatch.reasons,
    };
  }

  // Not a duplicate: generate a new canonical group ID
  return {
    isDuplicate: false,
    duplicateGroupId: crypto.randomUUID(),
    duplicateOfId: null,
    confidence: 0.0,
    reasons: [],
  };
}
