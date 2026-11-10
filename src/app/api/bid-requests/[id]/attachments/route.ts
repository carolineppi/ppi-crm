import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function getMimeType(filename: string, existingType?: string): string {
  if (existingType && existingType !== 'application/octet-stream') {
    return existingType;
  }
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    case 'txt':
      return 'text/plain; charset=utf-8';
    case 'csv':
      return 'text/csv; charset=utf-8';
    case 'html':
    case 'htm':
      return 'text/html; charset=utf-8';
    case 'zip':
      return 'application/zip';
    case 'dwg':
      return 'application/acad';
    case 'dxf':
      return 'application/dxf';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const requestedFilename = searchParams.get('filename') || searchParams.get('name');
    const requestedIndex = searchParams.get('index');
    const isDownload = searchParams.get('download') === '1' || searchParams.get('download') === 'true';

    const supabase = createServerSupabaseClient();
    const { data: bid, error } = await supabase
      .from('bid_requests')
      .select('id, email_subject, attachments, raw_payload')
      .eq('id', id)
      .single();

    if (error || !bid) {
      return NextResponse.json({ error: 'Bid request record not found' }, { status: 404 });
    }

    const rawAttachments: any[] = Array.isArray(bid.raw_payload?.attachments)
      ? bid.raw_payload.attachments
      : [];
    const metaAttachments: any[] = Array.isArray(bid.attachments) ? bid.attachments : [];

    // Combine attachments with content availability
    const allAttachments = (rawAttachments.length > 0 ? rawAttachments : metaAttachments).map(
      (att: any, idx: number) => {
        const rawMatch = rawAttachments.find((r) => r.filename === att.filename) || rawAttachments[idx];
        const hasContent = Boolean(
          (rawMatch?.content && rawMatch.content.length > 0) || (att?.content && att.content.length > 0)
        );
        const encodedName = encodeURIComponent(att.filename);
        return {
          filename: att.filename,
          size: att.size,
          contentType: att.contentType || getMimeType(att.filename),
          checksum: att.checksum,
          storageUrl: att.storageUrl || null,
          hasContent,
          url: att.storageUrl || `/api/bid-requests/${id}/attachments/${encodedName}`,
          downloadUrl: att.storageUrl || `/api/bid-requests/${id}/attachments/${encodedName}?download=1`,
        };
      }
    );

    // If a specific filename or index was requested as a query param, serve it
    if (requestedFilename || requestedIndex !== null) {
      let matchedAtt = null;
      let matchedRaw = null;

      if (requestedFilename) {
        const cleanName = requestedFilename.trim().toLowerCase();
        matchedAtt = allAttachments.find((a) => a.filename.toLowerCase() === cleanName);
        matchedRaw = rawAttachments.find((a) => a.filename?.toLowerCase() === cleanName);
      } else if (requestedIndex !== null) {
        const idx = parseInt(requestedIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < allAttachments.length) {
          matchedAtt = allAttachments[idx];
          matchedRaw = rawAttachments[idx];
        }
      }

      if (!matchedAtt) {
        return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
      }

      if (matchedAtt.storageUrl) {
        return NextResponse.redirect(matchedAtt.storageUrl);
      }

      let base64Content = matchedRaw?.content;
      if (base64Content && typeof base64Content === 'string' && base64Content.length > 0) {
        if (base64Content.includes('base64,')) {
          base64Content = base64Content.split('base64,')[1];
        }
        const buffer = Buffer.from(base64Content, 'base64');
        const mimeType = matchedAtt.contentType || getMimeType(matchedAtt.filename);
        const disposition = isDownload ? 'attachment' : 'inline';
        const cleanFilename = encodeURIComponent(matchedAtt.filename);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'Content-Disposition': `${disposition}; filename="${cleanFilename}"; filename*=UTF-8''${cleanFilename}`,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      // If no binary content, redirect to the filename handler for the friendly advisory page
      const encodedName = encodeURIComponent(matchedAtt.filename);
      return NextResponse.redirect(new URL(`/api/bid-requests/${id}/attachments/${encodedName}`, request.url));
    }

    // Default: return JSON list of all attachments
    return NextResponse.json({
      bidId: id,
      count: allAttachments.length,
      attachments: allAttachments,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve attachments' },
      { status: 500 }
    );
  }
}
