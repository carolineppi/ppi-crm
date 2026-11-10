export type PriorityLevel = 'low' | 'normal' | 'high' | 'urgent';

export type TriageStatus =
  | 'pending_triage'
  | 'in_triage'
  | 'ready_for_assignment'
  | 'assigned'
  | 'rejected'
  | 'archived';

export type DuplicateResolutionStatus =
  | 'unreviewed'
  | 'confirmed_duplicate'
  | 'marked_distinct';

export type EstimatorStatus =
  | 'unassigned'
  | 'assigned'
  | 'accepted'
  | 'declined'
  | 'in_progress'
  | 'bid_submitted'
  | 'won'
  | 'lost'
  | 'no_bid';

export interface EmailAttachmentPayload {
  filename: string;
  contentType?: string;
  size?: number;
  checksum?: string; // MD5 or SHA256 hex string
  content?: string;  // Base64 encoded content (optional, used to compute checksum if not supplied)
  storageUrl?: string;
}

export interface InboundEmailPayload {
  messageId?: string;
  subject: string;
  body?: string;
  bodyText?: string;
  bodyHtml?: string;
  sender: string | { email: string; name?: string };
  senderEmail?: string;
  senderName?: string;
  receivedAt?: string;
  attachments?: EmailAttachmentPayload[];
  rawPayload?: Record<string, unknown>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateGroupId: string;
  duplicateOfId: string | null;
  confidence: number;
  reasons: string[];
}

export interface BidRequestRow {
  id: string;
  created_at: string;
  updated_at: string;
  source_email_id: string | null;
  sender_email: string;
  sender_name: string | null;
  email_subject: string;
  email_body_text: string | null;
  email_body_html: string | null;
  email_received_at: string;
  raw_payload: Record<string, unknown>;
  client_name: string | null;
  client_company: string | null;
  client_phone: string | null;
  project_name: string | null;
  job_code: string | null;
  project_address_street: string | null;
  project_address_city: string | null;
  project_address_state: string | null;
  project_address_zip: string | null;
  scope_of_work: string | null;
  bid_due_date: string | null;
  estimated_project_start: string | null;
  attachments: EmailAttachmentPayload[];
  attachment_hashes: string[];
  duplicate_group_id: string | null;
  is_flagged_duplicate: boolean;
  duplicate_of_id: string | null;
  duplicate_confidence: number;
  duplicate_reasons: string[];
  duplicate_resolution: DuplicateResolutionStatus;
  triage_status: TriageStatus;
  priority: PriorityLevel;
  triaged_by: string | null;
  triaged_at: string | null;
  triage_notes: string | null;
  site_visit_required: boolean;
  site_visit_scheduled_at: string | null;
  site_visit_notes: string | null;
  assigned_estimator_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  estimator_status: EstimatorStatus;
  estimator_responded_at: string | null;
  estimator_response_notes: string | null;
  decline_reason: string | null;
  bid_amount: number | null;
  bid_submitted_at: string | null;
  bid_proposal_url: string | null;
  bid_documents: unknown[];
  promoted_to_job_id: string | null;
  promoted_at: string | null;
}
