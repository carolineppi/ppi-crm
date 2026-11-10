export type EmailIntent =
  | 'invitation_to_bid'
  | 'bid_won'
  | 'bid_lost'
  | 'addendum_update'
  | 'bid_confirmation'
  | 'spam_noise'
  | 'general_inquiry';

export interface ClassificationResult {
  intent: EmailIntent;
  confidence: number;
  explanation: string;
  isActionableForDispatch: boolean;
  filterStatus: 'inbox' | 'auto_filtered';
}

const SPAM_PATTERNS = [
  /unsubscribe/i,
  /opt-out/i,
  /marketing email/i,
  /view this email in your browser/i,
  /seo ranking/i,
  /web design services/i,
  /out of the office until/i,
  /automatic reply:/i,
  /undeliverable:/i,
  /mail delivery subsystem/i,
  /payroll processing services/i,
  /business financing/i,
  /working capital/i,
];

const WON_PATTERNS = [
  /\bawarded to\b/i,
  /\bnotice to proceed\b/i,
  /\bintent to award\b/i,
  /\bpleased to inform you that your (bid|proposal|quote) (has been|was) (selected|awarded|accepted)\b/i,
  /\byour bid (has been|was) accepted\b/i,
  /\battached (subcontract|subcontractor agreement|contract)\b/i,
  /\bcongratulations.*(selected|won)\b/i,
  /\bpurchase order (attached|issued|#)\b/i,
  /\bwe are moving forward with your (bid|proposal)\b/i,
];

const LOST_PATTERNS = [
  /\bregret to inform\b/i,
  /\bawarded to another (contractor|firm|bidder|vendor)\b/i,
  /\bselected another (contractor|firm|bidder|vendor)\b/i,
  /\bdecided to go in another direction\b/i,
  /\bnot (selected|awarded)\b/i,
  /\bproject (has been|is) cancelled\b/i,
  /\bproject on hold indefinitely\b/i,
  /\bthank you for (your time|submitting).*went with\b/i,
];

const ADDENDUM_PATTERNS = [
  /\baddendum\s*(no\.?|#|\d+)/i,
  /\bbulletin\s*(no\.?|#|\d+)/i,
  /\brevised (drawings|plans|specs|specifications)\b/i,
  /\bplan revision\b/i,
  /\brfi response(s)?\b/i,
  /\bclarification to bid\b/i,
  /\bextended bid date\b/i,
];

const CONFIRMATION_PATTERNS = [
  /\b(received|acknowledging receipt of) your (bid|quote|proposal)\b/i,
  /\bconfirming receipt of\b/i,
  /\bproposal received\b/i,
  /\bthank you for your bid submission\b/i,
];

const INVITATION_PATTERNS = [
  /\binvitation to bid\b/i,
  /\bITB\b/,
  /\brequest for (proposal|quote|pricing)\b/i,
  /\bRFP\b/,
  /\bRFQ\b/,
  /\bplease provide (pricing|a quote|a bid)\b/i,
  /\bbid due\b/i,
  /\bpre-bid meeting\b/i,
  /\bplans and specs (attached|available)\b/i,
  /\bscope of work\b/i,
];

/**
 * Classifies inbound email content into actionable system intents.
 */
export function classifyEmailIntent(
  subject: string,
  body: string,
  sender: string
): ClassificationResult {
  const fullText = `${subject} ${body}`;

  // 1. Check for Spam / Out-of-Office / Newsletters
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(fullText) || pattern.test(subject)) {
      return {
        intent: 'spam_noise',
        confidence: 0.95,
        explanation: `Flagged as noise/marketing matching pattern: ${pattern.source}`,
        isActionableForDispatch: false,
        filterStatus: 'auto_filtered',
      };
    }
  }

  // 2. Check for Job Won / Award (Crucial: Triggers Active Job Promotion)
  for (const pattern of WON_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        intent: 'bid_won',
        confidence: 0.95,
        explanation: `Job award detected: matches '${pattern.source}'`,
        isActionableForDispatch: true,
        filterStatus: 'inbox',
      };
    }
  }

  // 3. Check for Job Lost / Rejection
  for (const pattern of LOST_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        intent: 'bid_lost',
        confidence: 0.90,
        explanation: `Bid lost notice: matches '${pattern.source}'`,
        isActionableForDispatch: true,
        filterStatus: 'inbox',
      };
    }
  }

  // 4. Check for Addenda / Scope Revisions
  for (const pattern of ADDENDUM_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        intent: 'addendum_update',
        confidence: 0.90,
        explanation: `Project addendum or revised specifications: matches '${pattern.source}'`,
        isActionableForDispatch: true,
        filterStatus: 'inbox',
      };
    }
  }

  // 5. Check for Bid Confirmation
  for (const pattern of CONFIRMATION_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        intent: 'bid_confirmation',
        confidence: 0.85,
        explanation: `Client confirmed receipt of proposal`,
        isActionableForDispatch: false,
        filterStatus: 'inbox',
      };
    }
  }

  // 6. Check for Invitation to Bid (Default actionable bid request)
  for (const pattern of INVITATION_PATTERNS) {
    if (pattern.test(fullText)) {
      return {
        intent: 'invitation_to_bid',
        confidence: 0.90,
        explanation: `Direct invitation to bid / pricing request`,
        isActionableForDispatch: true,
        filterStatus: 'inbox',
      };
    }
  }

  // 7. General Inquiry / Fallback
  return {
    intent: 'general_inquiry',
    confidence: 0.60,
    explanation: 'Unclassified correspondence (retained for Calendar Manager triage)',
    isActionableForDispatch: true,
    filterStatus: 'inbox',
  };
}
