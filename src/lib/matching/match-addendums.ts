import { SupabaseClient } from '@supabase/supabase-js';

export interface ActiveBidCandidate {
  id: string;
  bid_number: string;
  email_subject?: string | null;
  project_name?: string | null;
  job_code?: string | null;
  client_company?: string | null;
  project_address_street?: string | null;
  project_address_city?: string | null;
  project_address_state?: string | null;
  duplicate_group_id?: string | null;
  assigned_estimator_id?: string | null;
  assigned_estimator_name?: string | null;
  estimator_status?: string | null;
}

export interface AddendumCandidate {
  id: string;
  email_subject?: string | null;
  project_name?: string | null;
  job_code?: string | null;
  client_company?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  duplicate_group_id?: string | null;
  matched_bid_number?: string | null;
  raw_payload?: any;
}

export interface MatchResult {
  addendumId: string;
  matchedBidNumber: string;
  matchedBidId: string;
  targetGroupId?: string | null;
  score: number;
  reasons: string[];
  assignedEstimatorId?: string | null;
  assignedEstimatorName?: string | null;
  isAutoDispatched: boolean;
}

export function cleanString(str?: string | null): string {
  if (!str || str === 'null' || str === 'undefined') return '';
  return str.trim();
}

/**
 * Extracts a candidate project name from subject or project_name field
 */
export function extractProjectCandidate(subject?: string | null, projectName?: string | null): string {
  const pName = cleanString(projectName);
  if (pName.length >= 4) return pName.toLowerCase();
  if (!subject) return '';

  let cleaned = subject
    .replace(/^(Fwd|Re|Fw|FWD|RE):\s*/gi, '')
    .replace(/^(Addendum|Addenda|ADD|RFI|Amendment|Bulletin|Notice\s*of\s*Addendum)\s*#?\d*[\s\-\:\.]*/gi, '')
    .replace(/^(Scopes?\s*of\s*Work|SOW|Drawings?|Plans?|Specs?|Cut\s*Sheets?)\s*(\(Division \d+\))?[\s\-\:\.]*/gi, '')
    .replace(/^(ITB|Invitation\s*to\s*Bid|Request\s*for\s*Proposal|RFP|RFQ|Bid\s*Clarifications?|Bid\s*Notice\s*\d*)\s*[\-\:\.]*/gi, '')
    .replace(/\s*-\s*(Pre-Bid|Addendum|RFI|Responses|Rev\s*\d*|Proposals\s*Due|Bid\s*Due|Due\s*Tomorrow).*$/gi, '')
    .replace(/^(GC\s*-\s*)/gi, '')
    .trim();

  // If there's a dash like "Scopes of Work - Project Name", grab after the dash
  const dashParts = cleaned.split(/\s*-\s*/);
  if (dashParts.length > 1 && dashParts[0].length < 15 && /scope|drawings|photos|reminder|notes/i.test(dashParts[0])) {
    cleaned = dashParts.slice(1).join(' - ');
  }
  return cleaned.toLowerCase().trim();
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'invitation', 'bid', 'bids',
  'due', 'date', 'rfi', 'addendum', 'addenda', 'amendment', 'bulletin', 'fwd', 're',
  'project', 'job', 'scope', 'work', 'drawing', 'drawings', 'posted', 'uploaded', 'revised',
  'responses', 'response', 'clarifications', 'clarification', 'submittal', 'construction',
  'company', 'inc', 'llc', 'corp', 'corporation', 'contracting', 'services', 'contractor',
  'facility', 'building', 'center', 'street', 'avenue', 'road', 'suite', 'floor'
]);

export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

export function calculateOverlap(
  setA: Set<string>,
  setB: Set<string>
): { jaccard: number; count: number; shared: string[] } {
  if (!setA.size || !setB.size) return { jaccard: 0, count: 0, shared: [] };
  let intersection = 0;
  const shared: string[] = [];
  for (const item of setA) {
    if (setB.has(item)) {
      intersection++;
      shared.push(item);
    }
  }
  const jaccard = intersection / (setA.size + setB.size - intersection);
  return { jaccard, count: intersection, shared };
}

