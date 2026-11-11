import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { deconstructEmailThread, DeconstructedEmail } from './thread-cleaner';
import { evaluatePrecedenceRules, PrecedenceEvaluation } from './precedence-rules';

export const aiEmailAnalysisSchema = z.object({
  // 1. Quick Categorization Stickers
  sticker: z
    .enum(['ITB', 'Addendum', 'Won', 'Lost', 'Spam', 'General'])
    .describe(
      'Categorization sticker: ITB (Invitation to Bid), Addendum (drawings/scope updates for ongoing bid), Won (award/contract), Lost (rejection), Spam (noise/marketing)'
    ),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe('1-2 sentence explanation of why this sticker was chosen'),

  // 2. Forwarded Email Extraction
  isForwarded: z
    .boolean()
    .describe('True if this email was forwarded by a coworker (e.g. partitionplus.com, ppi.com)'),
  forwardedBy: z
    .string()
    .nullable()
    .describe('Name or email of the coworker who forwarded the email'),
  originalSenderEmail: z
    .string()
    .nullable()
    .describe('The real external General Contractor or client email from the forwarded headers'),
  originalSenderName: z
    .string()
    .nullable()
    .describe('The real external General Contractor or client person name'),
  originalSubject: z
    .string()
    .nullable()
    .describe('The original subject line stripped of FW: / Fwd:'),

  // 3. Project & Scope Details
  projectName: z
    .string()
    .nullable()
    .describe('Clean project or facility name (e.g. "St. Jude Clinic", "Kroger #399")'),
  projectAddress: z
    .string()
    .nullable()
    .describe('Project street address, city, or state if mentioned (e.g. "Hardy, VA", "Richmond, VA")'),
  jobCode: z
    .string()
    .nullable()
    .describe('Job number or code if referenced in subject or body (e.g. 26-0208ST, 25-0803ST)'),
  clientCompany: z
    .string()
    .nullable()
    .describe('Name of the General Contractor firm (e.g. Keller Brothers, Gilbane, Turner)'),
  bidDueDate: z
    .string()
    .nullable()
    .describe('Deadline or bid due date mentioned in the email'),
  scopeSummary: z
    .string()
    .describe(
      '1-2 sentence executive summary of the trade package or work requested (e.g. Toilet partitions, Lockers, Fire extinguishers)'
    ),

  // 4. Intelligent Matching to Existing Internal Bid Numbers (for Addendum, Won, Lost, and Multi-GC ITBs)
  matchedBidNumber: z
    .string()
    .nullable()
    .describe(
      'If this matches an existing project (Addendum, Won, Lost, or another GC bidding the SAME project name/address), the matching internal BID-YY-XXXX number, or null if new'
    ),
  matchConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score in matching this email to an existing internal bid number'),
  matchReason: z
    .string()
    .nullable()
    .describe(
      'Explanation of why this email matches the existing bid (e.g. "Same project name Kroger #399 and address, different bidding contractor")'
    ),

  // 5. Due Date Revision Detection (Crucial for Addendums)
  isDueDateRevised: z
    .boolean()
    .describe('True if this email is an addendum/bulletin that specifically postpones, extends, or updates the bid due date'),
  revisedDueDate: z
    .string()
    .nullable()
    .describe('The new or postponed bid due date/time if explicitly updated in this email, else null'),
  dueDateRevisionNotes: z
    .string()
    .nullable()
    .describe('Brief explanation of the date change (e.g. "Bid date extended from 11/15 to 11/22 per Addendum 2")'),

  // 6. GC Prime Award Status
  isGcWonPrime: z
    .boolean()
    .describe('True if the General Contractor has won the prime contract and is now collecting/finalizing subcontractor quotes or awarding our quote'),
});

export type AIEmailAnalysis = z.infer<typeof aiEmailAnalysisSchema>;

export interface ActiveBidSummary {
  bidNumber: string;
  projectName: string | null;
  clientCompany: string | null;
  projectAddress?: string | null;
  jobCode?: string | null;
}

/**
 * Analyzes incoming emails with hierarchical precedence and thread deconstruction.
 * Uses strict construction domain rules: Won > Lost > Addendum > Spam > ITB.
 * Historical "Invitation to Bid" quotes in forwarded threads will NOT misclassify Addendums.
 */
