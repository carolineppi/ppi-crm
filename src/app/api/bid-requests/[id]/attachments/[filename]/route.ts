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

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  try {
    const { id, filename: rawFilename } = await params;
    const targetFilename = decodeURIComponent(rawFilename).trim();
    const downloadParam = request.nextUrl.searchParams.get('download');
    const isDownload = downloadParam === '1' || downloadParam === 'true';

    const supabase = createServerSupabaseClient();
    const { data: bid, error } = await supabase
      .from('bid_requests')
      .select('id, email_subject, attachments, raw_payload')
      .eq('id', id)
      .single();

    if (error || !bid) {
      return new NextResponse('Bid request record not found', { status: 404 });
    }

    // Check attachments list in raw_payload first (which preserves base64 content), then attachments column
    const rawAttachments: any[] = Array.isArray(bid.raw_payload?.attachments)
      ? bid.raw_payload.attachments
      : [];
    const metaAttachments: any[] = Array.isArray(bid.attachments) ? bid.attachments : [];

    // Find attachment matching filename (case-insensitive fallback)
    let found = rawAttachments.find(
      (a) =>
        a?.filename === targetFilename ||
        (a?.filename && a.filename.toLowerCase() === targetFilename.toLowerCase())
    );

    let metaFallback = metaAttachments.find(
      (a) =>
        a?.filename === targetFilename ||
        (a?.filename && a.filename.toLowerCase() === targetFilename.toLowerCase())
    );

    const attachment = found || metaFallback;

    if (!attachment) {
      return new NextResponse(`Attachment "${targetFilename}" not found in bid request`, {
        status: 404,
      });
    }

    // 1. If storageUrl exists, redirect directly
    if (attachment.storageUrl) {
      return NextResponse.redirect(attachment.storageUrl);
    }

    // 2. If content (base64 string) exists in raw payload
    let base64Content: string | undefined = attachment.content || found?.content;

    if (base64Content && typeof base64Content === 'string' && base64Content.length > 0) {
      // Strip any data URI prefix if present (e.g. data:image/png;base64,...)
      if (base64Content.includes('base64,')) {
        base64Content = base64Content.split('base64,')[1];
      }
      const fileBuffer = Buffer.from(base64Content, 'base64');
      const mimeType = getMimeType(attachment.filename, attachment.contentType);
      const dispositionType = isDownload ? 'attachment' : 'inline';
      const cleanFilename = encodeURIComponent(attachment.filename);

      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `${dispositionType}; filename="${cleanFilename}"; filename*=UTF-8''${cleanFilename}`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    // 3. Fallback: attachment metadata exists, but binary content was not embedded in record
    const isHtmlAccept = request.headers.get('accept')?.includes('text/html');

    if (isHtmlAccept) {
      // Return a clean, user-friendly HTML advisory page
      const htmlNotice = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Attachment: ${escapeHtml(attachment.filename)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      max-width: 520px;
      width: 100%;
      padding: 32px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      background-color: #e0f2fe;
      color: #0369a1;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 19px;
      font-weight: 700;
      margin: 0 0 12px;
      color: #0f172a;
      word-break: break-word;
    }
    p {
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
      margin: 0 0 16px;
    }
    .meta-box {
      background-color: #f1f5f9;
      border-radius: 8px;
      padding: 14px;
      font-size: 12px;
      margin-bottom: 24px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px dashed #cbd5e1;
    }
    .meta-row:last-child {
      border-bottom: none;
    }
    .meta-label {
      font-weight: 600;
      color: #64748b;
    }
    .meta-val {
      font-family: monospace;
      color: #1e293b;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    .btn {
      flex: 1;
      text-align: center;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #1d4ed8;
    }
    .btn-secondary {
      background-color: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover {
      background-color: #e2e8f0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Attachment Reference</div>
    <h1>${escapeHtml(attachment.filename)}</h1>
    <p>
      This file is listed on the bid email as an external document reference or plan room drawing. Binary file data was not embedded directly inside the email body payload.
    </p>

    <div class="meta-box">
      <div class="meta-row">
        <span class="meta-label">File Name:</span>
        <span class="meta-val">${escapeHtml(attachment.filename)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Reported Size:</span>
        <span class="meta-val">${escapeHtml(formatBytes(attachment.size))}</span>
      </div>
      ${
        attachment.checksum
          ? `<div class="meta-row">
        <span class="meta-label">Checksum:</span>
        <span class="meta-val">${escapeHtml(attachment.checksum.slice(0, 16))}...</span>
      </div>`
          : ''
      }
      <div class="meta-row">
        <span class="meta-label">Email:</span>
        <span class="meta-val">${escapeHtml(bid.email_subject || 'Bid Email')}</span>
      </div>
    </div>

    <p style="font-size: 12px; color: #64748b;">
      💡 <strong>Plan Room Tip:</strong> If this project is hosted on BuildingConnected, Procore, PlanHub, or a GC FTP server, click below to open the original email document and access the direct portal link.
    </p>

    <div class="actions">
      <a href="/api/bid-requests/${id}/document" class="btn btn-primary">Open Email Document</a>
      <a href="/" class="btn btn-secondary">Close Tab</a>
    </div>
  </div>
</body>
</html>`;

      return new NextResponse(htmlNotice, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.json(
      {
        error: 'Binary attachment content was not retained in payload',
        filename: attachment.filename,
        size: attachment.size,
      },
      { status: 404 }
    );
  } catch (err: any) {
    return new NextResponse(`Error retrieving attachment: ${err?.message}`, { status: 500 });
  }
}
