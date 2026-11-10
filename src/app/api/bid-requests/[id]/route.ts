import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface UpdatePayload {
  newSticker?: 'ITB' | 'Addendum' | 'Won' | 'Lost' | 'Spam';
  matchedBidNumber?: string | null;
  assignedEstimator?: string | null;
  triageStatus?: string | null;
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
      updates.assigned_estimator_id = body.assignedEstimator ? '00000000-0000-0000-0000-000000000000' : null;
      // Storing assigned estimator name in raw_payload or metadata if foreign key profiles aren't seeded yet
      updates.raw_payload = {
        ...currentRecord.raw_payload,
        assigned_estimator_name: body.assignedEstimator,
      };
      updates.estimator_status = body.assignedEstimator ? 'assigned' : 'unassigned';
      updates.triage_status = body.assignedEstimator ? 'assigned' : 'ready_for_assignment';
    }

    // 3. Handle Sticker Reclassification & Workflow Transitions
    if (body.newSticker) {
      const sticker = body.newSticker;

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
      } else if (sticker === 'Addendum') {
        // CASE B: Reclassified to Addendum
        updates.email_intent = 'addendum_update';
        updates.filter_status = 'inbox';
        updates.triage_status = 'ready_for_assignment';
        // Addendums are linked to parent bid, so we don't assign estimators directly
        updates.assigned_estimator_id = null;
        updates.estimator_status = 'unassigned';

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
            updates.is_flagged_duplicate = true;
            updates.match_status = 'confirmed';
            updates.match_reason = 'Manually linked to bid by Calendar Manager';
          }
        }
      } else if (sticker === 'Won') {
        // CASE C: Reclassified to Won
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

            // Also mark parent bid as won
            await supabase
              .from('bid_requests')
              .update({ estimator_status: 'won', priority: 'urgent' })
              .eq('id', parentBid.id);
          }
        }
      } else if (sticker === 'Lost') {
        // CASE D: Reclassified to Lost
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

            // Mark parent as lost
            await supabase
              .from('bid_requests')
              .update({ estimator_status: 'lost' })
              .eq('id', parentBid.id);
          }
        }
      } else if (sticker === 'Spam') {
        // CASE E: Reclassified to Spam
        updates.email_intent = 'spam_noise';
        updates.filter_status = 'auto_filtered';
        updates.triage_status = 'archived';
        updates.matched_bid_id = null;
        updates.matched_bid_number = null;
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

    return NextResponse.json({ success: true, bidRequest: updated });
  } catch (err) {
    console.error('Unhandled error in PATCH /api/bid-requests/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
