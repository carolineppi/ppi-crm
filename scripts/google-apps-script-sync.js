/**
 * =============================================================================
 * GOOGLE APPS SCRIPT: Gmail Ingestion & Historical Backfill to CRM
 * =============================================================================
 * 
 * - ZERO labels created or applied
 * - ZERO emails modified or marked as read
 * - 100% invisible to daily inbox users
 * - Tracks live progress invisibly using ScriptProperties
 * - Includes dedicated `backfillHistoricalBids()` to pull historical archives
 */

// -----------------------------------------------------------------------------
// CONFIGURATION
// -----------------------------------------------------------------------------
const WEBHOOK_URL = "https://ppi-crm.vercel.app/api/webhooks/email";
const LIVE_BATCH_SIZE = 25;

// BACKFILL SETTINGS (Adjust these as desired when running a backfill)
const BACKFILL_TARGET_COUNT = 500; // Total historical emails to ingest (e.g. 200, 500, 1000)
const BACKFILL_DAYS_LOOKBACK = 90;  // How many days back to search (e.g. 60, 90, 180, 365)

/**
 * -----------------------------------------------------------------------------
 * 1. LIVE SYNC FUNCTION (Runs automatically on a 10-15 minute time-driven trigger)
 * -----------------------------------------------------------------------------
 * Searches for new emails since the last checkpoint, extracts attachments,
 * and posts them to the CRM webhook.
 */
function syncBidsToCRM() {
  const props = PropertiesService.getScriptProperties();
  const lastProcessedEpoch = props.getProperty("LAST_PROCESSED_TIME");

  let query = "in:inbox";
  if (lastProcessedEpoch) {
    const afterSeconds = Math.floor(Number(lastProcessedEpoch) / 1000);
    query += ` after:${afterSeconds}`;
  } else {
    // Default initial lookback: 3 days
    const initialLookbackSeconds = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
    query += ` after:${initialLookbackSeconds}`;
  }

  const threads = GmailApp.search(query, 0, LIVE_BATCH_SIZE);
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

      if (lastProcessedEpoch && msgTime <= Number(lastProcessedEpoch)) {
        continue;
      }

      if (msgTime > highestTimestampFound) {
        highestTimestampFound = msgTime;
      }

      postMessageToWebhook(message, false);
    }
  }

  if (highestTimestampFound > (Number(lastProcessedEpoch) || 0)) {
    props.setProperty("LAST_PROCESSED_TIME", highestTimestampFound.toString());
    Logger.log(`Checkpoint updated to: ${new Date(highestTimestampFound).toISOString()}`);
  }
}

/**
 * -----------------------------------------------------------------------------
 * 2. HISTORICAL BACKFILL FUNCTION (Run manually from script.google.com)
 * -----------------------------------------------------------------------------
 * Pulls historical emails from your archive/inbox and streams them to Supabase
 * without touching or resetting your live sync checkpoint.
 *
 * HOW TO USE:
 * 1. Select "backfillHistoricalBids" from the dropdown in script.google.com
 * 2. Click "Run"
 * 3. Watch the Execution Log as it ingests emails in batches of 50!
 */
function backfillHistoricalBids() {
  const props = PropertiesService.getScriptProperties();
  
  // Calculate date range for backfill
  const lookbackEpoch = Date.now() - BACKFILL_DAYS_LOOKBACK * 24 * 60 * 60 * 1000;
  const afterSeconds = Math.floor(lookbackEpoch / 1000);
  
  const query = `(in:inbox OR label:all) -in:trash -in:spam after:${afterSeconds}`;
  Logger.log(`Starting historical backfill: query="${query}", target=${BACKFILL_TARGET_COUNT} emails...`);

  let totalIngested = 0;
  let startIndex = 0;
  const pageSize = 50;

  while (totalIngested < BACKFILL_TARGET_COUNT) {
    const threads = GmailApp.search(query, startIndex, pageSize);
    if (!threads || threads.length === 0) {
      Logger.log("No more matching historical threads found.");
      break;
    }

    Logger.log(`Processing search page at index ${startIndex} (${threads.length} threads)...`);

    for (const thread of threads) {
      if (totalIngested >= BACKFILL_TARGET_COUNT) break;

      const messages = thread.getMessages();
      for (const message of messages) {
        if (message.isDraft()) continue;
        if (totalIngested >= BACKFILL_TARGET_COUNT) break;

        const success = postMessageToWebhook(message, true);
        if (success) {
          totalIngested++;
          if (totalIngested % 10 === 0 || totalIngested === BACKFILL_TARGET_COUNT) {
            Logger.log(`Progress: Ingested ${totalIngested} / ${BACKFILL_TARGET_COUNT} emails into CRM...`);
          }
        }
      }
    }

    startIndex += threads.length;
    // Small pause to keep Google Apps Script and webhook happy
    Utilities.sleep(1000);
  }

  Logger.log(`\n🎉 Historical Backfill Complete! Ingested ${totalIngested} historical emails.`);
}

/**
 * Helper: Formats and posts a single GmailMessage to the CRM webhook.
 */
function postMessageToWebhook(message, isBackfill) {
  const msgDate = message.getDate();
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

    // Attach base64 data for files under 4MB
    if (att.getSize() < 4 * 1024 * 1024) {
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
    isBackfill: isBackfill,
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const code = response.getResponseCode();
    if (code === 200 || code === 201) {
      return true;
    } else {
      Logger.log(`⚠️ Warning on message ${message.getId()} (HTTP ${code}): ${response.getContentText().slice(0, 100)}`);
      return false;
    }
  } catch (err) {
    Logger.log(`❌ Error posting message ${message.getId()}: ${err}`);
    return false;
  }
}

/**
 * Helper: Reset live sync checkpoint (optional)
 */
function resetCheckpoint() {
  PropertiesService.getScriptProperties().deleteProperty("LAST_PROCESSED_TIME");
  Logger.log("Live checkpoint reset. Next live sync will look back 3 days.");
}
