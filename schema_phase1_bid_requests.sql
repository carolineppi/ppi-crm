-- =============================================================================
-- Migration: Phase 1 - Bid Requests Schema (with Duplicate Grouping)
-- Purpose: Ingest raw emails, deduplicate/group, calendar manager triage, estimator portal
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Enums & Custom Types
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE triage_status AS ENUM (
        'pending_triage',        -- Ingested, awaiting calendar manager review
        'in_triage',             -- Under review or awaiting client clarification
        'ready_for_assignment',  -- Verified & scoped, ready for estimator assignment
        'assigned',              -- Assigned to an estimator
        'rejected',              -- Out of scope or invalid request
        'archived'               -- Closed or superseded
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE duplicate_resolution_status AS ENUM (
        'unreviewed',            -- Flagged automatically, not yet reviewed by Calendar Manager
        'confirmed_duplicate',   -- Confirmed duplicate / grouped under primary bid request
        'marked_distinct'        -- False positive, verified as an independent request
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE estimator_status AS ENUM (
        'unassigned',            -- No estimator assigned
        'assigned',              -- Assigned, pending estimator response
        'accepted',              -- Estimator accepted assignment
        'declined',              -- Estimator declined (requires reassignment)
        'in_progress',           -- Takeoff and estimation under preparation
        'bid_submitted',         -- Formal bid submitted to client
        'won',                   -- Bid won (eligible for promotion to active Job)
        'lost',                  -- Bid lost / client declined
        'no_bid'                 -- Decided not to bid after evaluation
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Bid Requests Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bid_requests (
    -- Primary Keys & Audit Timestamps
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Ingestion Metadata
    source_email_id TEXT,                              -- External provider message ID (idempotency key)
    sender_email TEXT NOT NULL,
    sender_name TEXT,
    email_subject TEXT NOT NULL,
    email_body_text TEXT,
    email_body_html TEXT,
    email_received_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    raw_payload JSONB DEFAULT '{}'::jsonb,              -- Complete parsed inbound JSON for audit

    -- Extracted Project & Client Data
    client_name TEXT,
    client_company TEXT,
    client_phone TEXT,
    project_name TEXT,
    job_code TEXT,                                     -- Pattern matching (e.g. 26-0228JF, 25-0803ST)
    project_address_street TEXT,
    project_address_city TEXT,
    project_address_state TEXT,
    project_address_zip TEXT,
    scope_of_work TEXT,
    bid_due_date TIMESTAMPTZ,
    estimated_project_start TIMESTAMPTZ,

    -- Attachments & Checksums
    attachments JSONB DEFAULT '[]'::jsonb,             -- Array of { filename, contentType, size, checksum, url }
    attachment_hashes TEXT[] DEFAULT '{}',             -- Checksums of all attachments for fast array-overlap search

    -- Duplicate Grouping & Detection
    duplicate_group_id UUID,                           -- Canonical group ID grouping all related/duplicate requests
    is_flagged_duplicate BOOLEAN NOT NULL DEFAULT false,
    duplicate_of_id UUID REFERENCES bid_requests(id) ON DELETE SET NULL, -- Primary/first record in this group
    duplicate_confidence NUMERIC(3, 2) DEFAULT 0.00,   -- Match confidence score (0.00 to 1.00)
    duplicate_reasons TEXT[] DEFAULT '{}',             -- e.g. ['IDENTICAL_ATTACHMENT:plan.pdf', 'JOB_CODE_MATCH:26-0228JF', 'HIGH_SUBJECT_SIMILARITY']
    duplicate_resolution duplicate_resolution_status NOT NULL DEFAULT 'unreviewed',

    -- Calendar Manager Triage Process
    triage_status triage_status NOT NULL DEFAULT 'pending_triage',
    priority priority_level NOT NULL DEFAULT 'normal',
    triaged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    triaged_at TIMESTAMPTZ,
    triage_notes TEXT,
    site_visit_required BOOLEAN NOT NULL DEFAULT false,
    site_visit_scheduled_at TIMESTAMPTZ,
    site_visit_notes TEXT,

    -- Estimator Assignment & Lifecycle Status
    assigned_estimator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    estimator_status estimator_status NOT NULL DEFAULT 'unassigned',
    estimator_responded_at TIMESTAMPTZ,
    estimator_response_notes TEXT,
    decline_reason TEXT,
    bid_amount NUMERIC(12, 2),
    bid_submitted_at TIMESTAMPTZ,
    bid_proposal_url TEXT,
    bid_documents JSONB DEFAULT '[]'::jsonb,

    -- Active Job Phase Transition (Phase 2 Linkage)
    promoted_to_job_id UUID,
    promoted_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 3. Indexes
-- -----------------------------------------------------------------------------

-- Duplicate & Grouping lookups (Crucial for Calendar Manager Grouped View)
CREATE INDEX IF NOT EXISTS idx_bid_requests_dup_group 
    ON bid_requests(duplicate_group_id) 
    WHERE duplicate_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bid_requests_flagged_dup 
    ON bid_requests(is_flagged_duplicate) 
    WHERE is_flagged_duplicate = true;

CREATE INDEX IF NOT EXISTS idx_bid_requests_attachment_hashes 
    ON bid_requests USING GIN (attachment_hashes);

CREATE INDEX IF NOT EXISTS idx_bid_requests_job_code 
    ON bid_requests(job_code) 
    WHERE job_code IS NOT NULL;

-- Calendar Manager Dispatch Dashboard lookups
CREATE INDEX IF NOT EXISTS idx_bid_requests_triage_status 
    ON bid_requests(triage_status);

CREATE INDEX IF NOT EXISTS idx_bid_requests_priority 
    ON bid_requests(priority);

CREATE INDEX IF NOT EXISTS idx_bid_requests_sender_email 
    ON bid_requests(sender_email);

CREATE INDEX IF NOT EXISTS idx_bid_requests_created_at 
    ON bid_requests(created_at DESC);

-- Estimator Portal lookups
CREATE INDEX IF NOT EXISTS idx_bid_requests_estimator_status 
    ON bid_requests(estimator_status);

CREATE INDEX IF NOT EXISTS idx_bid_requests_assigned_estimator 
    ON bid_requests(assigned_estimator_id) 
    WHERE assigned_estimator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bid_requests_due_date 
    ON bid_requests(bid_due_date);

-- Ingestion idempotency index
CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_requests_source_email 
    ON bid_requests(source_email_id) 
    WHERE source_email_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_bid_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bid_requests_updated_at ON bid_requests;
CREATE TRIGGER trigger_bid_requests_updated_at
    BEFORE UPDATE ON bid_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_bid_requests_updated_at();
