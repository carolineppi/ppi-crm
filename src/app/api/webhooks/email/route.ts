import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  detectAndGroupDuplicates,
  computeAttachmentHash,
  extractJobCode,
} from '@/lib/email-parser/deduplication';
import { classifyEmailWithML } from '@/lib/ml/classifier';
import { analyzeEmailWithAI } from '@/lib/email-parser/ai-classifier';
import { deconstructEmailThread } from '@/lib/email-parser/thread-cleaner';
import { normalizeDateToYyyyMmDd } from '@/lib/date-utils';
import { findBestBidMatchForAddendum, extractProjectCandidate } from '@/lib/matching/match-addendums';
import type { EmailAttachmentPayload } from '@/types/bid-request';

function extractBidMetadata(
  subject: string,
  bodyText: string,
  senderName: string | null,
  senderEmail: string
): {
  projectName: string | null;
  clientCompany: string | null;
  bidDueDate: string | null;
  bidDueTime: string | null;
} {
  const combined = `${subject}\n${bodyText}`;

  // 1. Project Name: explicit label or cleaned subject candidate
  const projMatch = combined.match(/(?:Project(?:\s*Name)?|Job\s*Name)\s*:\s*([^\r\n]{3,100})/i);
  const projectName = projMatch?.[1]?.trim() || extractProjectCandidate(subject, null) || null;

  // 2. Client Company / GC: explicit label or sender name
  const gcMatch = combined.match(/(?:General\s*Contractor|GC|Contractor|Company|From\s*Company)\s*:\s*([^\r\n]{2,80})/i);
  const clientCompany = gcMatch?.[1]?.trim() || senderName || senderEmail.split('@')[0] || null;

  // 3. Bid Due Date: "Bid Date:", "Due Date:", "Bids Due:", etc.
  const dateMatch = combined.match(
    /(?:Bid\s*(?:Due\s*)?Date|Due\s*Date|Bids\s*Due|Proposal\s*Due|Submit\s*By)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i
  );
  const bidDueDate = dateMatch?.[1] ? normalizeDateToYyyyMmDd(dateMatch[1]) : null;

  // 4. Bid Due Time: "at 2:00 PM", "Bid Time: 10:30 AM", etc.
  const timeMatch = combined.match(
    /(?:Bid\s*Time|Due\s*(?:at|Time)|@)\s*[:\-]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i
  ) || combined.match(/(?:Bid\s*Date|Bids\s*Due)[^\r\n]{0,40}?\b(\d{1,2}:\d{2}\s*(?:AM|PM))\b/i);
  const bidDueTime = timeMatch?.[1]?.trim().toUpperCase() || null;

  return { projectName, clientCompany, bidDueDate, bidDueTime };
}

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

    // 1. Thread deconstruction & First-Round ML Classification
    const deconstructed = deconstructEmailThread(
      payload.subject,
      bodyText,
      directSenderEmail,
      directSenderName
    );

    // Predict using rule-weighted ML algorithm (TF-IDF + Domain Rules)
    const ml = classifyEmailWithML({
      subject: payload.subject,
      bodyText,
      attachments: attachmentFilenames,
    });

    const extractedMeta = extractBidMetadata(
      deconstructed.originalSubject || payload.subject,
      bodyText,
      deconstructed.originalSenderName || directSenderName,
      deconstructed.originalSenderEmail || directSenderEmail
    );

    // 2. Second-Round LLM Confirmation & Address/Due-Date Extraction
    const llm = await analyzeEmailWithAI({
      subject: payload.subject,
      bodyText,
      senderEmail: directSenderEmail,
      senderName: directSenderName,
      attachmentFilenames,
      mlPrediction: {
        predictedClass: ml.predictedClass,
        sticker: ml.sticker,
        confidence: ml.confidence,
      },
    });

    const canonicalizeSticker = (s: string) => {
      if (s === 'Addendum / RFI' || s === 'Date Reminder') return 'Addendum';
      if (s === 'Contractor Awarded') return 'Won';
      return s;
    };

    const canonicalMl = canonicalizeSticker(ml.sticker);
    const canonicalLlm = canonicalizeSticker(llm.sticker);
    const mlLlmAgreed = Boolean(llm.agreesWithMl && canonicalMl === canonicalLlm);
    const needsCalendarManagerReview = !mlLlmAgreed;

    const ai = {
      sticker: ml.sticker,
      confidence: ml.confidence / 100,
      reasoning: mlLlmAgreed
        ? `ML (${ml.predictedClass} ${ml.confidence}%) confirmed by LLM: ${llm.reasoning}`
        : `FLAGGED FOR REVIEW — ML predicted "${ml.sticker}" (${ml.confidence}%), LLM predicted "${llm.sticker}": ${llm.reasoning}`,
      isForwarded: llm.isForwarded ?? deconstructed.isForwarded,
      forwardedBy: llm.forwardedBy ?? deconstructed.forwardedBy,
      originalSenderEmail: llm.originalSenderEmail ?? deconstructed.originalSenderEmail,
      originalSenderName: llm.originalSenderName ?? deconstructed.originalSenderName,
      originalSubject: llm.originalSubject ?? deconstructed.originalSubject,
      projectName: payload.projectName || llm.projectName || extractedMeta.projectName,
      projectAddress: llm.projectAddress || null,
      projectAddressStreet: llm.projectAddressStreet || null,
      projectAddressCity: llm.projectAddressCity || null,
      projectAddressState: llm.projectAddressState || null,
      projectAddressZip: llm.projectAddressZip || null,
      jobCode: llm.jobCode || extractJobCode(payload.subject) || extractJobCode(bodyText),
      clientCompany: payload.clientCompany || llm.clientCompany || extractedMeta.clientCompany,
      bidDueDate: llm.bidDueDate || payload.bidDueDate || extractedMeta.bidDueDate,
      bidDueTime: llm.bidDueTime || extractedMeta.bidDueTime,
      scopeSummary: llm.scopeSummary || deconstructed.cleanSubject,
      matchedBidNumber: llm.matchedBidNumber || null,
      matchConfidence: llm.matchConfidence || 0,
      matchReason: llm.matchReason || null,
      isDueDateRevised: Boolean(llm.isDueDateRevised),
      revisedDueDate: llm.revisedDueDate || null,
      dueDateRevisionNotes: llm.dueDateRevisionNotes || null,
      isGcWonPrime: Boolean(llm.isGcWonPrime || ml.predictedClass === 'Contractor Awarded'),
      mlLlmReview: {
        needsReview: needsCalendarManagerReview,
        mlSticker: ml.sticker,
        mlClass: ml.predictedClass,
        mlConfidence: ml.confidence,
        llmSticker: llm.sticker,
        llmConfidence: Math.round((llm.confidence || 0) * 100),
        llmReasoning: llm.reasoning,
        resolved: !needsCalendarManagerReview,
      },
    };

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
    } else if (ai.sticker === 'Addendum / RFI') {
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

    if (needsCalendarManagerReview) {
      // LLM disagreed with ML — hold in Calendar Manager Review queue instead of auto-routing/archiving
      triageStatus = 'pending_triage';
      filterStatus = 'inbox';
    } else if (ai.sticker === 'Spam') {
      triageStatus = 'archived';
      filterStatus = 'auto_filtered';
    } else if (ai.sticker === 'Won') {
      estimatorStatus = 'won';
      triageStatus = 'assigned';
    } else if (ai.sticker === 'Lost') {
      estimatorStatus = 'lost';
      triageStatus = 'archived';
    } else if (ai.sticker === 'Addendum / RFI') {
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
      'Addendum / RFI': 'addendum_update',
      'Date Reminder': 'date_reminder',
      Won: 'bid_won',
      'Contractor Awarded': 'bid_won',
      Lost: 'bid_lost',
      Spam: 'spam_noise',
      General: 'general_inquiry',
    };

    // Generate a bid_number for new non-duplicate ITBs so Addendums/RFIs can auto-match to them
    let generatedBidNumber: string | null = null;
    if (ai.sticker === 'ITB' && !duplicateEvaluation.isDuplicate) {
      const { data: nextNum } = await supabase.rpc('get_next_bid_number');
      if (nextNum) {
        generatedBidNumber = nextNum;
      } else {
        const currentYear = new Date().getFullYear().toString().slice(-2);
        const { count } = await supabase
          .from('bid_requests')
          .select('id', { count: 'exact', head: true })
          .not('bid_number', 'is', null);
        const seq = (count || 0) + 1;
        generatedBidNumber = `BID-${currentYear}-${seq.toString().padStart(4, '0')}`;
      }
    }

    // 7. Insert Record into Supabase
    const bidRequestRecord = {
      source_email_id: payload.messageId || null,
      bid_number: generatedBidNumber,
      sender_email: effectiveSenderEmail,
      sender_name: effectiveSenderName,
      email_subject: payload.subject,
      email_body_text: bodyText,
      email_body_html: bodyHtml,
      email_received_at: payload.receivedAt || new Date().toISOString(),
      raw_payload: {
        ...rawBody,
        ...(ai.bidDueTime ? { bid_due_time: ai.bidDueTime } : {}),
        ml_prediction: {
          predictedClass: ml.predictedClass,
          confidence: ml.confidence,
          probabilities: ml.probabilities,
        },
        ml_llm_review: ai.mlLlmReview,
        ...(assignedEstimatorName ? {
          assigned_estimator_name: assignedEstimatorName,
          auto_dispatched: isAutoDispatched,
          auto_dispatched_at: isAutoDispatched ? new Date().toISOString() : null,
          auto_matched_reason: matchReason,
        } : {})
      },

      project_name: effectiveProjectName,
      client_company: effectiveClientCompany,
      project_address_street: ai.projectAddressStreet,
      project_address_city: ai.projectAddressCity,
      project_address_state: ai.projectAddressState,
      project_address_zip: ai.projectAddressZip,
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
      is_flagged_duplicate: ai.sticker !== 'Addendum / RFI' && duplicateEvaluation.isDuplicate,
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
      email_intent: ml.intent || intentMap[ai.sticker] || 'invitation_to_bid',
      intent_confidence: ml.confidence / 100,
      intent_explanation: ai.reasoning,
      is_human_labeled: false,
      human_label: null,
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
      priority: needsCalendarManagerReview ? 'high' : ai.sticker === 'Won' ? 'urgent' : 'normal',
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
