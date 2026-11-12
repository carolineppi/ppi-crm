/**
 * RFC 5545 .ics (iCalendar / Google Calendar Export) parser for Construction Bid Calendars.
 */

export interface ParsedCalendarEvent {
  uid: string;
  summary: string;
  projectName: string;
  clientCompany: string | null;
  location: string | null;
  description: string | null;
  dueDate: string; // YYYY-MM-DD
  dueTime: string | null; // e.g. "2:00 PM"
  detectedEstimator: string | null;
  rawColor: string | null;
}

const KNOWN_ESTIMATORS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
  'Jennifer MacPherson',
];

function unfoldIcsLines(rawText: string): string[] {
  // RFC 5545 line unfolding: CRLF or LF followed by space or tab
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const unfolded = normalized.replace(/\n[ \t]/g, '');
  return unfolded.split('\n');
}

function unescapeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseDtStart(rawValue: string): { dueDate: string; dueTime: string | null } | null {
  const val = rawValue.trim();

  // Format 1: All-day date YYYYMMDD
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return {
      dueDate: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`,
      dueTime: null,
    };
  }

  // Format 2: DateTime YYYYMMDDTHHMMSS(Z?)
  const dtMatch = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i);
  if (dtMatch) {
    const [, y, m, d, hh, mm, ss, isUtc] = dtMatch;
    if (isUtc.toUpperCase() === 'Z') {
      // Convert UTC to America/Chicago local date & time
      const utcDate = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).formatToParts(utcDate);

      const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
      const dueDate = `${get('year')}-${get('month')}-${get('day')}`;
      const dueTime = `${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
      return { dueDate, dueTime };
    }

    const hourNum = Number(hh);
    const period = hourNum >= 12 ? 'PM' : 'AM';
    const hour12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
    return {
      dueDate: `${y}-${m}-${d}`,
      dueTime: `${hour12}:${mm} ${period}`,
    };
  }

  return null;
}

const ESTIMATOR_COLOR_TARGETS: Array<{ estimator: string; rgb: [number, number, number] }> = [
  { estimator: 'Not Bidding', rgb: [194, 194, 194] },
  { estimator: 'Lisa Williams', rgb: [250, 209, 101] },
  { estimator: 'Harrison Schumaker', rgb: [154, 156, 255] },
  { estimator: 'Nick Mudd', rgb: [205, 116, 230] },
  { estimator: 'Joe Bunn', rgb: [22, 167, 101] },
  { estimator: 'Stacey Scott', rgb: [246, 145, 178] },
  { estimator: 'Jennifer MacPherson', rgb: [255, 173, 70] },
  { estimator: 'Rob Brinlee', rgb: [73, 134, 231] },
];

// Google Calendar colorId mapping (1-11)
const GOOGLE_COLOR_ID_MAP: Record<string, string> = {
  '1': 'Harrison Schumaker', // Lavender / Periwinkle
  '2': 'Joe Bunn',           // Sage / Green
  '3': 'Nick Mudd',          // Grape / Purple
  '4': 'Stacey Scott',       // Flamingo / Pink
  '5': 'Lisa Williams',      // Banana / Golden Yellow
  '6': 'Jennifer MacPherson',// Tangerine / Orange
  '7': 'Rob Brinlee',        // Peacock / Blue
  '8': 'Not Bidding',        // Graphite / Grey
  '9': 'Rob Brinlee',        // Blueberry / Blue
  '10': 'Joe Bunn',          // Basil / Green
};

function parseRgbColor(raw: string): [number, number, number] | null {
  const s = raw.trim().toLowerCase();

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = s.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  // #RRGGBB or RRGGBB
  const hex6 = s.match(/#?([0-9a-f]{6})\b/i);
  if (hex6) {
    const h = hex6[1];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }

  // #RGB
  const hex3 = s.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const h = hex3[1];
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }

  return null;
}

function matchEstimatorByColor(rawColor: string | null): string | null {
  if (!rawColor) return null;
  const trimmed = rawColor.trim();

  // 1. Google Calendar numeric colorId
  if (GOOGLE_COLOR_ID_MAP[trimmed]) {
    return GOOGLE_COLOR_ID_MAP[trimmed];
  }

  // 2. Exact or nearest RGB/Hex match against the 8 company estimator colors
  const parsedRgb = parseRgbColor(trimmed);
  if (parsedRgb) {
    let bestEst: string | null = null;
    let bestDist = Infinity;
    for (const target of ESTIMATOR_COLOR_TARGETS) {
      const dr = parsedRgb[0] - target.rgb[0];
      const dg = parsedRgb[1] - target.rgb[1];
      const db = parsedRgb[2] - target.rgb[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < bestDist) {
        bestDist = dist;
        bestEst = target.estimator;
      }
    }
    if (bestEst && bestDist <= 75) {
      return bestEst;
    }
  }

  // 3. CSS / Google color name fallback
  const c = trimmed.toLowerCase();
  if (c.includes('yellow') || c.includes('gold') || c.includes('banana')) return 'Lisa Williams';
  if (c.includes('lavender') || c.includes('periwinkle')) return 'Harrison Schumaker';
  if (c.includes('purple') || c.includes('grape') || c.includes('orchid') || c.includes('violet')) return 'Nick Mudd';
  if (c.includes('green') || c.includes('sage') || c.includes('basil') || c.includes('emerald')) return 'Joe Bunn';
  if (c.includes('pink') || c.includes('flamingo') || c.includes('rose')) return 'Stacey Scott';
  if (c.includes('orange') || c.includes('tangerine') || c.includes('amber')) return 'Jennifer MacPherson';
  if (c.includes('blue') || c.includes('blueberry') || c.includes('peacock') || c.includes('cobalt')) return 'Rob Brinlee';
  if (c.includes('gray') || c.includes('grey') || c.includes('graphite') || c.includes('silver')) return 'Not Bidding';

  return null;
}

