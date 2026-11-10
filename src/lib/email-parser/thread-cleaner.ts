/**
 * Email Thread & Forward Deconstruction Utility
 *
 * Separates immediate sender comments from forwarded threads, reply chains,
 * and extracts original GC sender headers so that historical "Invitation to Bid"
 * references in thread quotes do not drown out new Addendum or Award notices.
 */

export interface DeconstructedEmail {
  /** The immediate note or comment written by the sender before the forwarded thread/quote */
  topMessage: string;
  /** Whether the email contains a forwarded structure or header */
  isForwarded: boolean;
  /** Person or email address who forwarded the message */
  forwardedBy: string | null;
  /** The original General Contractor or client sender name */
  originalSenderName: string | null;
  /** The original General Contractor or client sender email address */
  originalSenderEmail: string | null;
  /** The original subject line stripped of FW:, FWD:, RE: */
  originalSubject: string | null;
  /** Original date string if found in headers */
  originalDate: string | null;
  /** The core forwarded message body with disclaimer noise stripped */
  forwardedBody: string;
  /** Subject line stripped of FW:, FWD:, RE:, etc. */
  cleanSubject: string;
}

const FORWARD_DELIMITERS = [
  /[-]{3,}\s*Forwarded message\s*[-]{3,}/i,
  /[-]{3,}\s*Original Message\s*[-]{3,}/i,
  /_{20,}/,
  /\bFrom:\s*.*?\r?\n\s*Sent:\s*.*?\r?\n\s*To:\s*.*?\r?\n\s*Subject:/i,
  /\bFrom:\s*.*?\r?\n\s*Date:\s*.*?\r?\n\s*Subject:/i,
  /^On\s+.+?wrote:\s*$/im,
];

const DISCLAIMER_PATTERNS = [
  /This (email|message|electronic transmission) (is|contains) (confidential|privileged).*/is,
  /CONFIDENTIALITY NOTICE:.*/is,
  /The information contained in this communication is confidential.*/is,
  /This transmission may contain information that is privileged.*/is,
  /If you have received this message in error.*/is,
];

/**
 * Strips leading FW:, FWD:, RE: prefixes from subject
 */
export function cleanSubjectLine(subject: string): string {
  if (!subject) return '';
  let cleaned = subject.trim();
  const prefixRegex = /^(fwd?|fw|re|aw|wg|vs|rv):\s*/i;
  while (prefixRegex.test(cleaned)) {
    cleaned = cleaned.replace(prefixRegex, '').trim();
  }
  return cleaned;
}

/**
 * Deconstructs an inbound email into structured top-message and thread components
 */
export function deconstructEmailThread(
  subject: string,
  bodyText: string,
  directSenderEmail: string,
  directSenderName?: string | null
): DeconstructedEmail {
  const cleanSubject = cleanSubjectLine(subject);
  const normalizedBody = (bodyText || '').trim();

  // Find the earliest delimiter
  let earliestIndex = -1;
  let matchedDelimiter: RegExp | null = null;

  for (const delim of FORWARD_DELIMITERS) {
    const match = normalizedBody.match(delim);
    if (match && match.index !== undefined) {
      if (earliestIndex === -1 || match.index < earliestIndex) {
        earliestIndex = match.index;
        matchedDelimiter = delim;
      }
    }
  }

  const isFwdSubject = /^(fwd?|fw):/i.test(subject.trim());
  const hasDelimiter = earliestIndex !== -1;
  const isForwarded = isFwdSubject || hasDelimiter;

  let topMessage = '';
  let threadPart = normalizedBody;

  if (hasDelimiter) {
    topMessage = normalizedBody.slice(0, earliestIndex).trim();
    threadPart = normalizedBody.slice(earliestIndex).trim();
  } else if (isFwdSubject) {
    // Forwarded subject but no explicit delimiter found
    topMessage = '';
    threadPart = normalizedBody;
  } else {
    topMessage = normalizedBody;
    threadPart = '';
  }

  // Parse headers from the thread part if present
  let originalSenderName: string | null = null;
  let originalSenderEmail: string | null = null;
  let originalSubject: string | null = null;
  let originalDate: string | null = null;

  if (hasDelimiter) {
    // 1. From header
    const fromMatch = threadPart.match(/From:\s*([^<\r\n]+?)(?:<([^>\r\n]+)>)?\r?$/m) ||
      threadPart.match(/From:\s*([^\r\n]+)/i);

    if (fromMatch) {
      const fullFrom = fromMatch[1]?.trim() || '';
      const emailInside = fromMatch[2]?.trim() || '';

      if (emailInside && emailInside.includes('@')) {
        originalSenderEmail = emailInside;
        originalSenderName = fullFrom.replace(/["']/g, '').trim() || null;
      } else if (fullFrom.includes('@')) {
        const emailMatch = fullFrom.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          originalSenderEmail = emailMatch[1];
          originalSenderName = fullFrom.replace(emailMatch[1], '').replace(/[<>()"']/g, '').trim() || null;
        } else {
          originalSenderEmail = fullFrom;
        }
      } else {
        originalSenderName = fullFrom;
      }
    }

    // 2. Subject header
    const subjectMatch = threadPart.match(/Subject:\s*([^\r\n]+)/i);
    if (subjectMatch) {
      originalSubject = cleanSubjectLine(subjectMatch[1]);
    }

    // 3. Date / Sent header
    const dateMatch = threadPart.match(/(?:Date|Sent):\s*([^\r\n]+)/i);
    if (dateMatch) {
      originalDate = dateMatch[1].trim();
    }
  }

  // Clean the forwarded body: strip boilerplate confidentiality disclaimers
  let forwardedBody = hasDelimiter ? threadPart : normalizedBody;
  for (const disc of DISCLAIMER_PATTERNS) {
    forwardedBody = forwardedBody.replace(disc, '').trim();
  }

  // If coworker forwarded, record them
  const isCoworker =
    /@(partitionplus\.com|ppi\.com)/i.test(directSenderEmail) ||
    Boolean(isForwarded && (originalSenderEmail || originalSenderName));

  const forwardedBy = isForwarded && isCoworker
    ? directSenderName || directSenderEmail
    : null;

  return {
    topMessage,
    isForwarded,
    forwardedBy,
    originalSenderName: originalSenderName || directSenderName || null,
    originalSenderEmail: originalSenderEmail || directSenderEmail,
    originalSubject: originalSubject || cleanSubject,
    originalDate,
    forwardedBody,
    cleanSubject,
  };
}
