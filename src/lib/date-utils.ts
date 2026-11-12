/**
 * Date utility functions for construction bid requests and calendar dispatching.
 */

/**
 * Normalizes varied natural-language date strings extracted by AI into a valid YYYY-MM-DD format.
 * Examples:
 * - "November 25, 2026" -> "2026-11-25"
 * - "Wednesday, November 18th by 3:00 PM" -> "2026-11-18"
 * - "11/10/2026" -> "2026-11-10"
 * - "11/17" -> "2026-11-17"
 * - "Thursday, 03 December 2026" -> "2026-12-03"
 * - "2026-11-11T12:00:00Z" -> "2026-11-11"
 */
export function normalizeDateToYyyyMmDd(
  rawDate: string | null | undefined,
  fallbackYear = 2026
): string | null {
  if (!rawDate || !rawDate.trim()) return null;
  const cleaned = rawDate.trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  // If ISO timestamp (e.g. 2026-11-11T12:00:00Z or 2026-11-11 12:00:00+00)
  const isoMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Clean common phrases like "Wednesday, ", "by 3:00 PM", "at 12:00 PM", "Central", ordinals "18th"
  let sanitized = cleaned
    .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+/i, '')
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .replace(/(\d+)(am|pm)/gi, '$1 $2')
    .replace(/\b(by|at|due|on|before)\b/gi, ' ')
    .replace(/\b(AM|PM|EST|EDT|CST|CDT|PST|PDT|Central|Eastern)\b/gi, ' ')
    .replace(/[\/\\]\d+\s*,\s*(\d{4})/, ' $1') // Handle ranges like "November 18/19, 2026" -> "November 18, 2026"
    .replace(/\s+/g, ' ')
    .trim();

  // Try standard parse
  const parsedTs = Date.parse(sanitized);
  if (!isNaN(parsedTs)) {
    const d = new Date(parsedTs);
    // If year was omitted or parsed into 2001/current, force fallbackYear if reasonable
    let y = d.getFullYear();
    if (y < 2020 || y > 2035) y = fallbackYear;
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Handle MM/DD (e.g. "11/17")
  const mmddMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmddMatch) {
    const m = String(parseInt(mmddMatch[1], 10)).padStart(2, '0');
    const d = String(parseInt(mmddMatch[2], 10)).padStart(2, '0');
    return `${fallbackYear}-${m}-${d}`;
  }

  // Handle MM/DD/YYYY or MM/DD/YY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const m = String(parseInt(slashMatch[1], 10)).padStart(2, '0');
    const d = String(parseInt(slashMatch[2], 10)).padStart(2, '0');
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y = 2000 + y;
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Formats a YYYY-MM-DD or ISO string for human display (e.g. "Wed, Nov 18, 2026").
 */
export function formatFriendlyDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'No due date';
  const ymd = normalizeDateToYyyyMmDd(dateStr);
  if (!ymd) return dateStr;

  const [y, m, d] = ymd.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);

  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns human-readable relative timing (e.g. "Due Today", "Due Tomorrow", "3 Days Left", "Overdue").
 */
export function getDueDateStatus(dateStr: string | null | undefined): {
  label: string;
  badgeClass: string;
  isOverdue: boolean;
} {
  if (!dateStr) {
    return {
      label: 'Unscheduled',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      isOverdue: false,
    };
  }

  const ymd = normalizeDateToYyyyMmDd(dateStr);
  if (!ymd) {
    return {
      label: dateStr,
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      isOverdue: false,
    };
  }

  const [y, m, d] = ymd.split('-').map(Number);
  const targetDate = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `Overdue (${Math.abs(diffDays)}d ago)`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
      isOverdue: true,
    };
  }
  if (diffDays === 0) {
    return {
      label: 'Due Today',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold animate-pulse',
      isOverdue: false,
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Due Tomorrow',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
      isOverdue: false,
    };
  }
  if (diffDays <= 7) {
    return {
      label: `Due in ${diffDays} days`,
      badgeClass: 'bg-blue-50 text-blue-800 border-blue-200 font-medium',
      isOverdue: false,
    };
  }

  return {
    label: `Due in ${diffDays} days`,
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
    isOverdue: false,
  };
}

export const ESTIMATORS = [
  'Lisa Williams',
  'Harrison Schumaker',
  'Nick Mudd',
  'Joe Bunn',
  'Stacey Scott',
  'Rob Brinlee',
  'Jennifer MacPherson',
] as const;

export type EstimatorName = (typeof ESTIMATORS)[number] | 'Not Bidding';

export interface EstimatorColorConfig {
  pillBg: string;
  pillText: string;
  pillBorder: string;
  dotBg: string;
  cardBorder: string;
  primaryColor: string;
  bgTint: string;
  borderColor: string;
  textColor: string;
}

/**
 * Estimator display badge color map.
 * Exact company color branding:
 * - Lisa Williams: Golden Yellow (rgb(250, 209, 101))
 * - Harrison Schumaker: Periwinkle (rgb(154, 156, 255))
 * - Nick Mudd: Purple (rgb(205, 116, 230))
 * - Joe Bunn: Green (rgb(22, 167, 101))
 * - Stacey Scott: Pink (rgb(246, 145, 178))
 * - Jennifer MacPherson: Orange (rgb(255, 173, 70))
 * - Rob Brinlee: Blue (rgb(73, 134, 231))
 * - Not Bidding: Grey (rgb(194, 194, 194))
 */
