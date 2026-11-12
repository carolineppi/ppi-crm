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

/**
 * Estimator display badge color map.
 * Exact company color branding:
 * - Lisa Williams: Golden Yellow
 * - Harrison Schumaker: Periwinkle
 * - Nick Mudd: Purple
 * - Joe Bunn: Green
 * - Stacey Scott: Pink
 * - Rob Brinlee: Blue
 */
export const ESTIMATOR_COLORS: Record<
  string,
  {
    pillBg: string;
    pillText: string;
    pillBorder: string;
    dotBg: string;
    cardBorder: string;
  }
> = {
  'Lisa Williams': {
    pillBg: 'bg-amber-100/90',
    pillText: 'text-amber-950 font-bold',
    pillBorder: 'border-amber-400',
    dotBg: 'bg-amber-500',
    cardBorder: 'border-l-amber-500',
  },
  'Harrison Schumaker': {
    pillBg: 'bg-indigo-100/80',
    pillText: 'text-indigo-950 font-bold',
    pillBorder: 'border-indigo-300',
    dotBg: 'bg-indigo-400',
    cardBorder: 'border-l-indigo-400',
  },
  'Nick Mudd': {
    pillBg: 'bg-purple-100/80',
    pillText: 'text-purple-950 font-bold',
    pillBorder: 'border-purple-300',
    dotBg: 'bg-purple-600',
    cardBorder: 'border-l-purple-600',
  },
  'Joe Bunn': {
    pillBg: 'bg-emerald-100/80',
    pillText: 'text-emerald-950 font-bold',
    pillBorder: 'border-emerald-300',
    dotBg: 'bg-emerald-600',
    cardBorder: 'border-l-emerald-600',
  },
  'Stacey Scott': {
    pillBg: 'bg-pink-100/80',
    pillText: 'text-pink-950 font-bold',
    pillBorder: 'border-pink-300',
    dotBg: 'bg-pink-500',
    cardBorder: 'border-l-pink-500',
  },
  'Rob Brinlee': {
    pillBg: 'bg-blue-100/80',
    pillText: 'text-blue-950 font-bold',
    pillBorder: 'border-blue-300',
    dotBg: 'bg-blue-600',
    cardBorder: 'border-l-blue-600',
  },
};

export function getEstimatorColor(estimatorName?: string | null) {
  if (estimatorName && ESTIMATOR_COLORS[estimatorName]) {
    const c = ESTIMATOR_COLORS[estimatorName];
    return {
      ...c,
      toString() {
        return `${c.pillBg} ${c.pillText} ${c.pillBorder}`;
      },
    };
  }
  return {
    pillBg: 'bg-slate-100',
    pillText: 'text-slate-700',
    pillBorder: 'border-slate-300',
    dotBg: 'bg-slate-400',
    cardBorder: 'border-l-slate-400',
    toString() {
      return 'bg-slate-100 text-slate-700 border-slate-300';
    },
  };
}
