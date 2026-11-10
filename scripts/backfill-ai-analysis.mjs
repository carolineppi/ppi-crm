import { createClient } from '@supabase/supabase-js';
import { analyzeEmailWithAI } from '../src/lib/email-parser/ai-classifier.js';

const supabaseUrl = 'https://ezoxalprotuqtjikomep.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6b3hhbHByb3R1cXRqaWtvbWVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDk0MzIsImV4cCI6MjEwOTg4NTQzMn0.Ssua_FsvOZ2XtW5Y1LqnwmHqXISlG7AJmqznY7jBAJE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Uses process.env.GOOGLE_GENERATIVE_AI_API_KEY from environment or .env.local

async function backfill() {
  console.log('Fetching unprocessed emails from Supabase...');
  const { data: rows, error } = await supabase
    .from('bid_requests')
    .select('id, email_subject, email_body_text, sender_email, sender_name, attachments, project_name, client_company, job_code')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Database query error:', error);
    return;
  }

  console.log(`Found ${rows.length} rows to analyze with Gemini AI.\n`);

  for (const row of rows) {
    console.log(`Analyzing: "${row.email_subject}" from <${row.sender_email}>`);
    
    const attachmentFilenames = Array.isArray(row.attachments)
      ? row.attachments.map((a) => a.filename)
      : [];

    const ai = await analyzeEmailWithAI({
      subject: row.email_subject,
      bodyText: row.email_body_text || '',
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      attachmentFilenames,
    });

    console.log(`  -> Intent: [${ai.intent}] | Forwarded: ${ai.isForwarded} | GC: ${ai.clientCompany || 'N/A'}`);
    console.log(`  -> Scope: ${ai.scopeSummary}\n`);

    const updatePayload = {
      email_intent: ai.intent,
      intent_confidence: ai.confidence,
      intent_explanation: ai.reasoning,
      is_forwarded: ai.isForwarded,
      forwarded_by: ai.forwardedBy || (ai.isForwarded ? row.sender_email : null),
      original_sender_email: ai.originalSenderEmail || row.sender_email,
      original_sender_name: ai.originalSenderName || row.sender_name,
      project_name: ai.projectName || row.project_name,
      client_company: ai.clientCompany || row.client_company,
      job_code: ai.jobCode || row.job_code,
      scope_summary: ai.scopeSummary,
      recommended_action: ai.recommendedAction,
      ai_analysis: ai,
    };

    const { error: updateError } = await supabase
      .from('bid_requests')
      .update(updatePayload)
      .eq('id', row.id);

    if (updateError) {
      console.error(`  Failed to update row ${row.id}:`, updateError.message);
    }
  }

  console.log('✔ All existing emails retroactively analyzed and updated in Supabase!');
}

backfill().catch(console.error);
