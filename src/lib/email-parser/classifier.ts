import { deconstructEmailThread } from './thread-cleaner';
import { evaluatePrecedenceRules } from './precedence-rules';

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
  matchedRule?: string;
}

/**
 * Classifies inbound email content into actionable system intents
 * using thread deconstruction and hierarchical precedence rules.
 */
export function classifyEmailIntent(
  subject: string,
  body: string,
  sender: string,
  attachmentFilenames: string[] = []
): ClassificationResult {
  // 1. Deconstruct thread (isolate top note from quoted forwarded history)
  const deconstructed = deconstructEmailThread(subject, body, sender);

  // 2. Evaluate hierarchical precedence rules
  const precedence = evaluatePrecedenceRules({
    cleanSubject: deconstructed.cleanSubject,
    topMessage: deconstructed.topMessage,
    forwardedBody: deconstructed.forwardedBody,
    attachmentFilenames,
    senderEmail: sender,
  });

  if (precedence.matched) {
    let intent: EmailIntent = 'invitation_to_bid';
    let filterStatus: 'inbox' | 'auto_filtered' = 'inbox';
    let isActionable = true;

    if (precedence.sticker === 'Won') {
      intent = 'bid_won';
      isActionable = true;
    } else if (precedence.sticker === 'Lost') {
      intent = 'bid_lost';
      isActionable = true;
    } else if (precedence.sticker === 'Addendum') {
      intent = 'addendum_update';
      isActionable = true;
    } else if (precedence.sticker === 'Spam') {
      intent = 'spam_noise';
      filterStatus = 'auto_filtered';
      isActionable = false;
    } else if (precedence.sticker === 'ITB') {
      intent = 'invitation_to_bid';
      isActionable = true;
    }

    return {
      intent,
      confidence: precedence.confidence,
      explanation: precedence.ruleReason,
      isActionableForDispatch: isActionable,
      filterStatus,
      matchedRule: precedence.matchedRule,
    };
  }

  // 3. Check for proposal confirmation / receipt
  const combined = `${deconstructed.cleanSubject} ${deconstructed.topMessage}`;
  if (/\b(received|acknowledging receipt of) your (bid|quote|proposal)\b/i.test(combined)) {
    return {
      intent: 'bid_confirmation',
      confidence: 0.85,
      explanation: 'Client confirmed receipt of proposal submission',
      isActionableForDispatch: false,
      filterStatus: 'inbox',
      matchedRule: 'RECEIPT_CONFIRMATION',
    };
  }

  // 4. Default fallback: Unclassified general inquiry for calendar manager review
  return {
    intent: 'general_inquiry',
    confidence: 0.6,
    explanation: 'Unclassified correspondence (retained for Calendar Manager triage)',
    isActionableForDispatch: true,
    filterStatus: 'inbox',
    matchedRule: 'FALLBACK_GENERAL',
  };
}
