import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  detectAndGroupDuplicates,
  computeAttachmentHash,
  extractJobCode,
} from '@/lib/email-parser/deduplication';
import { analyzeEmailWithAI } from '@/lib/email-parser/ai-classifier';
import type { EmailAttachmentPayload } from '@/types/bid-request';

const attachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  checksum: z.string().optional(),
  content: z.string().optional(),
  storageUrl: z.string().optional(),
});

const inboundEmailSchema = z.object({
  messageId: z.string().optional(),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().optional(),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  sender: z.union([
    z.string(),
    z.object({
      email: z.string().email(),
      name: z.string().optional(),
    }),
  ]),
  senderEmail: z.string().email().optional(),
  senderName: z.string().optional(),
  receivedAt: z.string().optional(),
  attachments: z.array(attachmentSchema).optional().default([]),
  clientCompany: z.string().optional(),
  projectName: z.string().optional(),
  bidDueDate: z.string().optional(),
});

function parseSender(
  sender: string | { email: string; name?: string },
  fallbackEmail?: string,
  fallbackName?: string
): { email: string; name: string | null } {
  if (typeof sender === 'object') {
    return {
      email: sender.email.toLowerCase().trim(),
      name: sender.name?.trim() || fallbackName?.trim() || null,
    };
  }

  const bracketMatch = sender.match(/^(.*?)\s*<(.+@.+)>$/);
  if (bracketMatch) {
    return {
      name: bracketMatch[1].replace(/["']/g, '').trim() || null,
      email: bracketMatch[2].toLowerCase().trim(),
    };
  }

  return {
    email: (fallbackEmail || sender).toLowerCase().trim(),
    name: fallbackName?.trim() || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Optional webhook secret validation
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret) {
      const incomingSecret = request.headers.get('x-webhook-secret');
      if (incomingSecret !== expectedSecret) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid or missing webhook secret' },
          { status: 401 }
        );
      }
    }

    const rawBody = await request.json();
    const parseResult = inboundEmailSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid email payload schema',
          details: parseResult.error.format(),
        },
        { status: 400 }
      );
    }

    const payload = parseResult.data;
    const { email: directSenderEmail, name: directSenderName } = parseSender(
      payload.sender,
      payload.senderEmail,
      payload.senderName
    );

    const bodyText = payload.bodyText || payload.body || '';
    const bodyHtml = payload.bodyHtml || null;

    // Process attachments & compute hashes
    const processedAttachments: EmailAttachmentPayload[] = (payload.attachments || []).map(
      (att) => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        checksum: computeAttachmentHash(att),
        storageUrl: att.storageUrl,
      })
    );
    const attachmentHashes = processedAttachments.map((a) => a.checksum!).filter(Boolean);
    const attachmentFilenames = processedAttachments.map((a) => a.filename);

    // 1. Run Gemini AI Classifier & Forwarder Unpacker
    const ai = await analyzeEmailWithAI({
      subject: payload.subject,
      bodyText,
      senderEmail: directSenderEmail,
      senderName: directSenderName,
      attachmentFilenames,
    });

    // 2. Identify the true client (if forwarded by coworker, use original GC)
    const effectiveSenderEmail = ai.isForwarded && ai.originalSenderEmail
      ? ai.originalSenderEmail.toLowerCase().trim()
      : directSenderEmail;
    const effectiveSenderName = ai.isForwarded && ai.originalSenderName
      ? ai.originalSenderName
      : directSenderName;
    const effectiveJobCode = ai.jobCode || extractJobCode(payload.subject) || extractJobCode(bodyText);
    const effectiveProjectName = ai.projectName || payload.projectName || null;
    const effectiveClientCompany = ai.clientCompany || payload.clientCompany || null;

    const supabase = createServerSupabaseClient();

    // 3. Deduplication & Grouping Heuristics
    const duplicateEvaluation = await detectAndGroupDuplicates(
      {
        subject: ai.originalSubject || payload.subject,
        senderEmail: effectiveSenderEmail,
        senderName: effectiveSenderName,
        bodyText,
        attachments: processedAttachments,
      },
      supabase
    );

    // 4. Initial Triage and Estimator States based on AI analysis
    let triageStatus = 'pending_triage';
    let estimatorStatus = 'unassigned';
    let filterStatus = 'inbox';

    if (ai.intent === 'spam_noise') {
      triageStatus = 'archived';
      filterStatus = 'auto_filtered';
    } else if (ai.intent === 'bid_won') {
      estimatorStatus = 'won';
      triageStatus = 'assigned';
    } else if (ai.intent === 'bid_lost') {
      estimatorStatus = 'lost';
    } else if (ai.intent === 'addendum_update') {
      // Addendums are automatically linked to the existing project
      triageStatus = 'ready_for_assignment';
    }

    // 5. Insert Record into Supabase
    const bidRequestRecord = {
      source_email_id: payload.messageId || null,
      sender_email: effectiveSenderEmail,
      sender_name: effectiveSenderName,
      email_subject: payload.subject,
      email_body_text: bodyText,
      email_body_html: bodyHtml,
      email_received_at: payload.receivedAt || new Date().toISOString(),
      raw_payload: rawBody,

      project_name: effectiveProjectName,
      client_company: effectiveClientCompany,
      job_code: effectiveJobCode,
      bid_due_date: ai.bidDueDate || payload.bidDueDate || null,

      attachments: processedAttachments,
      attachment_hashes: attachmentHashes,

      // Duplicate Grouping
      duplicate_group_id: duplicateEvaluation.duplicateGroupId,
      is_flagged_duplicate: duplicateEvaluation.isDuplicate,
      duplicate_of_id: duplicateEvaluation.duplicateOfId,
      duplicate_confidence: duplicateEvaluation.confidence,
      duplicate_reasons: duplicateEvaluation.reasons,
      duplicate_resolution: 'unreviewed',

      // Intent & AI Extraction
      email_intent: ai.intent,
      intent_confidence: ai.confidence,
      intent_explanation: ai.reasoning,
      filter_status: filterStatus,

      // Forwarding & AI Metadata
      is_forwarded: ai.isForwarded,
      forwarded_by: ai.forwardedBy || (ai.isForwarded ? directSenderEmail : null),
      original_sender_email: ai.originalSenderEmail,
      original_sender_name: ai.originalSenderName,
      scope_summary: ai.scopeSummary,
      recommended_action: ai.recommendedAction,
      ai_analysis: ai,

      triage_status: triageStatus,
      priority: ai.intent === 'bid_won' ? 'urgent' : 'normal',
      estimator_status: estimatorStatus,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('bid_requests')
      .insert(bidRequestRecord)
      .select('id, duplicate_group_id, is_flagged_duplicate, email_intent, filter_status, triage_status')
      .single();

    if (insertError) {
      console.error('Error inserting bid request:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert bid request', details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        bidRequestId: inserted.id,
        intent: inserted.email_intent,
        ai: {
          intent: ai.intent,
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          isForwarded: ai.isForwarded,
          forwardedBy: ai.forwardedBy,
          originalSender: ai.originalSenderEmail,
          projectName: effectiveProjectName,
          jobCode: effectiveJobCode,
          scopeSummary: ai.scopeSummary,
          recommendedAction: ai.recommendedAction,
        },
        duplicateGroupId: inserted.duplicate_group_id,
        isFlaggedDuplicate: inserted.is_flagged_duplicate,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Unhandled error processing email webhook:', err);
    return NextResponse.json(
      {
        error: 'Internal server error while processing webhook',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
