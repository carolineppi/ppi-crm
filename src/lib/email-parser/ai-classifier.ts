import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { classifyEmailIntent as heuristicClassifier } from './classifier';

export const aiEmailAnalysisSchema = z.object({
  // 1. Quick Categorization Stickers
  sticker: z.enum(['ITB', 'Addendum', 'Won', 'Lost', 'Spam', 'General']).describe(
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
    .describe('1-2 sentence executive summary of the trade package or work requested (e.g. Toilet partitions, Lockers, Fire extinguishers)'),

  // 4. Intelligent Matching to Existing Internal Bid Numbers (for Addendum, Won, Lost)
  matchedBidNumber: z
    .string()
    .nullable()
    .describe('If this is an Addendum, Won, or Lost, the matching internal BID-YY-XXXX number from active bids list, or null if no match'),
  matchConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score in matching this email to an existing internal bid number'),
  matchReason: z
    .string()
    .nullable()
    .describe('Explanation of why this email matches the existing bid (e.g. "Matches project name Kroger #399 and contractor")'),
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
 * Analyzes incoming emails with Gemini AI.
 * Assigns one of 5 definitive stickers: ITB, Addendum, Won, Lost, Spam.
 * Only ITBs get new internal bid numbers and estimator assignments.
 * Addendums, Wons, and Losses are matched to existing internal bid numbers.
 */
export async function analyzeEmailWithAI(input: {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
  attachmentFilenames?: string[];
  activeBids?: ActiveBidSummary[];
}): Promise<AIEmailAnalysis> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return buildFallbackAnalysis(input);
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const activeBidsContext = input.activeBids && input.activeBids.length > 0
    ? `\nCURRENT ACTIVE INTERNAL BIDS TO MATCH AGAINST:\n${JSON.stringify(input.activeBids, null, 2)}\n`
    : '\nNo existing active internal bids currently in database.\n';

  const prompt = `You are an expert commercial construction estimating assistant.
Your job is to categorize this email and extract structured data.

CATEGORY STICKERS:
- "ITB": Invitation to Bid. A brand new opportunity or drawings request needing an estimator assignment.
- "Addendum": Scope revisions, Addendum #, updated drawings, or RFI responses for an ONGOING job. (Do NOT assign separately; match to an existing Bid Number!).
- "Won": Award notification, Notice to Proceed, Subcontract agreement, or Purchase Order. (Match to existing Bid Number!).
- "Lost": Regret to inform, awarded to another bidder, project cancelled. (Match to existing Bid Number!).
- "Spam": Marketing solicitations, Google security alerts, payroll offers, out-of-office automated notes, newsletters.

CRITICAL RULES:
1. FORWARDED EMAILS: Coworkers (from partitionplus.com, ppi.com, etc.) often forward RFPs.
   Look inside the body for "---------- Forwarded message ---------" or "From: ...".
   Extract the REAL General Contractor as originalSenderEmail and clientCompany, and record the coworker in forwardedBy.
2. BID MATCHING: If the email is an Addendum, Won, or Lost, search the ACTIVE INTERNAL BIDS list below.
   Match using project name, city/state address, GC company, or job code.
   If a match is found, populate matchedBidNumber (e.g. "BID-26-0001"), matchConfidence, and matchReason.
   If it is a new ITB or no match exists, set matchedBidNumber to null.

${activeBidsContext}

EMAIL TO EVALUATE:
Sender: ${input.senderName ? `${input.senderName} <${input.senderEmail}>` : input.senderEmail}
Subject: ${input.subject}
Attachments: ${input.attachmentFilenames?.join(', ') || 'None'}

Body:
"""
${input.bodyText.slice(0, 4000)}
"""`;

  try {
    const result = await generateObject({
      model: google('gemini-flash-lite-latest'),
      schema: aiEmailAnalysisSchema,
      prompt,
    });

    return result.object;
  } catch (err) {
    console.error('Error in Gemini AI email analysis:', err);
    return buildFallbackAnalysis(input);
  }
}

function buildFallbackAnalysis(input: {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
}): AIEmailAnalysis {
  const heuristic = heuristicClassifier(input.subject, input.bodyText, input.senderEmail);
  const isFwd = /^(fwd?|fw):/i.test(input.subject) || /forwarded message/i.test(input.bodyText);

  let sticker: AIEmailAnalysis['sticker'] = 'ITB';
  if (heuristic.intent === 'addendum_update') sticker = 'Addendum';
  else if (heuristic.intent === 'bid_won') sticker = 'Won';
  else if (heuristic.intent === 'bid_lost') sticker = 'Lost';
  else if (heuristic.intent === 'spam_noise') sticker = 'Spam';

  return {
    sticker,
    confidence: heuristic.confidence,
    reasoning: heuristic.explanation,
    isForwarded: isFwd,
    forwardedBy: isFwd ? input.senderEmail : null,
    originalSenderEmail: input.senderEmail,
    originalSenderName: input.senderName || null,
    originalSubject: input.subject.replace(/^(fwd?|fw):\s*/i, ''),
    projectName: null,
    projectAddress: null,
    jobCode: null,
    clientCompany: null,
    bidDueDate: null,
    scopeSummary: input.subject,
    matchedBidNumber: null,
    matchConfidence: 0,
    matchReason: null,
  };
}
