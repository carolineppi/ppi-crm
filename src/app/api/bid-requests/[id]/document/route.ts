import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { data: bid, error } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !bid) {
      return new NextResponse('Bid request email not found', { status: 404 });
    }

    const subject = bid.email_subject || 'Untitled Bid Request';
    const senderName = bid.sender_name || bid.sender_email?.split('@')[0] || 'Unknown Sender';
    const senderEmail = bid.sender_email || '';
    const receivedAt = new Date(bid.email_received_at || bid.created_at).toLocaleString();
    const isForwarded = Boolean(bid.is_forwarded);
    const forwardedBy = bid.forwarded_by;
    const originalSenderName = bid.original_sender_name;
    const originalSenderEmail = bid.original_sender_email;
    const htmlBody = bid.email_body_html || '';
    const textBody = bid.email_body_text || bid.raw_payload?.bodyText || bid.raw_payload?.body || '';

    // If original HTML exists, embed it with print / document enhancements
    if (htmlBody && htmlBody.trim().length > 0) {
      const printStyles = `
        <style id="ppi-doc-styles">
          @page {
            size: letter;
            margin: 15mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 18px !important;
          }
          img {
            max-width: 100% !important;
            height: auto !important;
          }
          table {
            max-width: 100% !important;
          }
        </style>
        <base target="_blank">
      `;

      let finalHtml = htmlBody;
      if (finalHtml.includes('<head>')) {
        finalHtml = finalHtml.replace('<head>', `<head>${printStyles}`);
      } else if (finalHtml.includes('<html>')) {
        finalHtml = finalHtml.replace('<html>', `<html><head>${printStyles}</head>`);
      } else {
        finalHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${printStyles}</head><body>${finalHtml}</body></html>`;
      }

      return new NextResponse(finalHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Frame-Options': 'SAMEORIGIN',
        },
      });
    }

    // Synthesize high-fidelity PDF/Document HTML for text-only emails
    const docHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    @page {
      size: letter;
      margin: 15mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 0;
      padding: 32px 36px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-box {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    .subject {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .meta-table td {
      padding: 3px 0;
      vertical-align: top;
    }
    .meta-label {
      width: 100px;
      font-weight: 600;
      color: #64748b;
    }
    .meta-value {
      color: #1e293b;
    }
    .content-box {
      font-size: 14px;
      color: #1e293b;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: inherit;
    }
  </style>
  <base target="_blank">
</head>
<body>
  <div class="header-box">
    <div class="subject">${escapeHtml(subject)}</div>
    <table class="meta-table">
      <tr>
        <td class="meta-label">From:</td>
        <td class="meta-value"><strong>${escapeHtml(senderName)}</strong> &lt;${escapeHtml(senderEmail)}&gt;</td>
      </tr>
      ${
        isForwarded
          ? `<tr>
        <td class="meta-label">Client / GC:</td>
        <td class="meta-value"><strong>${escapeHtml(originalSenderName || senderName)}</strong> &lt;${escapeHtml(originalSenderEmail || senderEmail)}&gt; <span style="color:#4f46e5">(via ${escapeHtml(forwardedBy || 'Coworker')})</span></td>
      </tr>`
          : ''
      }
      <tr>
        <td class="meta-label">Date:</td>
        <td class="meta-value">${escapeHtml(receivedAt)}</td>
      </tr>
      ${
        bid.bid_number
          ? `<tr>
        <td class="meta-label">Bid Number:</td>
        <td class="meta-value" style="font-family: monospace; font-weight: bold; color: #1d4ed8;">${escapeHtml(bid.bid_number)}</td>
      </tr>`
          : ''
      }
    </table>
  </div>
  <div class="content-box">${escapeHtml(textBody || '(No text body content available)')}</div>
</body>
</html>`;

    return new NextResponse(docHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error loading document: ${err?.message}`, { status: 500 });
  }
}