/**
 * Finds the best matching active bid for a given Addendum/RFI candidate
 */
export function findBestBidMatchForAddendum(
  addendum: AddendumCandidate,
  activeBids: ActiveBidCandidate[]
): MatchResult | null {
  const addProject = extractProjectCandidate(addendum.email_subject, addendum.project_name);
  const addTokens = tokenize(`${addProject} ${addendum.email_subject || ''}`);
  const addJobCode = cleanString(addendum.job_code).toLowerCase();
  const addGc = cleanString(addendum.client_company).toLowerCase();

  let bestMatch: ActiveBidCandidate | null = null;
  let highestScore = 0;
  let matchReasons: string[] = [];

  for (const itb of activeBids) {
    let score = 0;
    const reasons: string[] = [];

    // 1. Shared duplicate group (highest fidelity thread match)
    if (
      addendum.duplicate_group_id &&
      itb.duplicate_group_id &&
      addendum.duplicate_group_id === itb.duplicate_group_id
    ) {
      score += 1.0;
      reasons.push('Shared duplicate group');
    }

    // 2. Exact Job Code Match
    const itbJobCode = cleanString(itb.job_code).toLowerCase();
    if (addJobCode && itbJobCode && addJobCode === itbJobCode && addJobCode.length >= 3) {
      score += 0.95;
      reasons.push(`Job Code: ${itbJobCode}`);
    }

    // 3. Project Name Normalized / Substring Match
    const itbProject = extractProjectCandidate(itb.email_subject, itb.project_name);
    if (addProject && itbProject && addProject.length >= 5 && itbProject.length >= 5) {
      if (addProject === itbProject) {
        score += 0.90;
        reasons.push(`Exact Project: "${itbProject}"`);
      } else if (addProject.includes(itbProject) || itbProject.includes(addProject)) {
        score += 0.80;
        reasons.push(`Substring Project: "${itbProject}"`);
      }
    }

    // 4. Token Overlap
    const itbTokens = tokenize(`${itbProject} ${itb.email_subject || ''}`);
    const { jaccard, count, shared } = calculateOverlap(addTokens, itbTokens);

    if (count >= 3) {
      score += 0.75 + jaccard * 0.2;
      reasons.push(`Strong keyword match: [${shared.join(', ')}]`);
    } else if (count === 2 && jaccard >= 0.4) {
      score += 0.65 + jaccard * 0.2;
      reasons.push(`Keyword match: [${shared.join(', ')}]`);
    } else if (jaccard >= 0.5) {
      score += 0.60;
      reasons.push(`Token similarity (${Math.round(jaccard * 100)}%)`);
    }

    // 5. Client company correlation bonus
    const itbGc = cleanString(itb.client_company).toLowerCase();
    if (addGc && itbGc && addGc === itbGc) {
      score += 0.15;
      reasons.push(`Same GC: ${itb.client_company}`);
    }

    // Require high threshold (0.65) to eliminate false positives
    if (score >= 0.65 && score > highestScore) {
      highestScore = score;
      bestMatch = itb;
      matchReasons = reasons;
    }
  }

  if (!bestMatch) return null;

  const assignedEstimator = bestMatch.assigned_estimator_name || null;
  const isAutoDispatched = Boolean(assignedEstimator || bestMatch.assigned_estimator_id);

  return {
    addendumId: addendum.id,
    matchedBidNumber: bestMatch.bid_number,
    matchedBidId: bestMatch.id,
    targetGroupId: bestMatch.duplicate_group_id || null,
    score: Math.min(1.0, Math.round(highestScore * 100) / 100),
    reasons: matchReasons,
    assignedEstimatorId: bestMatch.assigned_estimator_id || null,
    assignedEstimatorName: assignedEstimator,
    isAutoDispatched,
  };
}