export const ESTIMATOR_COLORS: Record<string, EstimatorColorConfig> = {
  'Lisa Williams': {
    primaryColor: 'rgb(250, 209, 101)',
    bgTint: 'rgba(250, 209, 101, 0.32)',
    borderColor: 'rgb(250, 209, 101)',
    textColor: '#451a03',
    pillBg: 'bg-amber-100',
    pillText: 'text-amber-950 font-bold',
    pillBorder: 'border-amber-400',
    dotBg: 'bg-amber-400',
    cardBorder: 'border-l-amber-400',
  },
  'Harrison Schumaker': {
    primaryColor: 'rgb(154, 156, 255)',
    bgTint: 'rgba(154, 156, 255, 0.28)',
    borderColor: 'rgb(154, 156, 255)',
    textColor: '#1e1b4b',
    pillBg: 'bg-indigo-100',
    pillText: 'text-indigo-950 font-bold',
    pillBorder: 'border-indigo-300',
    dotBg: 'bg-indigo-400',
    cardBorder: 'border-l-indigo-400',
  },
  'Nick Mudd': {
    primaryColor: 'rgb(205, 116, 230)',
    bgTint: 'rgba(205, 116, 230, 0.24)',
    borderColor: 'rgb(205, 116, 230)',
    textColor: '#3b0764',
    pillBg: 'bg-purple-100',
    pillText: 'text-purple-950 font-bold',
    pillBorder: 'border-purple-300',
    dotBg: 'bg-purple-500',
    cardBorder: 'border-l-purple-500',
  },
  'Joe Bunn': {
    primaryColor: 'rgb(22, 167, 101)',
    bgTint: 'rgba(22, 167, 101, 0.22)',
    borderColor: 'rgb(22, 167, 101)',
    textColor: '#052e16',
    pillBg: 'bg-emerald-100',
    pillText: 'text-emerald-950 font-bold',
    pillBorder: 'border-emerald-300',
    dotBg: 'bg-emerald-500',
    cardBorder: 'border-l-emerald-500',
  },
  'Stacey Scott': {
    primaryColor: 'rgb(246, 145, 178)',
    bgTint: 'rgba(246, 145, 178, 0.28)',
    borderColor: 'rgb(246, 145, 178)',
    textColor: '#500724',
    pillBg: 'bg-pink-100',
    pillText: 'text-pink-950 font-bold',
    pillBorder: 'border-pink-300',
    dotBg: 'bg-pink-400',
    cardBorder: 'border-l-pink-400',
  },
  'Rob Brinlee': {
    primaryColor: 'rgb(73, 134, 231)',
    bgTint: 'rgba(73, 134, 231, 0.22)',
    borderColor: 'rgb(73, 134, 231)',
    textColor: '#172554',
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-950 font-bold',
    pillBorder: 'border-blue-300',
    dotBg: 'bg-blue-500',
    cardBorder: 'border-l-blue-500',
  },
  'Jennifer MacPherson': {
    primaryColor: 'rgb(255, 173, 70)',
    bgTint: 'rgba(255, 173, 70, 0.28)',
    borderColor: 'rgb(255, 173, 70)',
    textColor: '#431407',
    pillBg: 'bg-orange-100',
    pillText: 'text-orange-950 font-bold',
    pillBorder: 'border-orange-400',
    dotBg: 'bg-orange-500',
    cardBorder: 'border-l-orange-500',
  },
  'Not Bidding': {
    primaryColor: 'rgb(194, 194, 194)',
    bgTint: 'rgba(194, 194, 194, 0.35)',
    borderColor: 'rgb(194, 194, 194)',
    textColor: '#334155',
    pillBg: 'bg-slate-200',
    pillText: 'text-slate-700 font-bold',
    pillBorder: 'border-slate-300',
    dotBg: 'bg-slate-400',
    cardBorder: 'border-l-slate-400',
  },
  'No Bid': {
    primaryColor: 'rgb(194, 194, 194)',
    bgTint: 'rgba(194, 194, 194, 0.35)',
    borderColor: 'rgb(194, 194, 194)',
    textColor: '#334155',
    pillBg: 'bg-slate-200',
    pillText: 'text-slate-700 font-bold',
    pillBorder: 'border-slate-300',
    dotBg: 'bg-slate-400',
    cardBorder: 'border-l-slate-400',
  },
};

export function getEstimatorColor(estimatorName?: string | null) {
  const normName = estimatorName ? estimatorName.trim() : '';
  const c = ESTIMATOR_COLORS[normName] || {
    primaryColor: 'rgb(148, 163, 184)',
    bgTint: 'rgb(248, 250, 252)',
    borderColor: 'rgb(203, 213, 225)',
    textColor: '#475569',
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-700 font-semibold',
    pillBorder: 'border-slate-300',
    dotBg: 'bg-slate-400',
    cardBorder: 'border-l-slate-400',
  };

  return {
    ...c,
    pillStyle: {
      backgroundColor: c.bgTint,
      borderColor: c.borderColor,
      color: c.textColor,
    },
    dotStyle: {
      backgroundColor: c.primaryColor,
    },
    cardBorderStyle: {
      borderLeftColor: c.primaryColor,
    },
    toString() {
      return `${c.pillBg} ${c.pillText} ${c.pillBorder}`;
    },
  };
}
