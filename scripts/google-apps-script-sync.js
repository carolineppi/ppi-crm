/**
 * =============================================================================
 * GOOGLE APPS SCRIPT: 100% Covert Gmail Ingestion to CRM Webhook
 * =============================================================================
 * 
 * - ZERO labels created or applied
 * - ZERO emails modified or marked as read
 * - 100% invisible to daily inbox users
 * - Tracks progress invisibly using Apps Script's internal ScriptProperties
 * - Only requires read-only permission ("View your email messages")
 */

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------
const WEBHOOK_URL = "https://ppi-crm.vercel.app/api/webhooks/email";
const BATCH_SIZE = 25;

/**
 * Main Sync Function: Searches for new emails since the last checkpoint,
 * computes attachment hashes, and sends them to the CRM webhook without
 * touching or altering the mailbox in any way.
 */
function syncBidsToCRM() {
  const props = PropertiesService.getScriptProperties();
  const lastProcessedEpoch = props.getProperty("LAST_PROCESSED_TIME");

  let query = "in:inbox";
  if (lastProcessedEpoch) {
    // Only search for emails received after the last checkpoint
    const afterSeconds = Math.floor(Number(lastProcessedEpoch) / 1000);
    query += ` after:${afterSeconds}`;
  } else {
    // On the very first run, look back 3 days (adjust as needed)
    const initialLookbackSeconds = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
    query += ` after:${initialLookbackSeconds}`;
  }

  const threads = GmailApp.search(query, 0, BATCH_SIZE);
  if (threads.length === 0) {
    Logger.log("No new emails found since last checkpoint.");
    return;
  }

  Logger.log(`Found ${threads.length} threads to check.`);
  let highestTimestampFound = Number(lastProcessedEpoch) || 0;

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      if (message.isDraft()) continue;

      const msgDate = message.getDate();
      const msgTime = msgDate.getTime();

      // Skip messages older than or equal to our last checkpoint
      if (lastProcessedEpoch && msgTime <= Number(lastProcessedEpoch)) {
        continue;
      }

      if (msgTime > highestTimestampFound) {
        highestTimestampFound = msgTime;
      }

      // Process attachments & compute SHA-256 hashes
      const rawAttachments = message.getAttachments();
      const processedAttachments = rawAttachments.map((att) => {
        const bytes = att.getBytes();
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

        // Attach content only if under 5MB to keep POST light
        if (att.getSize() < 5 * 1024 * 1024) {
          attObj.content = Utilities.base64Encode(bytes);
        }

        return attObj;
      });

      const payload = {
        messageId: message.getId(),
        subject: message.getSubject() || "(No Subject)",
        bodyText: message.getPlainBody() || "",
        bodyHtml: message.getBody() || "",
        sender: message.getFrom(),
        receivedAt: msgDate.toISOString(),
        attachments: processedAttachments,
      };

      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      };

      try {
        const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
        Logger.log(`✔ Ingested: "${message.getSubject()}" (${response.getResponseCode()})`);
      } catch (err) {
        Logger.log(`❌ Error on message ${message.getId()}: ${err}`);
      }
    }
  }

  // Save the highest timestamp checkpoint internally in Google Apps Script
  if (highestTimestampFound > (Number(lastProcessedEpoch) || 0)) {
    props.setProperty("LAST_PROCESSED_TIME", highestTimestampFound.toString());
    Logger.log(`Checkpoint updated to: ${new Date(highestTimestampFound).toISOString()}`);
  }
}

/**
 * Helper: Reset the checkpoint if you ever want to re-scan the last 3 days
 */
function resetCheckpoint() {
  PropertiesService.getScriptProperties().deleteProperty("LAST_PROCESSED_TIME");
  Logger.log("Checkpoint reset. Next sync will look back 3 days.");
}
