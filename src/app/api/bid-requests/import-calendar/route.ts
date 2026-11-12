import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { normalizeDateToYyyyMmDd } from '@/lib/date-utils';

interface ImportEventPayload {
  uid: string;
  projectName: string;
  clientCompany?: string | null;
  location?: string | null;
  description?: string | null;
  dueDate: string; // YYYY-MM-DD
  dueTime?: string | null;
  assignedEstimator?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const events: ImportEventPayload[] = Array.isArray(body.events) ? body.events : [];
    const enrichExisting: boolean = body.enrichExisting !== false;

    if (events.length === 0) {
      return NextResponse.json({ error: 'No calendar events provided for import.' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Fetch existing ITBs & previously imported UIDs to avoid duplicates
    const { data: existingRows, error: fetchErr } = await supabase
      .from('bid_requests')
      .select('id, source_email_id, bid_number, project_name, email_subject, bid_due_date, raw_payload, assigned_estimator_id')
      .in('email_intent', ['invitation_to_bid']);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const existingList = existingRows || [];
    const seenSourceIds = new Set(existingList.map((r: any) => r.source_email_id).filter(Boolean));

    // Determine starting sequence for new BID-YY-XXXX numbers
    const currentYear = new Date().getFullYear().toString().slice(-2);
    const { count: existingBidCount } = await supabase
      .from('bid_requests')
      .select('id', { count: 'exact', head: true })
      .not('bid_number', 'is', null);
    let seqCounter = (existingBidCount || 0) + 1;

    let createdCount = 0;
    let enrichedCount = 0;
    let skippedCount = 0;

    const toInsert: any[] = [];
    const nowIso = new Date().toISOString();

    for (const ev of events) {
      if (!ev.projectName || !ev.dueDate) {
        skippedCount++;
        continue;
      }

      const sourceId = `ics_${ev.uid}`;
      if (seenSourceIds.has(sourceId)) {
        skippedCount++;
        continue;
      }
      seenSourceIds.add(sourceId);

      const normalizedYmd = normalizeDateToYyyyMmDd(ev.dueDate);
      if (!normalizedYmd) {
        skippedCount++;
        continue;
      }
      const dueIso = `${normalizedYmd}T17:00:00.000Z`;
      const est = ev.assignedEstimator?.trim() || null;
      const isNotBidding = est === 'Not Bidding' || est === 'No Bid';

      // Check if an existing email ITB matches by normalized project name
      const cleanEvProj = ev.projectName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const matchedExisting = enrichExisting && cleanEvProj.length >= 5
        ? existingList.find((r: any) => {
            const p = (r.project_name || r.email_subject || '')
              .toLowerCase()
              .replace(/[^a-z0-9 ]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (!p) return false;
            return p === cleanEvProj || p.includes(cleanEvProj) || cleanEvProj.includes(p);
          })
        : null;

      if (matchedExisting) {
        // Enrich existing ITB with confirmed calendar date, time, and estimator (if missing)
        const existingEst = matchedExisting.raw_payload?.assigned_estimator_name;
        const updates: Record<string, any> = {
          raw_payload: {
            ...(matchedExisting.raw_payload || {}),
            ...(ev.dueTime && !matchedExisting.raw_payload?.bid_due_time ? { bid_due_time: ev.dueTime } : {}),
            ...(est && !existingEst ? { assigned_estimator_name: est } : {}),
            calendar_enriched_at: nowIso,
          },
        };
        if (!matchedExisting.bid_due_date) {
          updates.bid_due_date = dueIso;
        }
        if (est && !existingEst) {
          updates.estimator_status = isNotBidding ? 'no_bid' : 'assigned';
          updates.triage_status = isNotBidding ? 'ready_for_assignment' : 'assigned';
        }

        await supabase.from('bid_requests').update(updates).eq('id', matchedExisting.id);
        enrichedCount++;
        continue;
      }

      // Create new historical/upcoming calendar bid record
      const bidNumber = `BID-${currentYear}-${seqCounter.toString().padStart(4, '0')}`;
      seqCounter++;

      // Parse city/state if location looks like "City, ST"
      let city: string | null = null;
      let state: string | null = null;
      if (ev.location) {
        const locParts = ev.location.split(',').map((s) => s.trim());
        if (locParts.length >= 2) {
          city = locParts[locParts.length - 2] || null;
          state = locParts[locParts.length - 1]?.slice(0, 20) || null;
        } else {
          city = ev.location.slice(0, 80);
        }
      }

      toInsert.push({
        source_email_id: sourceId,
        bid_number: bidNumber,
        email_subject: ev.projectName,
        sender_email: 'google-calendar-import@calendar-manager.local',
        sender_name: ev.clientCompany?.trim() || 'Google Calendar Import',
        email_received_at: `${normalizedYmd}T12:00:00.000Z`,
        email_body_text: ev.description || `Imported from Google Calendar (${ev.dueDate}${ev.dueTime ? ` @ ${ev.dueTime}` : ''}).`,
        project_name: ev.projectName.trim(),
        client_company: ev.clientCompany?.trim() || null,
        project_address_city: city,
        project_address_state: state,
        bid_due_date: dueIso,
        email_intent: 'invitation_to_bid',
        intent_confidence: 1.0,
        intent_explanation: 'Imported from Google Calendar (.ics)',
        is_human_labeled: true,
        human_label: 'ITB',
        human_labeled_at: nowIso,
        filter_status: 'inbox',
        triage_status: est && !isNotBidding ? 'assigned' : 'ready_for_assignment',
        estimator_status: isNotBidding ? 'no_bid' : est ? 'assigned' : 'unassigned',
        duplicate_group_id: crypto.randomUUID(),
        is_flagged_duplicate: false,
        raw_payload: {
          source: 'google_calendar_import',
          ics_uid: ev.uid,
          assigned_estimator_name: est,
          bid_due_time: ev.dueTime || null,
          is_labeled: true,
          human_verified: true,
          human_label: 'ITB',
        },
      });
    }

    // Batch insert in chunks of 100
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100);
      const { error: insertErr } = await supabase.from('bid_requests').insert(chunk);
      if (insertErr) {
        console.error('Error batch inserting calendar events:', insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
      createdCount += chunk.length;
    }

    return NextResponse.json({
      success: true,
      createdCount,
      enrichedCount,
      skippedCount,
    });
  } catch (err: any) {
    console.error('Exception in POST /api/bid-requests/import-calendar:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import calendar events' },
      { status: 500 }
    );
  }
}
