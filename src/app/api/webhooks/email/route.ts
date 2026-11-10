import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  detectAndGroupDuplicates,
  computeAttachmentHash,
  extractJobCode,
} from '@/lib/email-parser/deduplication';
import type { EmailAttachmentPayload } from '@/types/bid-request';

// Validation schema for incoming email parser payloads
const attachmentSchema = z.object({
  filename: z.string(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  checksum: z.string().optional(),
  content: z.string().optional(), // base64 encoded content
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

/**
 * Normalizes sender into distinct name and email string.
 */
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

  // Handle format: "First Last <email@domain.com>" or "email@domain.com"
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

/**
 * POST /api/webhooks/email
 * Ingests inbound email payloads, calculates duplicate grouping heuristics,
 * and records the bid request in Supabase for Calendar Manager triage.
 */
export async function POST(request: NextRequest) {
  try {
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
    const { email: senderEmail, name: senderName } = parseSender(
      payload.sender,
      payload.senderEmail,
      payload.senderName
    );

    const bodyText = payload.bodyText || payload.body || '';
    const bodyHtml = payload.bodyHtml || null;
    const jobCode = extractJobCode(payload.subject) || extractJobCode(bodyText);

    // Compute checksums for all incoming attachments
    const processedAttachments: EmailAttachmentPayload[] = (payload.attachments || []).map(
      (att) => {
        const hash = computeAttachmentHash(att);
        return {
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          checksum: hash,
          storageUrl: att.storageUrl,
        };
      }
    );

    const attachmentHashes = processedAttachments.map((a) => a.checksum!).filter(Boolean);

    // Initialize Supabase Server Client
    const supabase = createServerSupabaseClient();

    // Run backend duplicate detection and grouping
    const duplicateEvaluation = await detectAndGroupDuplicates(
      {
        subject: payload.subject,
        senderEmail,
        senderName,
        bodyText,
        attachments: processedAttachments,
      },
      supabase
    );

    // Prepare Bid Request record for database insertion
    const bidRequestRecord = {
      source_email_id: payload.messageId || null,
      sender_email: senderEmail,
      sender_name: senderName,
      email_subject: payload.subject,
      email_body_text: bodyText,
      email_body_html: bodyHtml,
      email_received_at: payload.receivedAt || new Date().toISOString(),
      raw_payload: rawBody,

      // Project Extraction / Metadata
      project_name: payload.projectName || null,
      client_company: payload.clientCompany || null,
      job_code: jobCode,
      bid_due_date: payload.bidDueDate || null,

      // Attachments & Hashes
      attachments: processedAttachments,
      attachment_hashes: attachmentHashes,

      // Duplicate Grouping & Detection Results
      duplicate_group_id: duplicateEvaluation.duplicateGroupId,
      is_flagged_duplicate: duplicateEvaluation.isDuplicate,
      duplicate_of_id: duplicateEvaluation.duplicateOfId,
      duplicate_confidence: duplicateEvaluation.confidence,
      duplicate_reasons: duplicateEvaluation.reasons,
      duplicate_resolution: 'unreviewed',

      // Initial Calendar Manager & Estimator States
      triage_status: 'pending_triage',
      priority: 'normal',
      estimator_status: 'unassigned',
    };

    const { data: inserted, error: insertError } = await supabase
      .from('bid_requests')
      .insert(bidRequestRecord)
      .select('id, duplicate_group_id, is_flagged_duplicate, duplicate_reasons, triage_status')
      .single();

    if (insertError) {
      console.error('Error inserting bid request:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to insert bid request',
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        bidRequestId: inserted.id,
        isFlaggedDuplicate: inserted.is_flagged_duplicate,
        duplicateGroupId: inserted.duplicate_group_id,
        reasons: duplicateEvaluation.reasons,
        confidence: duplicateEvaluation.confidence,
        triageStatus: inserted.triage_status,
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
