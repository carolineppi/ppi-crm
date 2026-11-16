export type AppThemeId =
  | 'default'
  | 'dark'
  | 'low-blue-light'
  | 'partition-plus';

export interface ThemeOption {
  id: AppThemeId;
  name: string;
  description: string;
  swatches: {
    bg: string;
    card: string;
    bar: string;
    accent: string;
    highlight?: string;
  };
}

export const APP_THEMES: ThemeOption[] = [
  {
    id: 'default',
    name: 'Default (Slate Light)',
    description: 'Original clean slate-and-white Partition Plus CRM workspace.',
    swatches: {
      bg: '#f1f5f9',
      card: '#ffffff',
      bar: '#0f172a',
      accent: '#2563eb',
    },
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Deep slate surfaces with high-contrast light text for low-light environments.',
    swatches: {
      bg: '#0b1120',
      card: '#1e293b',
      bar: '#020617',
      accent: '#3b82f6',
    },
  },
  {
    id: 'low-blue-light',
    name: 'Low Blue Light (Warm Cream)',
    description: 'Warm cream and parchment tones with reduced blue light to ease eye strain.',
    swatches: {
      bg: '#f5efe2',
      card: '#fffdf7',
      bar: '#3d2e1e',
      accent: '#b45309',
    },
  },
  {
    id: 'partition-plus',
    name: 'Partition Plus Mode',
    description: 'Branded #F1F4FD canvas, #FFFFFF cards, #142543 dark bars/text, #2563EB blue & #B70020 red highlights.',
    swatches: {
      bg: '#F1F4FD',
      card: '#FFFFFF',
      bar: '#142543',
      accent: '#2563EB',
      highlight: '#B70020',
    },
  },
];

export const THEME_STORAGE_KEY = 'ppi_ui_theme';

export function isValidThemeId(val: unknown): val is AppThemeId {
  return (
    val === 'default' ||
    val === 'dark' ||
    val === 'low-blue-light' ||
    val === 'partition-plus'
  );
}

export function applyTheme(themeId: AppThemeId | string | null | undefined): AppThemeId {
  const valid: AppThemeId = isValidThemeId(themeId) ? themeId : 'default';
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', valid);
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, valid);
    } catch {
      // ignore storage quota/privacy errors
    }
  }
  return valid;
}
