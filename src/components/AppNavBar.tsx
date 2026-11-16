'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, LayoutDashboard, Shield, Eye, Flag } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ROLE_DEFINITIONS, UserRole } from '@/lib/auth/roles';
import { applyTheme } from '@/lib/theme/themes';
import { initDiagnosticsCapture } from '@/lib/feedback/diagnostics';
import FlagIssueModal from '@/components/FlagIssueModal';

interface NavLinkItem {
  href: string;
  label: string;
  key: string;
}

const ALL_ROLES = Object.keys(ROLE_DEFINITIONS) as UserRole[];

export default function AppNavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [isRealAdmin, setIsRealAdmin] = useState(false);
  const [isViewingAs, setIsViewingAs] = useState(false);
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>([]);
  const [previewName, setPreviewName] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [openFlagCount, setOpenFlagCount] = useState(0);

  const loadOpenFlagsCount = () => {
    fetch('/api/feedback?status=open')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.openCount === 'number') setOpenFlagCount(d.openCount);
      })
      .catch(() => {});
  };

  const loadMe = () => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.profile) {
          setProfile(d.profile);
          setIsRealAdmin(Boolean(d.isRealAdmin));
          setIsViewingAs(Boolean(d.isViewingAs));
          setNavLinks(d.navLinks || []);
          if (d.isViewingAs) {
            setPreviewName(d.profile.full_name || '');
          }
          if (d.profile?.dashboard_config?.theme) {
            applyTheme(d.profile.dashboard_config.theme);
          }
          if (d.isRealAdmin && !d.isViewingAs) {
            loadOpenFlagsCount();
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    initDiagnosticsCapture();
  }, []);

  useEffect(() => {
    if (pathname === '/login') return;
    loadMe();
  }, [pathname]);

  if (pathname === '/login' || !profile) {
    return null;
  }

  const handleViewAsChange = async (role: string, name?: string) => {
    await fetch('/api/me/view-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, name: name ?? previewName }),
    });
    window.location.href = '/dashboard';
  };

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="print:hidden">
      {isViewingAs && (
        <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            <span>
              Admin Preview Mode: Viewing as{' '}
              <strong className="uppercase">{profile.primary_role}</strong> ({profile.full_name})
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleViewAsChange('admin', '')}
            className="px-2.5 py-0.5 rounded bg-slate-950 text-white hover:bg-slate-800 text-[11px] font-bold cursor-pointer"
          >
            Exit Preview (Back to Admin)
          </button>
        </div>
      )}

      <nav className="bg-slate-950 text-slate-200 border-b border-slate-800 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/dashboard"
              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 font-extrabold flex items-center gap-1 mr-1 border border-emerald-500/30"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Partition Plus</span>
            </Link>
            {navLinks.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition inline-flex items-center gap-1 ${
                    active
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.key === 'admin_feedback' && openFlagCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                      {openFlagCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isRealAdmin && (
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5">
                <Eye className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] text-slate-400 font-bold">View As:</span>
                <select
                  value={isViewingAs ? profile.primary_role : 'admin'}
                  onChange={(e) => handleViewAsChange(e.target.value)}
                  className="bg-transparent text-amber-300 font-bold text-[11px] focus:outline-none cursor-pointer"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r} className="bg-slate-900 text-white">
                      {ROLE_DEFINITIONS[r].label}
                    </option>
                  ))}
                </select>
                {isViewingAs && (
                  <input
                    type="text"
                    value={previewName}
                    onChange={(e) => setPreviewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleViewAsChange(profile.primary_role, previewName);
                      }
                    }}
                    onBlur={() => {
                      if (previewName.trim() !== (profile.full_name || '').trim()) {
                        handleViewAsChange(profile.primary_role, previewName);
                      }
                    }}
                    placeholder="Scope Name (e.g. Harrison Schumaker)"
                    title="Optional: enter an employee name to preview their assigned scope"
                    className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-[10px] w-36 border border-slate-700"
                  />
                )}
              </div>
            )}

            <span className="text-slate-400 hidden sm:inline">
              <strong className="text-white">{profile.full_name}</strong>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1">
              {profile.roles?.includes('admin') && <Shield className="w-3 h-3" />}
              {profile.primary_role}
            </span>
            <button
              type="button"
              onClick={() => setShowFlagModal(true)}
              title="Flag a bug or suggest an improvement"
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Flag className="w-3 h-3" />
              <span>Flag Issue</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </nav>
      <FlagIssueModal
        isOpen={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        onSubmitted={() => {
          if (isRealAdmin) loadOpenFlagsCount();
        }}
      />
    </div>
  );
}
