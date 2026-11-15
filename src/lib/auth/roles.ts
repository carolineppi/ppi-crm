export type UserRole =
  | 'admin'
  | 'calendar_manager'
  | 'estimator'
  | 'pm'
  | 'accounting'
  | 'warehouse'
  | 'install_coordinator'
  | 'installer';

export interface RoleMeta {
  key: UserRole;
  label: string;
  scope: 'full' | 'assigned';
  description: string;
  allowedRoutes: string[];
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleMeta> = {
  admin: {
    key: 'admin',
    label: 'Admin / Executive',
    scope: 'full',
    description: 'Full access to all modules, data, and user management.',
    allowedRoutes: ['*'],
  },
  calendar_manager: {
    key: 'calendar_manager',
    label: 'Calendar / Dispatch Manager',
    scope: 'full',
    description: 'Full access to Bid Calendar, triage, and estimator assignment.',
    allowedRoutes: ['/', '/dashboard', '/estimator', '/jobs', '/customers', '/suppliers', '/pricing', '/label', '/model'],
  },
  estimator: {
    key: 'estimator',
    label: 'Estimator',
    scope: 'assigned',
    description: 'Assigned bids & jobs, pricing books, customers, and quote builder.',
    allowedRoutes: ['/dashboard', '/estimator', '/jobs', '/customers', '/suppliers', '/pricing'],
  },
  pm: {
    key: 'pm',
    label: 'Project Manager',
    scope: 'full',
    description: 'Full access to won jobs, POs, change orders, customers, and install requests.',
    allowedRoutes: ['/dashboard', '/pm', '/jobs', '/customers', '/suppliers', '/install', '/warehouse', '/accounting'],
  },
  accounting: {
    key: 'accounting',
    label: 'Accounting / Billing',
    scope: 'full',
    description: 'SOV, AIA G702/G703 pay apps, billing queue, customers, and jobs.',
    allowedRoutes: ['/dashboard', '/accounting', '/jobs', '/customers', '/suppliers'],
  },
  warehouse: {
    key: 'warehouse',
    label: 'Warehouse / Receiving',
    scope: 'full',
    description: 'Receiving dock, job staging bays, install load-out, and stock inventory.',
    allowedRoutes: ['/dashboard', '/warehouse', '/jobs', '/install', '/suppliers'],
  },
  install_coordinator: {
    key: 'install_coordinator',
    label: 'Install Coordinator',
    scope: 'full',
    description: 'Install scheduling, installer availability calendar, and warehouse readiness.',
    allowedRoutes: ['/dashboard', '/install', '/installers', '/jobs', '/pm', '/warehouse'],
  },
  installer: {
    key: 'installer',
    label: 'Field Installer',
    scope: 'assigned',
    description: 'View assigned install tickets and submit field completion reports.',
    allowedRoutes: ['/dashboard', '/install'],
  },
};

export interface DashboardWidgetConfig {
  id: string;
  title: string;
  enabled: boolean;
  span: 'half' | 'full';
  scope?: 'mine' | 'all';
}

export interface UserDashboardConfig {
  widgets?: DashboardWidgetConfig[];
  pinnedLinks?: string[];
}

export interface UserProfile {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  primary_role: UserRole;
  roles: UserRole[];
  allowed_pages: string[] | null;
  installer_id: string | null;
  is_active: boolean;
  dashboard_config: UserDashboardConfig | null;
}

export function getDefaultWidgetsForRoles(roles: string[]): DashboardWidgetConfig[] {
  const has = (r: UserRole) => roles.includes('admin') || roles.includes(r);
  const widgets: DashboardWidgetConfig[] = [
    { id: 'kpis', title: 'My Workspace Summary', enabled: true, span: 'full', scope: 'mine' },
    { id: 'quick_links', title: 'Quick Module Shortcuts', enabled: true, span: 'full' },
  ];
  if (has('estimator') || has('calendar_manager')) {
    widgets.push({
      id: 'my_bids',
      title: has('calendar_manager') ? 'Bid Dispatch & Queue' : 'My Assigned Bids',
      enabled: true,
      span: 'half',
      scope: has('calendar_manager') ? 'all' : 'mine',
    });
  }
  if (has('pm') || has('estimator')) {
    widgets.push({
      id: 'my_jobs',
      title: has('pm') ? 'Active Jobs & PM Queue' : 'My Won Jobs',
      enabled: true,
      span: 'half',
      scope: has('pm') ? 'all' : 'mine',
    });
  }
  if (has('accounting')) {
    widgets.push({
      id: 'my_billing',
      title: 'Accounting Billing Queue & Open COs',
      enabled: true,
      span: 'half',
      scope: 'mine',
    });
  }
  if (has('warehouse')) {
    widgets.push({
      id: 'warehouse_dock',
      title: 'Warehouse Receiving & Staging',
      enabled: true,
      span: 'half',
      scope: 'all',
    });
  }
  if (has('install_coordinator') || has('installer') || has('pm')) {
    widgets.push({
      id: 'upcoming_installs',
      title: has('installer') ? 'My Assigned Install Reports' : 'Upcoming Installs',
      enabled: true,
      span: 'half',
      scope: has('installer') ? 'mine' : 'all',
    });
  }
  return widgets;
}

export function canAccessPath(profile: UserProfile | null, pathname: string): boolean {
  if (!profile || !profile.is_active) return false;
  if (profile.roles.includes('admin')) return true;

  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return true;

  const extra = Array.isArray(profile.allowed_pages) ? profile.allowed_pages : [];
  for (const allowed of extra) {
    if (allowed === '*') return true;
    if (allowed === '/' && pathname === '/') return true;
    if (allowed !== '/' && (pathname === allowed || pathname.startsWith(`${allowed}/`))) {
      return true;
    }
  }

  for (const role of profile.roles) {
    const def = ROLE_DEFINITIONS[role as UserRole];
    if (!def) continue;
    for (const route of def.allowedRoutes) {
      if (route === '*') return true;
      if (route === '/' && pathname === '/') return true;
      if (route !== '/' && (pathname === route || pathname.startsWith(`${route}/`))) {
        return true;
      }
    }
  }
  return false;
}

export function getAllowedNavLinks(profile: UserProfile | null) {
  const allLinks = [
    { href: '/dashboard', label: 'My Dashboard', key: 'dashboard' },
    { href: '/', label: 'Bid Calendar', key: 'calendar' },
    { href: '/estimator', label: 'Estimator', key: 'estimator' },
    { href: '/jobs', label: 'Jobs', key: 'jobs' },
    { href: '/pm', label: 'PM Portal', key: 'pm' },
    { href: '/install', label: 'Install Dept', key: 'install' },
    { href: '/installers', label: 'Installers', key: 'installers' },
    { href: '/warehouse', label: 'Warehouse', key: 'warehouse' },
    { href: '/accounting', label: 'Accounting', key: 'accounting' },
    { href: '/customers', label: 'Customers', key: 'customers' },
    { href: '/suppliers', label: 'Suppliers', key: 'suppliers' },
    { href: '/pricing', label: 'Price Book', key: 'pricing' },
    { href: '/admin/users', label: 'Admin Users', key: 'admin' },
  ];
  return allLinks.filter((l) => canAccessPath(profile, l.href));
}
