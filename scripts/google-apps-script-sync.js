/**
 * =============================================================================
 * GOOGLE APPS SCRIPT: Automated Gmail Ingestion to CRM Webhook
 * =============================================================================
 * 
 * Instructions:
 * 1. Go to https://script.google.com and click "New project".
 * 2. Replace the contents of Code.gs with this script.
 * 3. Update the WEBHOOK_URL below with your live Vercel URL.
 * 4. Run `syncBidsToCRM()` once manually to grant permissions.
 * 5. Set up a Time-driven Trigger (Triggers > Add Trigger > syncBidsToCRM > Time-driven > Every 1 or 5 minutes).
 */

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------
// Replace with your production Vercel URL
const WEBHOOK_URL = "https://ppi-crm.vercel.app/api/webhooks/email";

// Optional: Webhook security token (if configured in Vercel environment variables)
const WEBHOOK_SECRET = ""; 

// Gmail Label applied to emails once sent to the CRM
const PROCESSED_LABEL_NAME = "CRM/Ingested";

// Max threads to process per run (keeps execution well under Apps Script 6-min timeout)
const BATCH_SIZE = 15;

/**
 * Main Sync Function: Searches for unhandled emails, extracts project info & attachments,
 * and posts them to the Next.js CRM webhook.
 */
function syncBidsToCRM() {
  // 1. Ensure the tracking label exists in Gmail
  let processedLabel = GmailApp.getUserLabelByName(PROCESSED_LABEL_NAME);
  if (!processedLabel) {
    processedLabel = GmailApp.createLabel(PROCESSED_LABEL_NAME);
  }

  // 2. Search for inbox messages that have not yet been ingested
  // Filters out drafts and already-processed threads
  const query = `in:inbox -label:${PROCESSED_LABEL_NAME}`;
  const threads = GmailApp.search(query, 0, BATCH_SIZE);

  if (threads.length === 0) {
    Logger.log("No new emails to ingest.");
    return;
  }

  Logger.log(`Found ${threads.length} threads to evaluate.`);

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      if (message.isDraft()) continue;

      // Extract and process attachments
      const rawAttachments = message.getAttachments();
      const processedAttachments = rawAttachments.map((att) => {
        const bytes = att.getBytes();

        // Compute SHA-256 hash inside Google's engine for instant duplicate collision detection
        const rawDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
        const checksum = rawDigest
          .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
          .join('');

        const attObj = {
          filename: att.getName(),
          contentType: att.getContentType(),
          size: att.getSize(),
          checksum: checksum,
        };

        // If file is under 5MB, attach base64 content; otherwise send checksum & metadata
        if (att.getSize() < 5 * 1024 * 1024) {
          attObj.content = Utilities.base64Encode(bytes);
        }

        return attObj;
      });

      // Construct Webhook Payload
      const payload = {
        messageId: message.getId(),
        subject: message.getSubject() || "(No Subject)",
        bodyText: message.getPlainBody() || "",
        bodyHtml: message.getBody() || "",
        sender: message.getFrom(),
        receivedAt: message.getDate().toISOString(),
        attachments: processedAttachments,
      };

      // HTTP Headers
      const headers = {
        "Content-Type": "application/json",
      };
      if (WEBHOOK_SECRET) {
        headers["x-webhook-secret"] = WEBHOOK_SECRET;
      }

      const options = {
        method: "post",
        contentType: "application/json",
        headers: headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      };

      try {
        const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
        const statusCode = response.getResponseCode();
        const responseBody = response.getContentText();

        if (statusCode >= 200 && statusCode < 300) {
          Logger.log(`✔ Ingested: "${message.getSubject()}" -> Response: ${responseBody}`);
        } else {
          Logger.log(`⚠ Webhook Error [${statusCode}] on "${message.getSubject()}": ${responseBody}`);
        }
      } catch (err) {
        Logger.log(`❌ Network/Fetch Error for message ID ${message.getId()}: ${err}`);
      }
    }

    // Mark the entire thread as processed so it isn't queried again
    thread.addLabel(processedLabel);
  }
}