/**
 * Executes a batch matching run against all unlinked Addendums/RFIs in the database
 */
export async function runBatchAddendumMatcher(
  supabase: SupabaseClient,
  options?: { forceAll?: boolean; singleId?: string }
): Promise<{
  totalUnlinked: number;
  matchedCount: number;
  autoDispatchedCount: number;
  matches: MatchResult[];
}> {
  // 1. Fetch all active master ITBs with bid_number
  const { data: itbsData, error: itbErr } = await supabase
    .from('bid_requests')
    .select(
      'id, bid_number, email_subject, project_name, job_code, client_company, project_address_street, project_address_city, project_address_state, duplicate_group_id, assigned_estimator_id, raw_payload'
    )
    .not('bid_number', 'is', null);

  if (itbErr) {
    throw new Error(`Failed to load ITBs: ${itbErr.message}`);
  }

  const activeBids: ActiveBidCandidate[] = (itbsData || []).map((r: any) => ({
    id: r.id,
    bid_number: r.bid_number,
    email_subject: r.email_subject,
    project_name: r.project_name,
    job_code: r.job_code,
    client_company: r.client_company,
    project_address_street: r.project_address_street,
    project_address_city: r.project_address_city,
    project_address_state: r.project_address_state,
    duplicate_group_id: r.duplicate_group_id,
    assigned_estimator_id: r.assigned_estimator_id,
    assigned_estimator_name: r.raw_payload?.assigned_estimator_name || null,
    estimator_status: r.estimator_status,
  }));

  // 2. Fetch target Addendums
  let query = supabase
    .from('bid_requests')
    .select(
      'id, email_subject, sender_name, sender_email, project_name, job_code, client_company, duplicate_group_id, matched_bid_number, raw_payload'
    )
    .or(
      'email_intent.eq.addendum_update,human_label.in.(Addendum,RFI/Forms,RFI / Scope,Scopes of Work,Addendum / RFI)'
    );

  if (options?.singleId) {
    query = query.eq('id', options.singleId);
  } else if (!options?.forceAll) {
    query = query.is('matched_bid_number', null);
  }

  const { data: addendumsData, error: addErr } = await query;
  if (addErr) {
    throw new Error(`Failed to load Addendums: ${addErr.message}`);
  }

  const candidates: AddendumCandidate[] = addendumsData || [];
  const matches: MatchResult[] = [];
  let autoDispatchedCount = 0;

  for (const candidate of candidates) {
    const match = findBestBidMatchForAddendum(candidate, activeBids);
    if (match) {
      matches.push(match);
      if (match.isAutoDispatched) {
        autoDispatchedCount++;
      }

      // Update record in Supabase
      const updates: Record<string, any> = {
        matched_bid_number: match.matchedBidNumber,
        matched_bid_id: match.matchedBidId,
        match_status: 'auto_matched',
        match_confidence: match.score,
        match_reason: match.reasons.join(', '),
      };

      if (match.targetGroupId) {
        updates.duplicate_group_id = match.targetGroupId;
      }

      if (match.isAutoDispatched) {
        if (match.assignedEstimatorId) {
          updates.assigned_estimator_id = match.assignedEstimatorId;
        }
        updates.triage_status = 'assigned';
        updates.estimator_status = 'assigned';
        updates.raw_payload = {
          ...(candidate.raw_payload || {}),
          assigned_estimator_name: match.assignedEstimatorName,
          auto_dispatched: true,
          auto_dispatched_at: new Date().toISOString(),
          auto_matched_reason: match.reasons.join(', '),
        };
      } else {
        updates.triage_status = 'ready_for_assignment';
      }

      await supabase
        .from('bid_requests')
        .update(updates)
        .eq('id', candidate.id);
    }
  }

  return {
    totalUnlinked: candidates.length,
    matchedCount: matches.length,
    autoDispatchedCount,
    matches,
  };
}
