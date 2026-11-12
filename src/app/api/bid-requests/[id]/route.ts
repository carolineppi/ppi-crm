import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface UpdatePayload {
  newSticker?: string;
  matchedBidNumber?: string | null;
  linkToBidNumber?: string | null;
  unlinkFromGroup?: boolean;
  acceptRevisedDueDate?: boolean;
  revisedDueDate?: string | null;
  assignedEstimator?: string | null;
  assignedEstimatorId?: string | null;
  bidDueDate?: string | null;
  triageStatus?: string | null;
  estimatorStatus?: 'unassigned' | 'assigned' | 'in_progress' | 'bid_submitted' | 'won' | 'lost' | 'no_bid' | null;
  estimatorNotes?: string | null;
  duplicateResolution?: string | null;
  filterStatus?: string | null;
  moveToDuplicates?: boolean;
  restoreFromDuplicates?: boolean;
  unmarkDuplicate?: boolean;
  keepEmail?: boolean;
  isHumanLabeled?: boolean;
  isGcWonPrime?: boolean;
  googleDriveFolderUrl?: string | null;
  projectName?: string | null;
  clientCompany?: string | null;
  projectAddressCity?: string | null;
  projectAddressState?: string | null;
  bidDueTime?: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Bid request not found' }, { status: 404 });
    }

    return NextResponse.json({ bidRequest: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bid request' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdatePayload = await request.json();
    const supabase = createServerSupabaseClient();

    // 1. Fetch current record
    const { data: currentRecord, error: fetchError } = await supabase
      .from('bid_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentRecord) {
      return NextResponse.json(
        { error: 'Bid request not found' },
        { status: 404 }
      );
    }

    const updates: Record<string, any> = {};

    // 2. Handle Estimator Assignment Update
    if (body.assignedEstimator !== undefined) {
      if (body.assignedEstimatorId) {
        updates.assigned_estimator_id = body.assignedEstimatorId;
      }
      // Storing assigned estimator name in raw_payload
      updates.raw_payload = {
        ...currentRecord.raw_payload,
        assigned_estimator_name: body.assignedEstimator,
      };

      if (body.assignedEstimator === 'Not Bidding' || body.assignedEstimator === 'No Bid') {
        updates.estimator_status = 'no_bid';
        updates.assigned_estimator_id = null;
      } else {
        updates.estimator_status = body.assignedEstimator ? 'assigned' : 'unassigned';
        updates.triage_status = body.assignedEstimator ? 'assigned' : 'ready_for_assignment';
      }
    }

    // 2b. Handle Calendar Bid Due Date Update
    if (body.bidDueDate !== undefined) {
      if (!body.bidDueDate) {
        updates.bid_due_date = null;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(body.bidDueDate.trim())) {
        updates.bid_due_date = `${body.bidDueDate.trim()}T17:00:00.000Z`;
      } else {
        const parsed = new Date(body.bidDueDate);
        updates.bid_due_date = !isNaN(parsed.getTime()) ? parsed.toISOString() : null;
      }
    }

    // 2b-2. Handle Inline Bid Metadata & Due Time Edits
    if (body.projectName !== undefined) {
      updates.project_name = body.projectName ? body.projectName.trim() : null;
    }
    if (body.clientCompany !== undefined) {
      updates.client_company = body.clientCompany ? body.clientCompany.trim() : null;
    }
    if (body.projectAddressCity !== undefined) {
      updates.project_address_city = body.projectAddressCity ? body.projectAddressCity.trim() : null;
    }
    if (body.projectAddressState !== undefined) {
      updates.project_address_state = body.projectAddressState ? body.projectAddressState.trim() : null;
    }
    if (body.bidDueTime !== undefined) {
      updates.raw_payload = {
        ...(updates.raw_payload || currentRecord.raw_payload),
        bid_due_time: body.bidDueTime ? body.bidDueTime.trim() : null,
      };
    }

    // 2c. Handle Estimator Workflow Status Update
    if (body.estimatorStatus !== undefined) {
      updates.estimator_status = body.estimatorStatus;
      if (body.estimatorStatus === 'won') {
        updates.priority = 'urgent';
      }
    }

    // 2d. Handle Estimator Notes Update
    if (body.estimatorNotes !== undefined) {
      updates.raw_payload = {
        ...(updates.raw_payload || currentRecord.raw_payload),
        estimator_notes: body.estimatorNotes,
      };
    }

    // 2e. Handle Human Labeling Flag & Resolution (for ML dataset verification)
    if (body.duplicateResolution !== undefined) {
      updates.duplicate_resolution = body.duplicateResolution;
    }
    if (body.filterStatus !== undefined) {
      updates.filter_status = body.filterStatus;
    }
    if (body.moveToDuplicates) {
      updates.filter_status = 'duplicate_folder';
      updates.duplicate_resolution = 'duplicate';
      updates.is_flagged_duplicate = true;
    }
    if (body.restoreFromDuplicates || body.unmarkDuplicate || body.keepEmail) {
      updates.filter_status = 'inbox';
      updates.duplicate_resolution = 'marked_distinct';
      updates.is_flagged_duplicate = false;
      updates.duplicate_of_id = null;
    }
    if (body.isHumanLabeled) {
      updates.is_human_labeled = true;
      updates.human_label = body.newSticker || currentRecord.human_label || currentRecord.email_intent;
      updates.human_labeled_at = new Date().toISOString();
      updates.duplicate_resolution = 'human_verified';
      updates.raw_payload = {
        ...(updates.raw_payload || currentRecord.raw_payload),
        is_labeled: true,
        labeled_at: new Date().toISOString(),
        human_verified: true,
        human_label: body.newSticker || currentRecord.email_intent,
      };
    }

    // 2f. Handle Unlinking from Project Group (Calendar Manager Manual Intervention)
    if (body.unlinkFromGroup) {
      const newGroupId = crypto.randomUUID();
      updates.duplicate_group_id = newGroupId;
      updates.is_flagged_duplicate = false;
      updates.duplicate_of_id = null;
      updates.matched_bid_id = null;
      updates.matched_bid_number = null;
      updates.match_status = null;
      updates.match_reason = null;
      updates.duplicate_resolution = 'marked_distinct';

      // If it is an ITB or general inquiry and has no internal bid_number, assign one
      if (!currentRecord.bid_number && (currentRecord.email_intent === 'invitation_to_bid' || !body.newSticker || body.newSticker === 'ITB')) {
        const currentYear = new Date().getFullYear().toString().slice(-2);
        const { count } = await supabase
          .from('bid_requests')
          .select('id', { count: 'exact', head: true })
          .not('bid_number', 'is', null);
        const seq = (count || 0) + 1;
        updates.bid_number = `BID-${currentYear}-${seq.toString().padStart(4, '0')}`;
        updates.triage_status = 'ready_for_assignment';
      }
    }

    // 2g. Handle Manual Linking to an Existing Bid Number (Works for ITBs, Addendums, Awards, etc.)
    const targetBidNum = body.linkToBidNumber || (body.newSticker !== 'ITB' ? body.matchedBidNumber : null);
    if (targetBidNum && !body.unlinkFromGroup) {
      const { data: parentBid } = await supabase
        .from('bid_requests')
        .select('id, duplicate_group_id, bid_number, assigned_estimator_id, raw_payload')
        .eq('bid_number', targetBidNum)
        .maybeSingle();

      if (parentBid) {
        updates.matched_bid_id = parentBid.id;
        updates.matched_bid_number = parentBid.bid_number;
        updates.duplicate_group_id = parentBid.duplicate_group_id;
        updates.duplicate_of_id = parentBid.id;
        updates.is_flagged_duplicate = true;
        updates.match_status = 'confirmed';
        updates.duplicate_resolution = 'confirmed_duplicate';
        updates.match_reason = 'Manually linked to project folder by Calendar Manager';

        // Propagate estimator assignment from parent bid
        if (parentBid.assigned_estimator_id || parentBid.raw_payload?.assigned_estimator_name) {
          updates.assigned_estimator_id = parentBid.assigned_estimator_id;
          updates.raw_payload = {
            ...(updates.raw_payload || currentRecord.raw_payload),
            assigned_estimator_name: parentBid.raw_payload?.assigned_estimator_name,
          };
          updates.triage_status = 'assigned';
        }
      } else {
        return NextResponse.json(
          { error: `Cannot link: Active project with Bid Number "${targetBidNum}" does not exist.` },
          { status: 400 }
        );
      }
    }

    // 2h. Handle Accepting Revised Due Date (e.g. from Addendum)
    if (body.acceptRevisedDueDate && body.revisedDueDate) {
      const parsedDate = new Date(body.revisedDueDate);
      if (!isNaN(parsedDate.getTime())) {
        updates.bid_due_date = parsedDate.toISOString();
        updates.is_due_date_revised = false; // resolved

        // Also update parent bid due date if this is attached to a parent group!
        if (currentRecord.duplicate_group_id) {
          await supabase
            .from('bid_requests')
            .update({ bid_due_date: parsedDate.toISOString(), is_due_date_revised: false })
            .eq('duplicate_group_id', currentRecord.duplicate_group_id);
        }
      }
    }

    // 2i. Handle GC Won Prime Status Flag
    if (body.isGcWonPrime !== undefined) {
      updates.is_gc_won_prime = body.isGcWonPrime;
    }

    // 2j. Handle Google Drive Folder URL
    if (body.googleDriveFolderUrl !== undefined) {
      updates.google_drive_folder_url = body.googleDriveFolderUrl ? body.googleDriveFolderUrl.trim() : null;
    }

    // 3. Handle Sticker Reclassification & Workflow Transitions
    if (body.newSticker) {
      const sticker =
        body.newSticker === 'Addendum' ||
        body.newSticker === 'RFI/Forms' ||
        body.newSticker === 'RFI / Scope' ||
        body.newSticker === 'Scopes of Work'
          ? 'Addendum / RFI'
          : body.newSticker;

      // Authoritatively update human label flags and metadata in the database
      updates.is_human_labeled = true;
      updates.human_label = sticker;
      updates.human_labeled_at = new Date().toISOString();
      updates.duplicate_resolution = 'human_verified';
      updates.raw_payload = {
        ...(updates.raw_payload || currentRecord.raw_payload),
        is_labeled: true,
        human_verified: true,
        labeled_at: new Date().toISOString(),
        human_label: sticker,
        custom_category: sticker,
      };

      if (sticker === 'ITB') {
        // CASE A: Reclassified to ITB
        updates.email_intent = 'invitation_to_bid';
        updates.matched_bid_id = null;
        updates.matched_bid_number = null;
        updates.match_status = null;
        updates.match_reason = null;
        updates.is_flagged_duplicate = false;
        updates.duplicate_of_id = null;
        updates.filter_status = 'inbox';
        updates.triage_status = body.assignedEstimator ? 'assigned' : 'ready_for_assignment';
        updates.estimator_status = body.assignedEstimator ? 'assigned' : 'unassigned';

        // Ensure internal Bid Number exists
        if (!currentRecord.bid_number) {
          const { data: nextNum } = await supabase.rpc('get_next_bid_number');
          if (nextNum) {
            updates.bid_number = nextNum;
          } else {
            // Fallback sequence query
            const currentYear = new Date().getFullYear().toString().slice(-2);
            const { count } = await supabase
              .from('bid_requests')
              .select('id', { count: 'exact', head: true })
              .not('bid_number', 'is', null);
            const seq = (count || 0) + 1;
            updates.bid_number = `BID-${currentYear}-${seq.toString().padStart(4, '0')}`;
          }
        }
      } else if (sticker === 'Addendum / RFI') {
        // CASE B: Reclassified to Addendum / RFI
        updates.email_intent = 'addendum_update';
        updates.filter_status = 'inbox';
        updates.triage_status = 'ready_for_assignment';

        if (body.matchedBidNumber) {
          const { data: parentBid } = await supabase
            .from('bid_requests')
            .select('id, duplicate_group_id, bid_number, assigned_estimator_id, raw_payload')
            .eq('bid_number', body.matchedBidNumber)
            .maybeSingle();

          if (parentBid) {
            updates.matched_bid_id = parentBid.id;
            updates.matched_bid_number = parentBid.bid_number;
            updates.duplicate_group_id = parentBid.duplicate_group_id;
            updates.duplicate_of_id = parentBid.id;
            updates.is_flagged_duplicate = true;
            updates.match_status = 'confirmed';
            updates.match_reason = 'Linked to bid by Calendar Manager';
            updates.bid_number = null;

            // Inherit estimator assignment if parent bid is already assigned
            if (parentBid.assigned_estimator_id || parentBid.raw_payload?.assigned_estimator_name) {
              if (parentBid.assigned_estimator_id) {
                updates.assigned_estimator_id = parentBid.assigned_estimator_id;
              }
              updates.estimator_status = 'assigned';
              updates.triage_status = 'assigned';
              updates.raw_payload = {
                ...(updates.raw_payload || currentRecord.raw_payload),
                assigned_estimator_name: parentBid.raw_payload?.assigned_estimator_name,
                auto_dispatched: true,
                auto_dispatched_at: new Date().toISOString(),
              };
            }
          }
        }
      } else if (sticker === 'Date Reminder') {
        // CASE C: Reclassified to Date Reminder
        updates.email_intent = 'date_reminder';
        updates.filter_status = 'inbox';
        updates.triage_status = 'ready_for_assignment';
      } else if (sticker === 'Won' || sticker === 'Contractor Awarded') {
        // CASE D: Reclassified to Won
        updates.email_intent = 'bid_won';
        updates.estimator_status = 'won';
        updates.priority = 'urgent';
        updates.triage_status = 'assigned';
        updates.filter_status = 'inbox';

        if (body.matchedBidNumber) {
          const { data: parentBid } = await supabase
            .from('bid_requests')
            .select('id, duplicate_group_id, bid_number')
            .eq('bid_number', body.matchedBidNumber)
            .maybeSingle();

          if (parentBid) {
            updates.matched_bid_id = parentBid.id;
            updates.matched_bid_number = parentBid.bid_number;
            updates.duplicate_group_id = parentBid.duplicate_group_id;
            updates.duplicate_of_id = parentBid.id;
            updates.match_status = 'confirmed';
            updates.match_reason = 'Award manually linked to bid by Calendar Manager';
            updates.bid_number = null;

            // Also mark parent bid as won
            await supabase
              .from('bid_requests')
              .update({ estimator_status: 'won', priority: 'urgent' })
              .eq('id', parentBid.id);
          }
        }
      } else if (sticker === 'Lost') {
        // CASE E: Reclassified to Lost
        updates.email_intent = 'bid_lost';
        updates.estimator_status = 'lost';
        updates.triage_status = 'archived';

        if (body.matchedBidNumber) {
          const { data: parentBid } = await supabase
            .from('bid_requests')
            .select('id, bid_number')
            .eq('bid_number', body.matchedBidNumber)
            .maybeSingle();

          if (parentBid) {
            updates.matched_bid_id = parentBid.id;
            updates.matched_bid_number = parentBid.bid_number;
            updates.match_status = 'confirmed';
            updates.bid_number = null;

            // Mark parent as lost
            await supabase
              .from('bid_requests')
              .update({ estimator_status: 'lost' })
              .eq('id', parentBid.id);
          }
        }
      } else if (sticker === 'Spam') {
        // CASE F: Reclassified to Spam
        updates.email_intent = 'spam_noise';
        updates.filter_status = 'auto_filtered';
        updates.triage_status = 'archived';
        updates.matched_bid_id = null;
        updates.matched_bid_number = null;
        updates.bid_number = null;
      } else {
        // CASE G: Custom User-Defined Label (Buttons 6-9)
        updates.email_intent = 'general_inquiry';
        updates.triage_status = 'ready_for_assignment';
        updates.filter_status = 'inbox';
        updates.raw_payload = {
          ...(updates.raw_payload || currentRecord.raw_payload),
          is_labeled: true,
          human_verified: true,
          labeled_at: new Date().toISOString(),
          human_label: sticker,
          custom_category: sticker,
        };
      }
    }

    // 4. Execute update in Supabase
    const { data: updated, error: updateError } = await supabase
      .from('bid_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating bid request:', updateError);
      return NextResponse.json(
        { error: 'Failed to update bid request', details: updateError.message },
        { status: 500 }
      );
    }

    // 5. Cascade Estimator Assignment to all linked Addendums & project records
    if (body.assignedEstimator !== undefined && (currentRecord.bid_number || currentRecord.duplicate_group_id)) {
      try {
        const orConditions: string[] = [];
        if (currentRecord.bid_number) {
          orConditions.push(`matched_bid_number.eq.${currentRecord.bid_number}`);
          orConditions.push(`matched_bid_id.eq.${id}`);
        }
        if (currentRecord.duplicate_group_id) {
          orConditions.push(`duplicate_group_id.eq.${currentRecord.duplicate_group_id}`);
        }

        const { data: linkedChildren } = await supabase
          .from('bid_requests')
          .select('id, raw_payload')
          .neq('id', id)
          .or(orConditions.join(','));

        if (linkedChildren && linkedChildren.length > 0) {
          for (const child of linkedChildren) {
            await supabase
              .from('bid_requests')
              .update({
                assigned_estimator_id: updates.assigned_estimator_id,
                estimator_status: updates.estimator_status,
                triage_status: body.assignedEstimator ? 'assigned' : 'ready_for_assignment',
                raw_payload: {
                  ...(child.raw_payload || {}),
                  assigned_estimator_name: body.assignedEstimator || null,
                  auto_dispatched: Boolean(body.assignedEstimator),
                  auto_dispatched_at: body.assignedEstimator ? new Date().toISOString() : null,
                },
              })
              .eq('id', child.id);
          }
        }
      } catch (cascadeErr) {
        console.error('Error cascading estimator assignment to linked records:', cascadeErr);
      }
    }

    return NextResponse.json({ success: true, bidRequest: updated });
  } catch (err) {
    console.error('Unhandled error in PATCH /api/bid-requests/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