function detectEstimatorFromEvent(
  summary: string,
  description: string,
  categories: string,
  rawColor: string | null
): string | null {
  // 1. Match by explicit event color first (matches Google Calendar color-coding)
  const colorMatched = matchEstimatorByColor(rawColor);
  if (colorMatched) {
    return colorMatched;
  }

  const combined = `${summary} ${description} ${categories}`.toLowerCase();

  // 2. Check Not Bidding / No Bid
  if (/\b(not\s*bidding|no\s*bid|passed|declined)\b/i.test(combined)) {
    return 'Not Bidding';
  }

  // 3. Check full estimator names
  for (const est of KNOWN_ESTIMATORS) {
    if (combined.includes(est.toLowerCase())) {
      return est;
    }
  }

  // 4. Check first names with word boundaries
  for (const est of KNOWN_ESTIMATORS) {
    const first = est.split(' ')[0].toLowerCase();
    const regex = new RegExp(`\\b${first}\\b`, 'i');
    if (regex.test(combined)) {
      return est;
    }
  }

  return null;
}

function extractProjectAndContractor(
  summary: string,
  description: string
): { projectName: string; clientCompany: string | null } {
  let cleanSummary = summary.trim();
  let clientCompany: string | null = null;

  // Check explicit GC / Contractor in description
  const gcMatch = description.match(/(?:General\s*Contractor|Contractor|GC|Client|Company)\s*[:\-]\s*([^\n]{2,80})/i);
  if (gcMatch) {
    clientCompany = gcMatch[1].trim();
  }

  // Strip leading estimator prefix like "[Harrison] " or "Lisa - "
  for (const est of KNOWN_ESTIMATORS) {
    const first = est.split(' ')[0];
    cleanSummary = cleanSummary
      .replace(new RegExp(`^\\[${first}\\]\\s*`, 'i'), '')
      .replace(new RegExp(`^${first}\\s*[-:]\\s*`, 'i'), '')
      .trim();
  }

  // If summary has "Project Name - GC Name" or "Project Name | GC Name" and no GC yet
  if (!clientCompany) {
    const splitMatch = cleanSummary.match(/^(.+?)\s+(?:-|–|\|)\s+([A-Za-z0-9&.,' ]{3,50})$/);
    if (splitMatch) {
      cleanSummary = splitMatch[1].trim();
      clientCompany = splitMatch[2].trim();
    }
  }

  return {
    projectName: cleanSummary || summary.trim() || 'Imported Calendar Bid',
    clientCompany,
  };
}

export function parseIcsCalendar(rawIcsText: string): ParsedCalendarEvent[] {
  const lines = unfoldIcsLines(rawIcsText);
  const events: ParsedCalendarEvent[] = [];

  let inEvent = false;
  let current: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false;
      const dtRaw = current['DTSTART'];
      const parsedDt = dtRaw ? parseDtStart(dtRaw) : null;
      const summary = unescapeIcsText(current['SUMMARY'] || '');

      if (parsedDt && summary) {
        const description = current['DESCRIPTION'] ? unescapeIcsText(current['DESCRIPTION']) : '';
        const location = current['LOCATION'] ? unescapeIcsText(current['LOCATION']) : null;
        const categories = unescapeIcsText(current['CATEGORIES'] || '');
        const rawColor =
          current['COLOR'] ||
          current['X-GOOGLE-CALENDAR-EVENT-COLOR'] ||
          current['X-GOOGLE-CALENDAR-COLOR-ID'] ||
          current['X-APPLE-CALENDAR-COLOR'] ||
          null;

        const { projectName, clientCompany } = extractProjectAndContractor(summary, description);
        const detectedEstimator = detectEstimatorFromEvent(summary, description, categories, rawColor);

        events.push({
          uid: current['UID'] || `${parsedDt.dueDate}_${summary.slice(0, 30)}`,
          summary,
          projectName,
          clientCompany,
          location,
          description: description || null,
          dueDate: parsedDt.dueDate,
          dueTime: parsedDt.dueTime,
          detectedEstimator,
          rawColor,
        });
      }
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const keyPart = line.slice(0, colonIdx);
    const valPart = line.slice(colonIdx + 1);
    const propName = keyPart.split(';')[0].toUpperCase().trim();

    if (!current[propName]) {
      current[propName] = valPart;
    }
  }

  // Sort newest due dates first
  events.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return events;
}
