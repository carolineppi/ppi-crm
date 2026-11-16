'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings, UserCheck, RotateCcw, ArrowLeft } from 'lucide-react';

export default function UserSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) setProfile(d.profile);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleResetDashboard = async () => {
    setIsResetting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/me/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardConfig: { widgets: [] } }),
      });
      if (res.ok) {
        setStatusMsg('Dashboard layout reset to your role default.');
      }
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading user settings...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-4">
            <Settings className="w-5 h-5 text-slate-700" />
            <div>
              <h1 className="text-lg font-black text-slate-900">User Settings</h1>
              <p className="text-xs text-slate-500">
                Your Partition Plus account details and workspace preferences.
              </p>
            </div>
          </div>

          {statusMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold">
              {statusMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Full Name</div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {profile?.full_name || '—'}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Email</div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {profile?.email || '—'}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
              <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Assigned Roles</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(profile?.roles || []).map((r: string) => (
                  <span
                    key={r}
                    className="px-2.5 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-bold uppercase"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900">Dashboard Layout</div>
              <div className="text-[11px] text-slate-500">
                Restore your My Dashboard widgets back to the default layout for your role.
              </div>
            </div>
            <button
              type="button"
              disabled={isResetting}
              onClick={handleResetDashboard}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isResetting ? 'Resetting...' : 'Reset Dashboard to Default'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
