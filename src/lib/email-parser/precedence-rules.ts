/**
 * Deterministic Precedence Rule Engine for Commercial Construction Email Classification
 *
 * Implements strict domain hierarchy:
 * Won / Award > Lost / Rejection > Addendum / Revision > Spam / Auto-reply > ITB (Invitation to Bid)
 *
 * This ensures historical quotes ("Invitation to Bid") inside an Addendum thread or Award notice
 * never hijack the classification.
 */

export interface PrecedenceEvaluation {
  matched: boolean;
  sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam' | 'General';
  confidence: number;
  ruleReason: string;
  matchedRule: string;
}

// 1. Won / Award Patterns
const WON_SUBJECT_OR_TOP = [
  /\b(intent to award|awarded to (you|partition|ppi)|notice to proceed)\b/i,
  /\b(subcontract(or)? agreement|executed subcontract|attached subcontract)\b/i,
  /\bpurchase order (attached|issued|#|\d+)\b/i,
  /\bpo\s*(#|\d{4,})\b/i,
  /\bpleased to inform you that your (bid|proposal|quote) (was|has been) (selected|awarded|accepted)\b/i,
  /\bwe are pleased to award\b/i,
  /\bmoving forward with your (bid|proposal|quote)\b/i,
];

const WON_ATTACHMENTS = [
  /subcontract/i,
  /purchase[-_]?order/i,
  /notice[-_]?to[-_]?proceed/i,
  /\bpo[-_]?\d+/i,
];

// 2. Lost / Rejection Patterns
const LOST_SUBJECT_OR_TOP = [
  /\bregret to inform\b/i,
  /\bawarded to another (contractor|firm|bidder|vendor|subcontractor|sub)\b/i,
  /\bwent with another (contractor|firm|bidder|vendor|subcontractor|sub)\b/i,
  /\bselected another (contractor|firm|bidder|vendor|subcontractor|sub)\b/i,
  /\bnot (selected|awarded)\b/i,
  /\bproject (has been|is)?\s*(cancelled|canceled|abandoned|put on hold indefinitely)\b/i,
  /\bdecided not to proceed with\b/i,
];

// 3. Addendum / Revision Patterns (MUST trump ITB)
const ADDENDUM_SUBJECT_PATTERNS = [
  /\baddend(um|a)\b/i,
  /\bbulletin\s*(#|no\.?|\d+)?\b/i,
  /\brevised (drawings|plans|specs|specifications|bid package)\b/i,
  /\bplan revision\b/i,
  /\brevision\s*(#|no\.?|\d+)\b/i,
  /\brev\s*#?\d+\b/i,
  /\brfi response(s)?\b/i,
  /\bclarification (to bid|#\d+|no\.?\d+)\b/i,
  /\b(extended|new) bid (date|time|deadline)\b/i,
];

const ADDENDUM_ATTACHMENT_PATTERNS = [
  /addend(um|a)/i,
  /bulletin/i,
  /rev(ision|\d+)/i,
  /rfi[-_]?response/i,
  /clarification/i,
];

const ADDENDUM_TOP_MESSAGE_PATTERNS = [
  /\b(see attached addendum|addendum attached|revised plans|new drawings|scope update)\b/i,
  /\baddendum\s*(#|no\.?|\d+)\b/i,
  /\bbulletin\s*(#|no\.?|\d+)\b/i,
  /\bextended the bid date\b/i,
];

// 4. Spam / Automated Noise Patterns
const AUTO_REPLY_SUBJECTS = [
  /\bautomatic reply:\b/i,
  /\bout of (the )?office\b/i,
  /\bauto-reply:\b/i,
  /\bundeliverable:\b/i,
  /\bmail delivery subsystem\b/i,
];

const SPAM_SOLICITATIONS = [
  /\b(payroll processing services|seo ranking services|working capital loan|unsecured business line of credit|merchant cash advance)\b/i,
  /\bpre-approved for up to \$\d+/i,
];

// 5. ITB Patterns (New Invitation to Bid)
const ITB_SUBJECT_OR_BODY = [
  /\binvitation to bid\b/i,
  /\bITB\b/,
  /\brequest for (proposal|quote|pricing|qualifications)\b/i,
  /\bRFP\b/,
  /\bRFQ\b/,
  /\bplans and specs (attached|available)\b/i,
  /\bplease provide (pricing|a quote|a bid)\b/i,
  /\bwe are soliciting bids\b/i,
  /\bpre-bid (meeting|walkthrough)\b/i,
];

/**
 * Evaluates an email using hierarchical domain precedence rules.
 * Returns a high-confidence match if deterministic cues are found.
 */
export function evaluatePrecedenceRules(input: {
  cleanSubject: string;
  topMessage: string;
  forwardedBody: string;
  attachmentFilenames?: string[];
  senderEmail: string;
}): PrecedenceEvaluation {
  const { cleanSubject, topMessage, forwardedBody, attachmentFilenames = [], senderEmail } = input;
  const topAndSubject = `${cleanSubject} \n ${topMessage}`;
  const allAttachments = attachmentFilenames.join(' ');

  // 1. WON / AWARD CHECK (Highest precedence)
  for (const pattern of WON_SUBJECT_OR_TOP) {
    if (pattern.test(topAndSubject) || pattern.test(forwardedBody.slice(0, 1500))) {
      return {
        matched: true,
        sticker: 'Won',
        confidence: 0.98,
        ruleReason: `Award notice detected: matches '${pattern.source}'`,
        matchedRule: 'WON_RULE_MATCH',
      };
    }
  }

  for (const pattern of WON_ATTACHMENTS) {
    if (pattern.test(allAttachments)) {
      return {
        matched: true,
        sticker: 'Won',
        confidence: 0.95,
        ruleReason: `Award document attached matching '${pattern.source}'`,
        matchedRule: 'WON_ATTACHMENT_MATCH',
      };
    }
  }

  // 2. LOST / REJECTION CHECK
  for (const pattern of LOST_SUBJECT_OR_TOP) {
    if (pattern.test(topAndSubject) || pattern.test(forwardedBody.slice(0, 1500))) {
      return {
        matched: true,
        sticker: 'Lost',
        confidence: 0.95,
        ruleReason: `Bid lost/rejection notice detected: matches '${pattern.source}'`,
        matchedRule: 'LOST_RULE_MATCH',
      };
    }
  }

  // 3. ADDENDUM / REVISION CHECK (MUST TRUMP ITB)
  // Check subject line first (the strongest indicator)
  for (const pattern of ADDENDUM_SUBJECT_PATTERNS) {
    if (pattern.test(cleanSubject)) {
      return {
        matched: true,
        sticker: 'Addendum',
        confidence: 0.98,
        ruleReason: `Addendum indicator found in subject line: matches '${pattern.source}'`,
        matchedRule: 'ADDENDUM_SUBJECT_MATCH',
      };
    }
  }

  // Check attachment filenames (e.g. Addendum 1.pdf, Bulletin #2.pdf)
  for (const pattern of ADDENDUM_ATTACHMENT_PATTERNS) {
    if (pattern.test(allAttachments)) {
      return {
        matched: true,
        sticker: 'Addendum',
        confidence: 0.95,
        ruleReason: `Addendum/revision document attached matching '${pattern.source}'`,
        matchedRule: 'ADDENDUM_ATTACHMENT_MATCH',
      };
    }
  }

  // Check top message written by coworker/sender
  for (const pattern of ADDENDUM_TOP_MESSAGE_PATTERNS) {
    if (pattern.test(topMessage)) {
      return {
        matched: true,
        sticker: 'Addendum',
        confidence: 0.93,
        ruleReason: `Sender top message references addendum or scope revision: matches '${pattern.source}'`,
        matchedRule: 'ADDENDUM_TOP_MESSAGE_MATCH',
      };
    }
  }

  // 4. SPAM / OUT-OF-OFFICE CHECK
  for (const pattern of AUTO_REPLY_SUBJECTS) {
    if (pattern.test(cleanSubject)) {
      return {
        matched: true,
        sticker: 'Spam',
        confidence: 0.99,
        ruleReason: `Automated auto-reply/out-of-office note`,
        matchedRule: 'AUTO_REPLY_MATCH',
      };
    }
  }

  for (const pattern of SPAM_SOLICITATIONS) {
    if (pattern.test(cleanSubject) || pattern.test(topAndSubject)) {
      return {
        matched: true,
        sticker: 'Spam',
        confidence: 0.95,
        ruleReason: `Marketing / financing solicitation`,
        matchedRule: 'SPAM_SOLICITATION_MATCH',
      };
    }
  }

  // 5. ITB CHECK (Only reached if Won, Lost, and Addendum did NOT match!)
  for (const pattern of ITB_SUBJECT_OR_BODY) {
    if (pattern.test(cleanSubject)) {
      return {
        matched: true,
        sticker: 'ITB',
        confidence: 0.94,
        ruleReason: `Direct invitation to bid found in subject line: matches '${pattern.source}'`,
        matchedRule: 'ITB_SUBJECT_MATCH',
      };
    }
  }

  // Check if sender is a recognized plan room portal
  if (
    /@(buildingconnected\.com|procore\.com|planhub\.com|constructconnect\.com|smartbid\.net|dodgeconstructionnetwork\.com)/i.test(
      senderEmail
    )
  ) {
    return {
      matched: true,
      sticker: 'ITB',
      confidence: 0.93,
      ruleReason: `Inbound bid solicitation from verified plan room portal (${senderEmail})`,
      matchedRule: 'PLAN_ROOM_PORTAL_MATCH',
    };
  }

  // No decisive deterministic rule matched -> defer to AI with clean deconstructed context
  return {
    matched: false,
    sticker: 'General',
    confidence: 0.5,
    ruleReason: 'No decisive deterministic rule matched; deferred to AI reasoning engine',
    matchedRule: 'NONE',
  };
}
