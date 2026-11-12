import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  detectAndGroupDuplicates,
  computeAttachmentHash,
  extractJobCode,
} from '@/lib/email-parser/deduplication';
import {
  analyzeEmailWithAI,
  ActiveBidSummary,
  AIEmailAnalysis,
} from '@/lib/email-parser/ai-classifier';
import { deconstructEmailThread } from '@/lib/email-parser/thread-cleaner';
import { evaluatePrecedenceRules } from '@/lib/email-parser/precedence-rules';
import { normalizeDateToYyyyMmDd } from '@/lib/date-utils';
import { findBestBidMatchForAddendum } from '@/lib/matching/match-addendums';
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
  isBackfill: z.boolean().optional(),
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
        { error: 'Invalid email payload schema', details: parseResult.error.format() },
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

    const supabase = createServerSupabaseClient();

    // Idempotency check: Skip if email was already ingested
    if (payload.messageId) {
      const { data: existing } = await supabase
        .from('bid_requests')
        .select('id, bid_number')
        .eq('source_email_id', payload.messageId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          {
            message: 'Email already ingested (idempotent skip)',
            id: existing.id,
            bidNumber: existing.bid_number,
          },
          { status: 200 }
        );
      }
    }

    const isFastBackfill = Boolean(
      payload.isBackfill || request.nextUrl.searchParams.get('fast') === '1'
    );

    let ai: AIEmailAnalysis;

    if (isFastBackfill) {
      // Fast deterministic evaluation without external LLM latency or rate limits
      const deconstructed = deconstructEmailThread(payload.subject, bodyText, directSenderEmail, directSenderName);
      const precedence = evaluatePrecedenceRules({
        cleanSubject: deconstructed.cleanSubject,
        topMessage: deconstructed.topMessage,
        forwardedBody: deconstructed.forwardedBody,
        attachmentFilenames,
        senderEmail: directSenderEmail,
      });

      ai = {
        sticker: precedence.matched ? precedence.sticker : 'ITB',
        confidence: precedence.matched ? precedence.confidence : 0.88,
        reasoning: precedence.matched ? precedence.ruleReason : 'Fast deterministic backfill evaluation',
        isForwarded: deconstructed.isForwarded,
        forwardedBy: deconstructed.forwardedBy,
        originalSenderEmail: deconstructed.originalSenderEmail,
        originalSenderName: deconstructed.originalSenderName,
        originalSubject: deconstructed.originalSubject,
        projectName: payload.projectName || null,
        projectAddress: null,
        jobCode: extractJobCode(payload.subject) || extractJobCode(bodyText),
        clientCompany: payload.clientCompany || null,
        bidDueDate: payload.bidDueDate || null,
        scopeSummary: deconstructed.cleanSubject,
        matchedBidNumber: null,
        matchConfidence: 0,
        matchReason: null,
        isDueDateRevised: false,
        revisedDueDate: null,
        dueDateRevisionNotes: null,
        isGcWonPrime: false,
      };
    } else {
      // Query active ITBs to supply context to AI for Addendum / Won / Lost matching
      const { data: activeBidsData } = await supabase
        .from('bid_requests')
        .select('bid_number, project_name, client_company, project_address_city, project_address_state, job_code')
        .not('bid_number', 'is', null)
        .limit(60);

      const activeBids: ActiveBidSummary[] = (activeBidsData || []).map((b) => ({
        bidNumber: b.bid_number,
        projectName: b.project_name,
        clientCompany: b.client_company,
        projectAddress: [b.project_address_city, b.project_address_state].filter(Boolean).join(', '),
        jobCode: b.job_code,
      }));

      // 1. Run Gemini AI Classifier with Active Bids matching context
      ai = await analyzeEmailWithAI({
        subject: payload.subject,
        bodyText,
        senderEmail: directSenderEmail,
        senderName: directSenderName,
        attachmentFilenames,
        activeBids,
      });
    }

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

    // 3. Match against existing bid record if AI found a match or run algorithmic matcher
    let matchedBidId: string | null = null;
    let matchedBidNumber: string | null = ai.matchedBidNumber || null;
    let matchConfidence: number = ai.matchConfidence || 0;
    let matchReason: string | null = ai.matchReason || null;
    let targetGroupId: string | null = null;
    let assignedEstimatorId: string | null = null;
    let assignedEstimatorName: string | null = null;
    let isAutoDispatched = false;

    if (matchedBidNumber) {
      const { data: matchedBidRecord } = await supabase
        .from('bid_requests')
        .select('id, duplicate_group_id, estimator_status, assigned_estimator_id, raw_payload')
        .eq('bid_number', matchedBidNumber)
        .maybeSingle();

      if (matchedBidRecord) {
        matchedBidId = matchedBidRecord.id;
        targetGroupId = matchedBidRecord.duplicate_group_id;
        assignedEstimatorId = matchedBidRecord.assigned_estimator_id || null;
        assignedEstimatorName = matchedBidRecord.raw_payload?.assigned_estimator_name || null;
        isAutoDispatched = Boolean(assignedEstimatorName || assignedEstimatorId);

        // If Won or Lost, update the parent bid's estimator_status
        if (ai.sticker === 'Won') {
          await supabase
            .from('bid_requests')
            .update({ estimator_status: 'won', priority: 'urgent' })
            .eq('id', matchedBidRecord.id);
        } else if (ai.sticker === 'Lost') {
          await supabase
            .from('bid_requests')
            .update({ estimator_status: 'lost' })
            .eq('id', matchedBidRecord.id);
        }
      }
    } else if (ai.sticker === 'Addendum') {
      // Algorithmic multi-tier match against all active ITBs
      const { data: allActiveBids } = await supabase
        .from('bid_requests')
        .select(
          'id, bid_number, email_subject, project_name, job_code, client_company, duplicate_group_id, assigned_estimator_id, raw_payload'
        )
        .not('bid_number', 'is', null);

      if (allActiveBids && allActiveBids.length > 0) {
        const candidateBids = allActiveBids.map((b: any) => ({
          id: b.id,
          bid_number: b.bid_number,
          email_subject: b.email_subject,
          project_name: b.project_name,
          job_code: b.job_code,
          client_company: b.client_company,
          duplicate_group_id: b.duplicate_group_id,
          assigned_estimator_id: b.assigned_estimator_id,
          assigned_estimator_name: b.raw_payload?.assigned_estimator_name || null,
        }));

        const match = findBestBidMatchForAddendum(
          {
            id: 'inbound',
            email_subject: payload.subject,
            project_name: effectiveProjectName,
            job_code: effectiveJobCode,
            client_company: effectiveClientCompany,
          },
          candidateBids
        );

        if (match) {
          matchedBidNumber = match.matchedBidNumber;
          matchedBidId = match.matchedBidId;
          matchConfidence = match.score;
          matchReason = match.reasons.join(', ');
          targetGroupId = match.targetGroupId || null;
          assignedEstimatorId = match.assignedEstimatorId || null;
          assignedEstimatorName = match.assignedEstimatorName || null;
          isAutoDispatched = match.isAutoDispatched;
        }
      }
    }

    // 4. Run Deduplication / Grouping (including cross-contractor project site matching)
    const duplicateEvaluation = await detectAndGroupDuplicates(
      {
        subject: ai.originalSubject || payload.subject,
        senderEmail: effectiveSenderEmail,
        senderName: effectiveSenderName,
        bodyText,
        attachments: processedAttachments,
        projectName: effectiveProjectName,
        projectAddress: ai.projectAddress,
        clientCompany: effectiveClientCompany,
        emailIntent: ai.sticker,
      },
      supabase
    );

    const finalGroupId = targetGroupId || duplicateEvaluation.duplicateGroupId;

    // 5. Determine Triage Status
    let triageStatus = 'pending_triage';
    let filterStatus = 'inbox';
    let estimatorStatus = 'unassigned';

    if (ai.sticker === 'Spam') {
      triageStatus = 'archived';
      filterStatus = 'auto_filtered';
    } else if (ai.sticker === 'Won') {
      estimatorStatus = 'won';
      triageStatus = 'assigned';
    } else if (ai.sticker === 'Lost') {
      estimatorStatus = 'lost';
      triageStatus = 'archived';
    } else if (ai.sticker === 'Addendum') {
      if (isAutoDispatched) {
        triageStatus = 'assigned';
        estimatorStatus = 'assigned';
      } else {
        triageStatus = matchedBidId ? 'ready_for_assignment' : 'pending_triage';
      }
    }

    // 6. Map sticker to enum intent
    const intentMap: Record<string, string> = {
      ITB: 'invitation_to_bid',
      Addendum: 'addendum_update',
      Won: 'bid_won',
      Lost: 'bid_lost',
      Spam: 'spam_noise',
      General: 'general_inquiry',
    };

    // 7. Insert Record into Supabase
    const bidRequestRecord = {
      source_email_id: payload.messageId || null,
      sender_email: effectiveSenderEmail,
      sender_name: effectiveSenderName,
      email_subject: payload.subject,
      email_body_text: bodyText,
      email_body_html: bodyHtml,
      email_received_at: payload.receivedAt || new Date().toISOString(),
      raw_payload: {
        ...rawBody,
        ...(assignedEstimatorName ? {
          assigned_estimator_name: assignedEstimatorName,
          auto_dispatched: isAutoDispatched,
          auto_dispatched_at: isAutoDispatched ? new Date().toISOString() : null,
          auto_matched_reason: matchReason,
        } : {})
      },

      project_name: effectiveProjectName,
      client_company: effectiveClientCompany,
      job_code: effectiveJobCode,
      bid_due_date: (() => {
        const rawDate = ai.bidDueDate || payload.bidDueDate;
        const normalized = normalizeDateToYyyyMmDd(rawDate);
        return normalized ? new Date(`${normalized}T17:00:00Z`).toISOString() : null;
      })(),

      attachments: processedAttachments,
      attachment_hashes: attachmentHashes,

      // Grouping
      duplicate_group_id: finalGroupId,
      is_flagged_duplicate: ai.sticker === 'Addendum' || duplicateEvaluation.isDuplicate,
      duplicate_of_id: matchedBidId || duplicateEvaluation.duplicateOfId,
      duplicate_confidence: duplicateEvaluation.confidence,
      duplicate_reasons: duplicateEvaluation.reasons,
      duplicate_resolution: 'unreviewed',

      // Bid Number & Matching
      matched_bid_id: matchedBidId,
      matched_bid_number: matchedBidNumber,
      match_confidence: matchConfidence,
      match_reason: matchReason,
      match_status: matchedBidId ? (isAutoDispatched ? 'auto_matched' : 'confirmed') : 'pending',
      assigned_estimator_id: assignedEstimatorId,

      // Intent & AI Extraction
      email_intent: intentMap[ai.sticker] || 'invitation_to_bid',
      intent_confidence: ai.confidence,
      intent_explanation: ai.reasoning,
      filter_status: filterStatus,

      // Forwarding & AI Metadata
      is_forwarded: ai.isForwarded,
      forwarded_by: ai.forwardedBy || (ai.isForwarded ? directSenderEmail : null),
      original_sender_email: ai.originalSenderEmail,
      original_sender_name: ai.originalSenderName,
      scope_summary: ai.scopeSummary,
      ai_analysis: ai,

      // Due date revisions & GC Won prime indicators
      is_due_date_revised: Boolean(ai.isDueDateRevised),
      revised_due_date: (() => {
        if (!ai.revisedDueDate) return null;
        const norm = normalizeDateToYyyyMmDd(ai.revisedDueDate);
        return norm ? new Date(`${norm}T17:00:00Z`).toISOString() : null;
      })(),
      is_gc_won_prime: Boolean(ai.isGcWonPrime || (ai.sticker === 'Won' && !ai.matchedBidNumber)),

      triage_status: triageStatus,
      priority: ai.sticker === 'Won' ? 'urgent' : 'normal',
      estimator_status: estimatorStatus,
    };

    const { data: inserted, error: insertError } = await supabase
      .from('bid_requests')
      .insert(bidRequestRecord)
      .select('id, bid_number, duplicate_group_id, is_flagged_duplicate, email_intent, filter_status, triage_status, matched_bid_number')
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
        bidNumber: inserted.bid_number,
        sticker: ai.sticker,
        matchedBidNumber: inserted.matched_bid_number,
        ai: {
          sticker: ai.sticker,
          confidence: ai.confidence,
          reasoning: ai.reasoning,
          isForwarded: ai.isForwarded,
          forwardedBy: ai.forwardedBy,
          originalSender: ai.originalSenderEmail,
          projectName: effectiveProjectName,
          clientCompany: effectiveClientCompany,
          scopeSummary: ai.scopeSummary,
          matchedBidNumber: ai.matchedBidNumber,
          matchConfidence: ai.matchConfidence,
          matchReason: ai.matchReason,
        },
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
