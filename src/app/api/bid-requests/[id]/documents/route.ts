import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function categorizeFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('contract') || lower.includes('agreement') || lower.includes('subcontract') || lower.includes('scope')) {
    return 'contracts';
  }
  if (lower.includes('addend') || lower.includes('bulletin') || lower.includes('rfi') || lower.includes('clarif')) {
    return 'addenda_specs';
  }
  if (['dwg', 'dxf', 'cad'].some((ext) => lower.endsWith(ext)) || lower.includes('plan') || lower.includes('drawing') || lower.includes('sheet') || lower.includes('elevat')) {
    return 'plans_drawings';
  }
  if (['xlsx', 'xls', 'csv'].some((ext) => lower.endsWith(ext)) || lower.includes('takeoff') || lower.includes('schedule') || lower.includes('budget')) {
    return 'spreadsheets';
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].some((ext) => lower.endsWith(ext))) {
    return 'photos_images';
  }
  return 'contracts';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    // 1. Fetch current record
    const { data: bid, error: fetchErr } = await supabase
      .from('bid_requests')
      .select('id, attachments, bid_documents, google_drive_folder_url')
      .eq('id', id)
      .single();

    if (fetchErr || !bid) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';
    let updatedDriveUrl: string | undefined = undefined;
    let newDocumentRecord: any = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const categoryParam = formData.get('category') as string | null;
      const driveUrlParam = formData.get('googleDriveFolderUrl') as string | null;

      if (driveUrlParam !== null) {
        updatedDriveUrl = driveUrlParam.trim();
      }

      if (file && typeof file === 'object' && file.name) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('bid-documents')
          .upload(storagePath, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
          });

        if (uploadError) {
          console.error('Supabase storage upload error:', uploadError);
          return NextResponse.json(
            { error: 'Failed to upload document to storage', details: uploadError.message },
            { status: 500 }
          );
        }

        const { data: publicUrlData } = supabase.storage
          .from('bid-documents')
          .getPublicUrl(storagePath);

        const category = categoryParam || categorizeFilename(file.name);

        newDocumentRecord = {
          filename: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          storageUrl: publicUrlData.publicUrl,
          category,
          uploadedAt: new Date().toISOString(),
          isManualUpload: true,
        };

        const existingAttachments = Array.isArray(bid.attachments) ? bid.attachments : [];
        const existingDocs = Array.isArray(bid.bid_documents) ? bid.bid_documents : [];

        const updatedAttachments = [...existingAttachments, newDocumentRecord];
        const updatedDocs = [...existingDocs, newDocumentRecord];

        const updates: Record<string, any> = {
          attachments: updatedAttachments,
          bid_documents: updatedDocs,
          updated_at: new Date().toISOString(),
        };

        if (updatedDriveUrl !== undefined) {
          updates.google_drive_folder_url = updatedDriveUrl || null;
        }

        const { error: updateErr } = await supabase
          .from('bid_requests')
          .update(updates)
          .eq('id', id);

        if (updateErr) {
          console.error('Error updating bid request with new document:', updateErr);
          return NextResponse.json(
            { error: 'Failed to attach document to bid', details: updateErr.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          document: newDocumentRecord,
          googleDriveFolderUrl: updatedDriveUrl !== undefined ? updatedDriveUrl : bid.google_drive_folder_url,
        });
      }
    } else {
      // JSON body (signed upload URL, document registration, or Google Drive folder link)
      const body = await request.json();

      if (body.action === 'create_upload_url') {
        const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
        if (!filename) {
          return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
        }
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${id}/${Date.now()}_${safeName}`;

        const { data: signedData, error: signedErr } = await supabase.storage
          .from('bid-documents')
          .createSignedUploadUrl(storagePath);

        if (signedErr || !signedData?.signedUrl) {
          return NextResponse.json(
            { error: 'Failed to create upload URL', details: signedErr?.message },
            { status: 500 }
          );
        }

        const { data: publicUrlData } = supabase.storage
          .from('bid-documents')
          .getPublicUrl(storagePath);

        return NextResponse.json({
          success: true,
          signedUrl: signedData.signedUrl,
          token: signedData.token,
          path: storagePath,
          publicUrl: publicUrlData.publicUrl,
        });
      }

      if (body.action === 'register_document') {
        const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
        const storageUrl = typeof body.storageUrl === 'string' ? body.storageUrl.trim() : '';
        if (!filename || !storageUrl) {
          return NextResponse.json(
            { error: 'filename and storageUrl are required' },
            { status: 400 }
          );
        }

        const category =
          (typeof body.category === 'string' && body.category.trim()) ||
          categorizeFilename(filename);

        newDocumentRecord = {
          filename,
          size: Number(body.size) || 0,
          contentType: body.contentType || 'application/octet-stream',
          storageUrl,
          category,
          uploadedAt: new Date().toISOString(),
          isManualUpload: true,
        };

        const existingAttachments = Array.isArray(bid.attachments) ? bid.attachments : [];
        const existingDocs = Array.isArray(bid.bid_documents) ? bid.bid_documents : [];

        const { error: updateErr } = await supabase
          .from('bid_requests')
          .update({
            attachments: [...existingAttachments, newDocumentRecord],
            bid_documents: [...existingDocs, newDocumentRecord],
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (updateErr) {
          return NextResponse.json(
            { error: 'Failed to attach document to bid', details: updateErr.message },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          document: newDocumentRecord,
        });
      }

      if (body.googleDriveFolderUrl !== undefined) {
        updatedDriveUrl = typeof body.googleDriveFolderUrl === 'string' ? body.googleDriveFolderUrl.trim() : null;
      }
    }

    if (updatedDriveUrl !== undefined) {
      const { error: updateErr } = await supabase
        .from('bid_requests')
        .update({
          google_drive_folder_url: updatedDriveUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateErr) {
        return NextResponse.json(
          { error: 'Failed to update Google Drive folder link', details: updateErr.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        googleDriveFolderUrl: updatedDriveUrl || null,
      });
    }

    return NextResponse.json({ error: 'No file or Google Drive URL provided' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in POST /api/bid-requests/[id]/documents:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const filenameToDelete = body.filename;

    if (!filenameToDelete) {
      return NextResponse.json({ error: 'Filename is required to delete' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: bid, error: fetchErr } = await supabase
      .from('bid_requests')
      .select('id, attachments, bid_documents')
      .eq('id', id)
      .single();

    if (fetchErr || !bid) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    const existingAttachments = Array.isArray(bid.attachments) ? bid.attachments : [];
    const existingDocs = Array.isArray(bid.bid_documents) ? bid.bid_documents : [];

    const updatedAttachments = existingAttachments.filter(
      (a: any) => a.filename !== filenameToDelete
    );
    const updatedDocs = existingDocs.filter(
      (a: any) => a.filename !== filenameToDelete
    );

    const { error: updateErr } = await supabase
      .from('bid_requests')
      .update({
        attachments: updatedAttachments,
        bid_documents: updatedDocs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to remove document', details: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, remainingCount: updatedAttachments.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Internal server error', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
