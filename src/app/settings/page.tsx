'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings, UserCheck, RotateCcw, ArrowLeft, Palette, Check } from 'lucide-react';
import {
  APP_THEMES,
  AppThemeId,
  THEME_STORAGE_KEY,
  applyTheme,
  isValidThemeId,
} from '@/lib/theme/themes';

export default function UserSettingsPage() {
  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<AppThemeId>('default');
  const [isSavingTheme, setIsSavingTheme] = useState(false);

  useEffect(() => {
    try {
      const localTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (isValidThemeId(localTheme)) setSelectedTheme(localTheme);
    } catch {
      // ignore
    }

    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.profile) {
          setProfile(d.profile);
          const savedTheme = d.profile?.dashboard_config?.theme;
          if (isValidThemeId(savedTheme)) {
            setSelectedTheme(savedTheme);
            applyTheme(savedTheme);
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSelectTheme = async (themeId: AppThemeId) => {
    setSelectedTheme(themeId);
    applyTheme(themeId);
    setIsSavingTheme(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/me/dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardConfig: { theme: themeId } }),
      });
      if (res.ok) {
        const chosen = APP_THEMES.find((t) => t.id === themeId);
        setStatusMsg(`Saved theme: ${chosen?.name || themeId}`);
      }
    } finally {
      setIsSavingTheme(false);
    }
  };

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

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 border-b border-slate-200 pb-4">
            <Settings className="w-5 h-5 text-slate-700" />
            <div>
              <h1 className="text-lg font-black text-slate-900">User Settings</h1>
              <p className="text-xs text-slate-500">
                Your Partition Plus account details, color theme, and workspace preferences.
              </p>
            </div>
          </div>

          {statusMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-bold">
              {statusMsg}
            </div>
          )}

          {/* Account Info */}
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

          {/* Appearance & Color Theme */}
          <div className="border-t border-slate-200 pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-blue-600" />
                <div>
                  <div className="text-xs font-extrabold uppercase text-slate-800">
                    Appearance &amp; Color Theme
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Choose your preferred workspace palette. Changes apply immediately.
                  </div>
                </div>
              </div>
              {isSavingTheme && (
                <span className="text-[11px] font-semibold text-blue-600">Saving...</span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {APP_THEMES.map((t) => {
                const isActive = selectedTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTheme(t.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                      isActive
                        ? 'border-blue-600 ring-2 ring-blue-500/25 bg-blue-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-black text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{t.description}</div>
                      </div>
                      {isActive && (
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <span
                        className="w-6 h-4 rounded border border-black/15"
                        style={{ backgroundColor: t.swatches.bg }}
                        title="Background"
                      />
                      <span
                        className="w-6 h-4 rounded border border-black/15"
                        style={{ backgroundColor: t.swatches.card }}
                        title="Card Surface"
                      />
                      <span
                        className="w-6 h-4 rounded border border-black/15"
                        style={{ backgroundColor: t.swatches.bar }}
                        title="Dark Bar"
                      />
                      <span
                        className="w-6 h-4 rounded border border-black/15"
                        style={{ backgroundColor: t.swatches.accent }}
                        title="Primary Accent"
                      />
                      {t.swatches.highlight && (
                        <span
                          className="w-6 h-4 rounded border border-black/15"
                          style={{ backgroundColor: t.swatches.highlight }}
                          title="Highlight Accent"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dashboard Layout Reset */}
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
