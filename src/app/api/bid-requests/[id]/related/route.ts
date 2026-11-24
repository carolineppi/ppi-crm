import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function categorizeAttachment(filename: string): 'contracts' | 'plans_drawings' | 'addenda_specs' | 'spreadsheets' | 'photos_images' | 'other' {
  const lower = filename.toLowerCase();
  const ext = lower.split('.').pop() || '';

  if (lower.includes('contract') || lower.includes('agreement') || lower.includes('subcontract') || lower.includes('scope')) {
    return 'contracts';
  }
  if (lower.includes('addend') || lower.includes('bulletin') || lower.includes('rfi') || lower.includes('clarif')) {
    return 'addenda_specs';
  }
  if (['dwg', 'dxf', 'cad'].includes(ext) || lower.includes('plan') || lower.includes('drawing') || lower.includes('sheet') || lower.includes('elevat') || lower.includes('cd')) {
    return 'plans_drawings';
  }
  if (['xlsx', 'xls', 'csv'].includes(ext) || lower.includes('sched') || lower.includes('takeoff')) {
    return 'spreadsheets';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext)) {
    return 'photos_images';
  }
  if (ext === 'pdf') {
    return 'plans_drawings';
  }
  return 'other';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { requireApiAuth } = await import('@/lib/auth/rbac');
  const { errorResponse } = await requireApiAuth(['admin', 'calendar_manager', 'estimator']);
  if (errorResponse) return errorResponse;
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const relatedSelect = `
      id,
      bid_number,
      project_name,
      client_company,
      project_address_city,
      project_address_state,
      job_code,
      assigned_estimator_id,
      assigned_estimator_name:raw_payload->>assigned_estimator_name,
      estimator_status,
      bid_due_date,
      estimator_notes:raw_payload->>estimator_notes,
      google_drive_folder_url,
      email_subject,
      sender_name,
      sender_email,
      email_received_at,
      created_at,
      email_intent,
      scope_summary,
      ai_scope_summary:ai_analysis->>scopeSummary,
      ai_project_name:ai_analysis->>projectName,
      ai_client_company:ai_analysis->>clientCompany,
      email_body_text,
      email_body_html,
      is_forwarded,
      forwarded_by,
      original_sender_name,
      original_sender_email,
      attachments,
      bid_documents,
      duplicate_group_id,
      duplicate_of_id,
      matched_bid_id,
      matched_bid_number,
      raw_payload_attachments:raw_payload->attachments,
      raw_payload_body_text:raw_payload->>bodyText,
      raw_payload_body_html:raw_payload->>bodyHtml,
      raw_payload_body:raw_payload->>body
    `.replace(/\s+/g, ' ').trim();

    // 1. Fetch the primary bid request
    const { data: primaryRaw, error: primaryError } = await supabase
      .from('bid_requests')
      .select(relatedSelect as any)
      .eq('id', id)
      .single();

    const primary = primaryRaw as any;
    if (primaryError || !primary) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    // 2. Fetch all related records (group members, child addendums, matched bid numbers)
    const groupId = (primary as any).duplicate_group_id;
    const bidNumber = (primary as any).bid_number;
    const duplicateOfId = (primary as any).duplicate_of_id;

    let query = supabase
      .from('bid_requests')
      .select(relatedSelect as any);

    // Build OR filters
    const orConditions: string[] = [`id.eq.${id}`];
    if (groupId) {
      orConditions.push(`duplicate_group_id.eq.${groupId}`);
    }
    if (duplicateOfId) {
      orConditions.push(`id.eq.${duplicateOfId}`);
    }
    orConditions.push(`duplicate_of_id.eq.${id}`);
    orConditions.push(`matched_bid_id.eq.${id}`);
    if (bidNumber) {
      orConditions.push(`matched_bid_number.eq.${bidNumber}`);
    }

    query = query.or(orConditions.join(',')).order('created_at', { ascending: true });

    const { data: relatedRecords, error: relatedError } = await query;

    if (relatedError) {
      return NextResponse.json({ error: relatedError.message }, { status: 500 });
    }

    const records = relatedRecords || [primary];

    // 3. Map all related emails
    const emails = records.map((r: any) => {
      let sticker: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam' = 'ITB';
      if (r.email_intent === 'addendum_update') sticker = 'Addendum';
      else if (r.email_intent === 'bid_won') sticker = 'Won';
      else if (r.email_intent === 'bid_lost') sticker = 'Lost';
      else if (r.email_intent === 'spam_noise') sticker = 'Spam';

      const rawAtts = Array.isArray(r.raw_payload_attachments)
        ? r.raw_payload_attachments
        : Array.isArray(r.attachments)
        ? r.attachments
        : [];

      return {
        id: r.id,
        isPrimary: r.id === (primary as any).id,
        subject: r.email_subject || 'Untitled Email',
        senderName: r.sender_name || r.sender_email?.split('@')[0] || 'Unknown Sender',
        senderEmail: r.sender_email || '',
        receivedAt: new Date(r.email_received_at || r.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        emailIntent: r.email_intent,
        sticker,
        scopeSummary: r.scope_summary || r.ai_scope_summary || null,
        bodyText: r.email_body_text || r.raw_payload_body_text || r.raw_payload_body || '',
        bodyHtml: r.email_body_html || r.raw_payload_body_html || null,
        isForwarded: Boolean(r.is_forwarded),
        forwardedBy: r.forwarded_by,
        originalSenderName: r.original_sender_name,
        originalSenderEmail: r.original_sender_email,
        attachments: rawAtts.map((a: any) => ({
          filename: a.filename,
          size: a.size,
          formattedSize: formatBytes(a.size),
          contentType: a.contentType,
          checksum: a.checksum,
          storageUrl: a.storageUrl,
          previewUrl: a.storageUrl || `/api/bid-requests/${r.id}/attachments/${encodeURIComponent(a.filename)}`,
          downloadUrl: a.storageUrl || `/api/bid-requests/${r.id}/attachments/${encodeURIComponent(a.filename)}?download=1`,
        })),
      };
    });

    // 4. Aggregate and deduplicate all attachments across all emails & manual uploads
    const seenFiles = new Set<string>();
    const allAttachments: any[] = [];

    records.forEach((r: any) => {
      const combinedDocs: any[] = [];
      if (Array.isArray(r.bid_documents)) combinedDocs.push(...r.bid_documents);
      if (Array.isArray(r.attachments)) combinedDocs.push(...r.attachments);
      if (Array.isArray(r.raw_payload_attachments)) combinedDocs.push(...r.raw_payload_attachments);

      combinedDocs.forEach((a: any) => {
        // Unique key by storageUrl or checksum or filename + size
        const key = a.storageUrl || a.checksum || `${a.filename?.toLowerCase()}_${a.size || 0}`;
        if (a.filename && !seenFiles.has(key)) {
          seenFiles.add(key);
          const category = a.category || categorizeAttachment(a.filename);
          allAttachments.push({
            filename: a.filename,
            size: a.size,
            formattedSize: formatBytes(a.size),
            contentType: a.contentType,
            checksum: a.checksum,
            category,
            fromBidId: r.id,
            fromEmailSubject: a.isManualUpload ? 'Direct Upload' : (r.email_subject || 'Bid Email'),
            fromEmailDate: a.uploadedAt
              ? new Date(a.uploadedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : new Date(r.email_received_at || r.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                }),
            isAddendum: r.email_intent === 'addendum_update' || a.filename.toLowerCase().includes('addend'),
            isManualUpload: Boolean(a.isManualUpload),
            storageUrl: a.storageUrl || null,
            previewUrl: a.storageUrl || `/api/bid-requests/${r.id}/attachments/${encodeURIComponent(a.filename)}`,
            downloadUrl: a.storageUrl || `/api/bid-requests/${r.id}/attachments/${encodeURIComponent(a.filename)}?download=1`,
          });
        }
      });
    });

    // Sort attachments: contracts first, then plans & addenda, then by size descending
    allAttachments.sort((a, b) => {
      const order = { contracts: 1, plans_drawings: 2, addenda_specs: 3, spreadsheets: 4, photos_images: 5, other: 6 };
      const diff = (order[a.category as keyof typeof order] || 6) - (order[b.category as keyof typeof order] || 6);
      if (diff !== 0) return diff;
      return (b.size || 0) - (a.size || 0);
    });

    // 5. Fetch any linked quote carts for this bid or its group siblings
    const relatedRecordIds = records.map((r: any) => r.id).filter(Boolean);
    let quoteCarts: any[] = [];
    if (relatedRecordIds.length > 0) {
      const { data: carts } = await supabase
        .from('job_quote_carts')
        .select('*')
        .in('bid_request_id', relatedRecordIds)
        .order('updated_at', { ascending: false });
      quoteCarts = carts || [];
    }

    return NextResponse.json({
      primaryBid: {
        id: primary.id,
        bidNumber: primary.bid_number,
        projectName: primary.project_name || primary.ai_project_name || 'Untitled Project',
        clientCompany: primary.client_company || primary.ai_client_company || 'Unknown GC',
        projectAddress: [primary.project_address_city, primary.project_address_state].filter(Boolean).join(', ') || null,
        jobCode: primary.job_code,
        assignedEstimator: primary.assigned_estimator_name || (primary.assigned_estimator_id ? 'Assigned' : null),
        estimatorStatus: primary.estimator_status || 'unassigned',
        bidDueDate: primary.bid_due_date,
        scopeSummary: primary.scope_summary || primary.ai_scope_summary,
        estimatorNotes: primary.estimator_notes || '',
        googleDriveFolderUrl: primary.google_drive_folder_url || null,
        totalEmailsCount: emails.length,
        totalAttachmentsCount: allAttachments.length,
      },
      emails,
      allAttachments,
      quoteCarts,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch related job dossier' },
      { status: 500 }
    );
  }
}
