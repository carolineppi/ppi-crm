import { deconstructEmailThread } from '../src/lib/email-parser/thread-cleaner';
import { evaluatePrecedenceRules } from '../src/lib/email-parser/precedence-rules';
import { classifyEmailIntent } from '../src/lib/email-parser/classifier';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✓ ${msg}`);
}

async function runTests() {
  console.log('--- Testing Thread Deconstruction & Precedence Rules ---');

  // Test 1: Forwarded email with "INVITATION TO BID" in quoted body, but subject has "Addendum #1"
  const email1Subject = 'FW: INVITATION TO BID: Kroger #399 Expansion - Addendum 1';
  const email1Body = `
John,
Take a look at this addendum for Kroger. Due date moved to Nov 22.
Thanks,
Dave

---------- Forwarded message ---------
From: Sarah Jenkins <sjenkins@kellerbrothers.com>
Date: Tue, Nov 10, 2026 at 10:14 AM
Subject: INVITATION TO BID: Kroger #399 Expansion
To: Dave Smith <dave@partitionplus.com>

You are invited to bid on the Kroger #399 Expansion project.
Please submit all bids by November 15, 2026.
`;

  const d1 = deconstructEmailThread(email1Subject, email1Body, 'dave@partitionplus.com', 'Dave Smith');
  assert(d1.isForwarded === true, 'd1 should be detected as forwarded');
  assert(d1.forwardedBy === 'Dave Smith', 'd1 forwardedBy should be Dave Smith');
  assert(d1.originalSenderEmail === 'sjenkins@kellerbrothers.com', 'd1 originalSenderEmail should be sjenkins@kellerbrothers.com');
  assert(d1.topMessage.includes('Take a look at this addendum'), 'd1 topMessage should contain Dave’s top note');

  const p1 = evaluatePrecedenceRules({
    cleanSubject: d1.cleanSubject,
    topMessage: d1.topMessage,
    forwardedBody: d1.forwardedBody,
    attachmentFilenames: ['Addendum_1.pdf'],
    senderEmail: 'dave@partitionplus.com',
  });
  assert(p1.sticker === 'Addendum', `p1 sticker must be Addendum, got: ${p1.sticker}`);
  assert(p1.matched === true, 'p1 should match precedence rule');

  // Test 2: Email subject has "FW: INVITATION TO BID", but attachment is an addendum
  const email2Subject = 'FW: INVITATION TO BID: St. Jude Health Center';
  const email2Body = `
Estimator, please review.

-----Original Message-----
From: Bids <bids@gilbane.com>
Subject: INVITATION TO BID: St. Jude Health Center

You are invited to bid...
`;
  const d2 = deconstructEmailThread(email2Subject, email2Body, 'coworker@ppi.com');
  const p2 = evaluatePrecedenceRules({
    cleanSubject: d2.cleanSubject,
    topMessage: d2.topMessage,
    forwardedBody: d2.forwardedBody,
    attachmentFilenames: ['Civil_Addendum_2.pdf', 'Plans.pdf'],
    senderEmail: 'coworker@ppi.com',
  });
  assert(p2.sticker === 'Addendum', `p2 sticker must be Addendum due to attachment, got: ${p2.sticker}`);

  // Test 3: Subcontract / Job Award Notice
  const email3Subject = 'Subcontract Agreement - High School Science Wing';
  const email3Body = `
Hello,
Attached is the executed subcontract agreement for your review and countersignature.
We are pleased to award this project to Partition Plus.
`;
  const d3 = deconstructEmailThread(email3Subject, email3Body, 'pm@turnerconstruction.com');
  const p3 = evaluatePrecedenceRules({
    cleanSubject: d3.cleanSubject,
    topMessage: d3.topMessage,
    forwardedBody: d3.forwardedBody,
    attachmentFilenames: ['Subcontract_Agreement_HighSchool.pdf'],
    senderEmail: 'pm@turnerconstruction.com',
  });
  assert(p3.sticker === 'Won', `p3 sticker must be Won, got: ${p3.sticker}`);

  // Test 4: Job Lost / Regret Notice
  const email4Subject = 'Bid Results - Project 26-0208ST Community Library';
  const email4Body = `
Dear Bidders,
Thank you for submitting pricing. We regret to inform you that we have selected another subcontractor for Division 10.
The project was awarded to another firm.
`;
  const d4 = deconstructEmailThread(email4Subject, email4Body, 'estimating@kellerbrothers.com');
  const p4 = evaluatePrecedenceRules({
    cleanSubject: d4.cleanSubject,
    topMessage: d4.topMessage,
    forwardedBody: d4.forwardedBody,
    attachmentFilenames: [],
    senderEmail: 'estimating@kellerbrothers.com',
  });
  assert(p4.sticker === 'Lost', `p4 sticker must be Lost, got: ${p4.sticker}`);

  // Test 5: Real ITB from BuildingConnected
  const email5Subject = 'Invitation to Bid: Apex Center Restrooms';
  const email5Body = `
BuildingConnected Invitation:
Balfour Beatty invites you to bid on Apex Center Restrooms.
Bid Due Date: December 2, 2026 2:00 PM EST.
Plans and specs are attached.
`;
  const d5 = deconstructEmailThread(email5Subject, email5Body, 'invitations@buildingconnected.com');
  const p5 = evaluatePrecedenceRules({
    cleanSubject: d5.cleanSubject,
    topMessage: d5.topMessage,
    forwardedBody: d5.forwardedBody,
    attachmentFilenames: ['Plans_v1.pdf', 'Specs.pdf'],
    senderEmail: 'invitations@buildingconnected.com',
  });
  assert(p5.sticker === 'ITB', `p5 sticker must be ITB, got: ${p5.sticker}`);

  // Test 6: Automated Out-of-Office Spam
  const email6Subject = 'Automatic reply: Out of the office until Monday';
  const email6Body = 'I am currently out of the office with limited access to email...';
  const d6 = deconstructEmailThread(email6Subject, email6Body, 'john@gc.com');
  const p6 = evaluatePrecedenceRules({
    cleanSubject: d6.cleanSubject,
    topMessage: d6.topMessage,
    forwardedBody: d6.forwardedBody,
    attachmentFilenames: [],
    senderEmail: 'john@gc.com',
  });
  assert(p6.sticker === 'Spam', `p6 sticker must be Spam, got: ${p6.sticker}`);

  // Test 7: Full classifyEmailIntent helper
  const c1 = classifyEmailIntent(email1Subject, email1Body, 'dave@partitionplus.com', ['Addendum_1.pdf']);
  assert(c1.intent === 'addendum_update', `c1 intent must be addendum_update, got: ${c1.intent}`);

  const c3 = classifyEmailIntent(email3Subject, email3Body, 'pm@turnerconstruction.com', ['Subcontract_Agreement_HighSchool.pdf']);
  assert(c3.intent === 'bid_won', `c3 intent must be bid_won, got: ${c3.intent}`);

  const c4 = classifyEmailIntent(email4Subject, email4Body, 'estimating@kellerbrothers.com');
  assert(c4.intent === 'bid_lost', `c4 intent must be bid_lost, got: ${c4.intent}`);

  const c5 = classifyEmailIntent(email5Subject, email5Body, 'invitations@buildingconnected.com');
  assert(c5.intent === 'invitation_to_bid', `c5 intent must be invitation_to_bid, got: ${c5.intent}`);

  console.log('\n🎉 ALL PRECEDENCE AND THREAD-TRUNCATION TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