export async function analyzeEmailWithAI(input: {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
  attachmentFilenames?: string[];
  activeBids?: ActiveBidSummary[];
}): Promise<AIEmailAnalysis> {
  // 1. Thread deconstruction: split top message from quoted forwarded history
  const deconstructed: DeconstructedEmail = deconstructEmailThread(
    input.subject,
    input.bodyText,
    input.senderEmail,
    input.senderName
  );

  // 2. Deterministic precedence evaluation
  const precedence: PrecedenceEvaluation = evaluatePrecedenceRules({
    cleanSubject: deconstructed.cleanSubject,
    topMessage: deconstructed.topMessage,
    forwardedBody: deconstructed.forwardedBody,
    attachmentFilenames: input.attachmentFilenames || [],
    senderEmail: input.senderEmail,
  });

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return buildFallbackAnalysis(input, deconstructed, precedence);
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const activeBidsContext =
    input.activeBids && input.activeBids.length > 0
      ? `\nCURRENT ACTIVE INTERNAL BIDS TO MATCH AGAINST:\n${JSON.stringify(input.activeBids, null, 2)}\n`
      : '\nNo existing active internal bids currently in database.\n';

  const precedenceHint = precedence.matched
    ? `\n*** PRECEDENCE ENGINE PRE-CHECK ***\nMatched Rule: ${precedence.matchedRule}\nIndicated Sticker: "${precedence.sticker}" (${precedence.ruleReason})\nAssign sticker "${precedence.sticker}" unless there is undeniable contradicting evidence.\n***********************************\n`
    : '';

  const prompt = `You are an expert commercial construction estimating assistant.
Your job is to categorize this incoming email and extract structured project data.

=======================================================
HIERARCHICAL CATEGORY PRECEDENCE (STRICTLY ENFORCED):
=======================================================
1. "Won": Award notification, Notice to Proceed, Subcontract agreement, or Purchase Order. (Trumps everything!).
2. "Lost": Regret to inform, awarded to another bidder, project cancelled. (Trumps ITB!).
3. "Addendum": Scope revisions, Addendum #, updated drawings, revised plans, bulletin, RFI responses, or extended bid dates for an ONGOING job.
   >>> CRITICAL RULE: If the email subject, attachments, or top note mentions "Addendum", "Bulletin", or revised plans, the sticker MUST BE "Addendum", EVEN IF the quoted forwarded thread below contains the words "INVITATION TO BID"! Historical thread quotes must never turn an Addendum into an ITB! <<<
4. "Spam": Marketing solicitations, payroll offers, merchant financing, out-of-office automated notes.
5. "ITB": Invitation to Bid. A brand NEW bidding opportunity or new RFP needing a new estimator assignment.

${precedenceHint}
${activeBidsContext}

=======================================================
FEW-SHOT EXAMPLES:
=======================================================
Example 1 (Forwarded Addendum):
Subject: "FW: INVITATION TO BID: Kroger #399 Expansion"
Top Note: "Estimator, see attached Addendum #1 with revised floor plans."
Attachments: ["Addendum_1.pdf", "Floor_Plans_Rev1.dwg"]
-> sticker: "Addendum", reasoning: "Addendum #1 issued for existing Kroger bid with revised drawings."

Example 2 (Job Award):
Subject: "Subcontract Agreement - St. Jude Health Center"
Top Note: "Attached is the executed subcontract agreement. Please sign and return."
Attachments: ["Subcontract_Agreement.pdf"]
-> sticker: "Won", reasoning: "Executed subcontract agreement issued for St. Jude project."

Example 3 (Rejection Notice):
Subject: "Project 25-0810 - Contractor Selection"
Top Note: "We regret to inform you that we have selected another bidder for this package."
-> sticker: "Lost", reasoning: "Client selected another subcontractor."

Example 4 (New Bid Invitation):
Subject: "INVITATION TO BID: Lincoln High School Science Wing"
Top Note: ""
Body: "Gilbane Building Co invites your firm to bid on toilet partitions and accessories. Bids due Nov 20."
-> sticker: "ITB", reasoning: "New direct invitation to bid from Gilbane requiring estimator assignment."

=======================================================
EMAIL TO EVALUATE:
=======================================================
Immediate Sender: ${input.senderName ? `${input.senderName} <${input.senderEmail}>` : input.senderEmail}
Clean Subject: ${deconstructed.cleanSubject}
Original Subject (if fwd): ${deconstructed.originalSubject || deconstructed.cleanSubject}
Attachments: ${input.attachmentFilenames?.join(', ') || 'None'}

Top Note from Sender / Coworker:
"""
${deconstructed.topMessage || '(No top message)'}
"""

Original GC / Client Sender (from forwarded header):
${deconstructed.originalSenderName ? `${deconstructed.originalSenderName} <${deconstructed.originalSenderEmail}>` : deconstructed.originalSenderEmail}

Forwarded Email Body Core:
"""
${deconstructed.forwardedBody.slice(0, 3500)}
"""`;

  // Try modern models with fallback
  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-lite-latest'];

  for (const modelName of modelsToTry) {
    try {
      const result = await generateObject({
        model: google(modelName),
        schema: aiEmailAnalysisSchema,
        prompt,
      });

      // Post-validation: If precedence engine decisively found Addendum or Won, enforce it
      const aiObject = result.object;
      if (precedence.matched && (precedence.sticker === 'Addendum' || precedence.sticker === 'Won' || precedence.sticker === 'Lost')) {
        if (aiObject.sticker === 'ITB') {
          aiObject.sticker = precedence.sticker;
          aiObject.reasoning = `${precedence.ruleReason} (Overrode ITB via precedence engine).`;
        }
      }

      return aiObject;
    } catch (err: any) {
      console.warn(`Gemini model ${modelName} failed, trying next:`, err?.message || err);
    }
  }

  // If all models failed, use the deterministic fallback
  return buildFallbackAnalysis(input, deconstructed, precedence);
}

function buildFallbackAnalysis(
  input: {
    subject: string;
    bodyText: string;
    senderEmail: string;
    senderName?: string | null;
    attachmentFilenames?: string[];
  },
  deconstructed: DeconstructedEmail,
  precedence: PrecedenceEvaluation
): AIEmailAnalysis {
  const sticker = precedence.matched ? precedence.sticker : 'ITB';

  return {
    sticker,
    confidence: precedence.matched ? precedence.confidence : 0.8,
    reasoning: precedence.matched ? precedence.ruleReason : 'Precedence engine analysis',
    isForwarded: deconstructed.isForwarded,
    forwardedBy: deconstructed.forwardedBy,
    originalSenderEmail: deconstructed.originalSenderEmail,
    originalSenderName: deconstructed.originalSenderName,
    originalSubject: deconstructed.originalSubject,
    projectName: null,
    projectAddress: null,
    jobCode: null,
    clientCompany: null,
    bidDueDate: null,
    scopeSummary: deconstructed.cleanSubject,
    matchedBidNumber: null,
    matchConfidence: 0,
    matchReason: null,
    isDueDateRevised: false,
    revisedDueDate: null,
    dueDateRevisionNotes: null,
    isGcWonPrime: false,
  };
}
