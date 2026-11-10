import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { classifyEmailIntent as heuristicClassifier, ClassificationResult } from './classifier';

export const aiEmailAnalysisSchema = z.object({
  intent: z.enum([
    'invitation_to_bid',
    'addendum_update',
    'bid_won',
    'bid_lost',
    'bid_confirmation',
    'spam_noise',
    'general_inquiry',
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe('1-2 sentence explanation of why this classification was selected'),

  // Forwarded email extraction
  isForwarded: z
    .boolean()
    .describe('True if this email is a forwarded message from a coworker or colleague'),
  forwardedBy: z
    .string()
    .nullable()
    .describe('Name or email of the internal coworker who forwarded it'),
  originalSenderEmail: z
    .string()
    .nullable()
    .describe('The real external General Contractor or client email from the forwarded header'),
  originalSenderName: z
    .string()
    .nullable()
    .describe('The real external General Contractor or client name'),
  originalSubject: z
    .string()
    .nullable()
    .describe('The original subject line stripped of FW: / Fwd:'),

  // Extracted Project Details
  projectName: z
    .string()
    .nullable()
    .describe('Clean project or building name (e.g. "St. Jude Clinic", "Riverside High School")'),
  jobCode: z
    .string()
    .nullable()
    .describe('Extracted internal job code if referenced (pattern like 26-0208ST, 25-0803ST, 24-0791MP)'),
  clientCompany: z
    .string()
    .nullable()
    .describe('Name of the General Contractor, Construction Manager, or Owner firm'),
  bidDueDate: z
    .string()
    .nullable()
    .describe('Deadline or bid due date mentioned in email, formatted as readable string or null'),
  scopeSummary: z
    .string()
    .describe('1-2 sentence executive summary of the trade package, materials, or work requested'),

  recommendedAction: z.enum([
    'CREATE_NEW_BID',
    'ATTACH_TO_EXISTING_BID',
    'PROMOTE_TO_JOB',
    'MARK_LOST',
    'AUTO_ARCHIVE',
  ]),
});

export type AIEmailAnalysis = z.infer<typeof aiEmailAnalysisSchema>;

/**
 * Analyzes an inbound email using Google Gemini.
 * Unpacks forwarded coworker messages, extracts true GC details,
 * accurately classifies ITBs vs Addendums vs Awards vs Spam,
 * and falls back seamlessly to rule heuristics if API key is not configured.
 */
export async function analyzeEmailWithAI(input: {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
  attachmentFilenames?: string[];
}): Promise<AIEmailAnalysis> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn('GOOGLE_GENERATIVE_AI_API_KEY not found. Using fallback heuristic classifier.');
    return buildFallbackAnalysis(input);
  }

  const google = createGoogleGenerativeAI({ apiKey });

  const prompt = `You are an expert commercial construction estimating assistant.
Your job is to analyze incoming emails received at a subcontractor/estimating inbox.

CRITICAL INSTRUCTIONS:
1. FORWARDED EMAILS: Often, coworkers (e.g. from the same company or domain) forward bid invites to this inbox.
   Look closely inside the email body for forwarded headers (e.g., "---------- Forwarded message ---------", "From: ...", "Sent: ...", "Subject: ...").
   If forwarded, extract the REAL external General Contractor/Client as originalSenderEmail and originalSenderName, and record the coworker in forwardedBy.
2. INTENT CLASSIFICATION:
   - "invitation_to_bid": A new bid opportunity, RFP, RFQ, or initial drawings request.
   - "addendum_update": An update, Addendum #, revised drawing set, bulletin, or RFI clarification for a project already out for bid. These should be attached to existing jobs, NOT created as separate bids.
   - "bid_won": Notice to proceed, award announcement, subcontract agreement, or purchase order.
   - "bid_lost": Regret to inform, awarded to another bidder, project cancelled.
   - "bid_confirmation": Client merely acknowledging receipt of our quote.
   - "spam_noise": Marketing solicitations, SEO services, payroll offers, out-of-office automated notes, newsletters.
3. JOB CODE EXTRACTION: Look for standard job codes like "26-0208ST", "25-0803ST", "24-0791MP", "23-0000" in the subject or body.
4. SCOPE SUMMARY: Provide a concise 1-2 sentence summary of the trade/work requested.

EMAIL TO ANALYZE:
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

/**
 * Fallback heuristic analysis if AI service is temporarily unreachable
 */
function buildFallbackAnalysis(input: {
  subject: string;
  bodyText: string;
  senderEmail: string;
  senderName?: string | null;
}): AIEmailAnalysis {
  const heuristic = heuristicClassifier(input.subject, input.bodyText, input.senderEmail);
  const isFwd = /^(fwd?|fw):/i.test(input.subject) || /forwarded message/i.test(input.bodyText);

  let recommendedAction: AIEmailAnalysis['recommendedAction'] = 'CREATE_NEW_BID';
  if (heuristic.intent === 'addendum_update') recommendedAction = 'ATTACH_TO_EXISTING_BID';
  if (heuristic.intent === 'bid_won') recommendedAction = 'PROMOTE_TO_JOB';
  if (heuristic.intent === 'bid_lost') recommendedAction = 'MARK_LOST';
  if (heuristic.intent === 'spam_noise') recommendedAction = 'AUTO_ARCHIVE';

  return {
    intent: heuristic.intent,
    confidence: heuristic.confidence,
    reasoning: heuristic.explanation,
    isForwarded: isFwd,
    forwardedBy: isFwd ? input.senderEmail : null,
    originalSenderEmail: input.senderEmail,
    originalSenderName: input.senderName || null,
    originalSubject: input.subject.replace(/^(fwd?|fw):\s*/i, ''),
    projectName: null,
    jobCode: null,
    clientCompany: null,
    bidDueDate: null,
    scopeSummary: input.subject,
    recommendedAction,
  };
}
