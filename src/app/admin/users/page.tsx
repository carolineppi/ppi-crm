'use client';

import React, { useEffect, useState } from 'react';
import { Shield, UserPlus, CheckCircle2, XCircle, X } from 'lucide-react';
import { ROLE_DEFINITIONS, UserRole } from '@/lib/auth/roles';

const ALL_ROLES = Object.keys(ROLE_DEFINITIONS) as UserRole[];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [installers, setInstallers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newUser, setNewUser] = useState({
    email: '',
    fullName: '',
    roles: ['estimator'] as UserRole[],
    installerId: '',
    password: '',
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
        setInstallers(data.installers || []);
      } else {
        setErrorMsg(data.error || 'Failed to load users');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newUser.email,
        fullName: newUser.fullName,
        roles: newUser.roles,
        primaryRole: newUser.roles[0] || 'estimator',
        installerId: newUser.installerId || null,
        password: newUser.password || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to create user');
      return;
    }
    setShowAddModal(false);
    setNewUser({ email: '', fullName: '', roles: ['estimator'], installerId: '', password: '' });
    await loadUsers();
  };

  const toggleUserRole = async (user: any, role: UserRole) => {
    const current: UserRole[] = Array.isArray(user.roles) ? user.roles : [];
    const next = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    if (next.length === 0) return;

    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        roles: next,
        primaryRole: next[0],
      }),
    });
    await loadUsers();
  };

  const toggleActive = async (user: any) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: user.id,
        isActive: !user.is_active,
      }),
    });
    await loadUsers();
  };

  const updateInstallerLink = async (userId: string, installerId: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, installerId: installerId || null }),
    });
    await loadUsers();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-slate-900" />
            <div>
              <h1 className="text-lg font-extrabold">User &amp; Role Management</h1>
              <p className="text-xs text-slate-500">
                Pre-provision @partitionplus.com users or create Field Installer accounts ({users.length} users)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add / Pre-Provision User</span>
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3">Name &amp; Email</th>
                    <th className="text-left px-4 py-3">Roles (Multi-select)</th>
                    <th className="text-left px-4 py-3">Installer Link</th>
                    <th className="text-center px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{u.full_name}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {ALL_ROLES.map((r) => {
                            const active = (u.roles || []).includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => toggleUserRole(u, r)}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer ${
                                  active
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-100'
                                }`}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.installer_id || ''}
                          onChange={(e) => updateInstallerLink(u.id, e.target.value)}
                          className="px-2 py-1 border border-slate-300 rounded-lg bg-white text-xs"
                        >
                          <option value="">None</option>
                          {installers.map((inst) => (
                            <option key={inst.id} value={inst.id}>
                              {inst.name} {inst.crew_name ? `(${inst.crew_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                            u.is_active
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {u.is_active ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> Inactive
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 shadow-xl text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">Add / Pre-Provision User</h2>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="font-bold block mb-1">Full Name *</label>
              <input
                required
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                placeholder="e.g. Harrison Schumaker"
                className="w-full px-3 py-1.5 border rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Email *</label>
              <input
                type="email"
                required
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="name@partitionplus.com"
                className="w-full px-3 py-1.5 border rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">
                Optional Password (for non-Google Field Installers, min 6 chars)
              </label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Leave blank for Google SSO"
                className="w-full px-3 py-1.5 border rounded-lg"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">Primary Role</label>
              <select
                value={newUser.roles[0]}
                onChange={(e) => setNewUser({ ...newUser, roles: [e.target.value as UserRole] })}
                className="w-full px-3 py-1.5 border rounded-lg bg-white"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_DEFINITIONS[r].label} ({ROLE_DEFINITIONS[r].scope} scope)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded-lg font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 text-white rounded-lg font-bold"
              >
                Save User
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
