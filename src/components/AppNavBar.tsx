'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, LayoutDashboard, Shield } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface NavLinkItem {
  href: string;
  label: string;
  key: string;
}

export default function AppNavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [navLinks, setNavLinks] = useState<NavLinkItem[]>([]);

  useEffect(() => {
    if (pathname === '/login') return;
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.profile) {
          setProfile(d.profile);
          setNavLinks(d.navLinks || []);
        }
      })
      .catch(() => {});
  }, [pathname]);

  if (pathname === '/login' || !profile) {
    return null;
  }

  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <nav className="bg-slate-950 text-slate-200 border-b border-slate-800 px-4 py-2 text-xs print:hidden">
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
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400 hidden sm:inline">
            <strong className="text-white">{profile.full_name}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 text-[10px] font-bold uppercase flex items-center gap-1">
            {profile.roles?.includes('admin') && <Shield className="w-3 h-3" />}
            {profile.primary_role}
          </span>
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
  );
}
