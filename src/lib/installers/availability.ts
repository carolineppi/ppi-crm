export type DayKey = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
export type ShiftOption = 'Day' | 'Night' | 'Both';

export interface DayAvailability {
  available: boolean;
  shift: ShiftOption;
  start?: string;
  end?: string;
  note?: string;
}

export type WeeklyAvailability = Record<DayKey, DayAvailability>;

export interface InstallerOverride {
  id?: string;
  installer_id: string;
  override_date: string;
  is_available: boolean;
  shift: ShiftOption;
  start_time?: string | null;
  end_time?: string | null;
  note?: string | null;
}

export interface InstallerRecord {
  id: string;
  name: string;
  employment_type: 'employee' | 'subcontractor';
  company_name: string | null;
  phone: string | null;
  email: string | null;
  specialty: string | null;
  default_weekly_availability: WeeklyAvailability;
  is_active: boolean;
  notes: string | null;
  overrides?: InstallerOverride[];
  assignments?: Array<{
    ticketId: string;
    jobId: string;
    jobNumber: string | null;
    projectName: string;
    date: string;
    status: string;
    workShift: string;
  }>;
}

export const DAY_KEYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DEFAULT_WEEKLY_AVAILABILITY: WeeklyAvailability = {
  Mon: { available: true, shift: 'Day', start: '07:00', end: '16:00' },
  Tue: { available: true, shift: 'Day', start: '07:00', end: '16:00' },
  Wed: { available: true, shift: 'Day', start: '07:00', end: '16:00' },
  Thu: { available: true, shift: 'Day', start: '07:00', end: '16:00' },
  Fri: { available: true, shift: 'Day', start: '07:00', end: '16:00' },
  Sat: { available: false, shift: 'Day', start: '08:00', end: '12:00' },
  Sun: { available: false, shift: 'Day', start: '08:00', end: '12:00' },
};

export function getDayKeyFromYmd(dateStr: string): DayKey {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const idx = dt.getDay(); // 0=Sun..6=Sat
  const map: DayKey[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return map[idx];
}

export function getInstallerAvailabilityForDate(
  installer: InstallerRecord,
  dateStr: string
): {
  available: boolean;
  shift: ShiftOption;
  start?: string;
  end?: string;
  source: 'override' | 'weekly';
  note?: string | null;
} {
  const ov = installer.overrides?.find((o) => o.override_date === dateStr);
  if (ov) {
    return {
      available: ov.is_available,
      shift: ov.shift || 'Day',
      start: ov.start_time || undefined,
      end: ov.end_time || undefined,
      source: 'override',
      note: ov.note,
    };
  }

  const dayKey = getDayKeyFromYmd(dateStr);
  const weekly = installer.default_weekly_availability?.[dayKey];
  if (!weekly) {
    return { available: false, shift: 'Day', source: 'weekly' };
  }
  return {
    available: Boolean(weekly.available),
    shift: weekly.shift || 'Day',
    start: weekly.start,
    end: weekly.end,
    source: 'weekly',
    note: weekly.note,
  };
}

export function shiftMatches(
  installerShift: ShiftOption,
  jobShift: string
): boolean {
  if (jobShift === 'Flexible' || installerShift === 'Both') return true;
  return installerShift === jobShift;
}
