import { analyzeEmailWithAI } from '../src/lib/email-parser/ai-classifier.js';

async function test() {
  console.log('Testing Gemini AI Email Classifier & Forwarder Unpacker...\n');

  // Uses GOOGLE_GENERATIVE_AI_API_KEY from process.env or .env.local

  const simulatedForwardedEmail = {
    subject: 'FW: St. Jude Medical Clinic - Millwork Bid Package',
    senderEmail: 'john.coworker@ppi.com',
    senderName: 'John Coworker',
    bodyText: `Hey Estimating, forwarding this over to get bid.

---------- Forwarded message ---------
From: Sarah Jenkins <sjenkins@apexcontractors.com>
Date: Tue, Nov 10, 2026 at 9:00 AM
Subject: ITB: St. Jude Medical Clinic - Interior Finish Package
To: John Coworker <john.coworker@ppi.com>

Hello Bidders,

Apex Contractors is requesting pricing for the new St. Jude Medical Clinic.
Bids are due by Friday, November 20, 2026 at 2:00 PM CST.
Job code reference: 26-0208ST.
Attached are the architectural floor plans and finish schedules.
Scope involves custom casework, reception desk, and solid surface counter surfaces.

Thank you,
Sarah Jenkins
Senior Estimator | Apex Contractors`,
    attachmentFilenames: ['St_Jude_Plans_v1.pdf', 'Finish_Schedule.xlsx']
  };

  const result = await analyzeEmailWithAI(simulatedForwardedEmail);
  console.log('AI Analysis Result:');
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
