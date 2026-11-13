'use client';

import React, { useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Info,
  Check,
  Edit3,
  BookOpen,
} from 'lucide-react';
import {
  AssignmentRule,
  AssignmentRuleSeverity,
  AssignmentRuleType,
} from '@/lib/assignment-rules';

interface AssignmentRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: AssignmentRule[];
  estimators: string[];
  onRulesChanged: () => void;
  onNotify?: (msg: string) => void;
}

const RULE_TYPE_LABELS: Record<AssignmentRuleType, string> = {
  estimator_contractor: 'Estimator + Contractor',
  contractor: 'Contractor / Scope Rule',
  estimator: 'Estimator Preference / Size Limit',
  general: 'General / Duplicate Reminder',
};

const SEVERITY_STYLES: Record<
  AssignmentRuleSeverity,
  { label: string; badge: string; border: string }
> = {
  block: {
    label: 'Do Not Assign',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    border: 'border-rose-200 bg-rose-50/50',
  },
  warning: {
    label: 'Caution / Note',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    border: 'border-amber-200 bg-amber-50/50',
  },
  info: {
    label: 'Info',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    border: 'border-blue-200 bg-blue-50/50',
  },
};

export default function AssignmentRulesModal({
  isOpen,
  onClose,
  rules,
  estimators,
  onRulesChanged,
  onNotify,
}: AssignmentRulesModalProps) {
  const [ruleType, setRuleType] = useState<AssignmentRuleType>('estimator_contractor');
  const [estimatorName, setEstimatorName] = useState('');
  const [contractorName, setContractorName] = useState('');
  const [severity, setSeverity] = useState<AssignmentRuleSeverity>('warning');
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(null);
    setRuleType('estimator_contractor');
    setEstimatorName('');
    setContractorName('');
    setSeverity('warning');
    setNote('');
  };

  const applyPreset = (preset: 'refuses_contractor' | 'furnish_only' | 'job_size' | 'duplicate') => {
    resetForm();
    if (preset === 'refuses_contractor') {
      setRuleType('estimator_contractor');
      setSeverity('block');
      setNote('Does not bid jobs for this contractor.');
    } else if (preset === 'furnish_only') {
      setRuleType('contractor');
      setSeverity('warning');
      setNote('Non-local contractor — Furnish Only (no installation).');
    } else if (preset === 'job_size') {
      setRuleType('estimator');
      setSeverity('warning');
      setNote('Will not take jobs under/over size threshold.');
    } else if (preset === 'duplicate') {
      setRuleType('general');
      setSeverity('info');
      setNote('Check calendar before adding — estimators sometimes enter duplicate jobs.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setIsSaving(true);
    try {
      const payload = {
        id: editingId || undefined,
        rule_type: ruleType,
        estimator_name:
          ruleType === 'estimator' || ruleType === 'estimator_contractor'
            ? estimatorName || null
            : null,
        contractor_name:
          ruleType === 'contractor' || ruleType === 'estimator_contractor' || ruleType === 'general'
            ? contractorName.trim() || null
            : null,
        severity,
        note: note.trim(),
      };

      const res = await fetch('/api/assignment-rules', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onNotify?.(editingId ? 'Assignment rule updated.' : 'Assignment rule saved.');
        resetForm();
        onRulesChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        onNotify?.(`Error: ${err.error || 'Failed to save rule'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (rule: AssignmentRule) => {
    const res = await fetch('/api/assignment-rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id, is_active: !rule.is_active }),
    });
    if (res.ok) {
      onRulesChanged();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/assignment-rules?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      onNotify?.('Rule deleted.');
      if (editingId === id) resetForm();
      onRulesChanged();
    }
  };

  const startEdit = (rule: AssignmentRule) => {
    setEditingId(rule.id);
    setRuleType(rule.rule_type);
    setEstimatorName(rule.estimator_name || '');
    setContractorName(rule.contractor_name || '');
    setSeverity(rule.severity);
    setNote(rule.note);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Assignment Rules &amp; Manager Notes</h2>
              <p className="text-xs text-slate-300">
                Overlays automatically when assigning estimators or adding bids
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
              Quick Templates:
            </span>
            <button
              type="button"
              onClick={() => applyPreset('refuses_contractor')}
              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-semibold"
            >
              🚫 Estimator Refuses Contractor
            </button>
            <button
              type="button"
              onClick={() => applyPreset('furnish_only')}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold"
            >
              📦 Non-Local (Furnish Only)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('job_size')}
              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-semibold"
            >
              📏 Estimator Job Size Rule
            </button>
            <button
              type="button"
              onClick={() => applyPreset('duplicate')}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold"
            >
              📑 Duplicate Check Note
            </button>
          </div>

          {/* Add / Edit Form */}
          <form
            onSubmit={handleSubmit}
            className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Rule Type
                </label>
                <select
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as AssignmentRuleType)}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  {Object.entries(RULE_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {(ruleType === 'estimator' || ruleType === 'estimator_contractor') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Estimator
                  </label>
                  <select
                    value={estimatorName}
                    onChange={(e) => setEstimatorName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800"
                    required
                  >
                    <option value="">Select Estimator...</option>
                    {estimators.map((est) => (
                      <option key={est} value={est}>
                        {est}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(ruleType === 'contractor' ||
                ruleType === 'estimator_contractor' ||
                ruleType === 'general') && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    {ruleType === 'general' ? 'Keyword (Optional)' : 'Contractor / GC Name'}
                  </label>
                  <input
                    type="text"
                    value={contractorName}
                    onChange={(e) => setContractorName(e.target.value)}
                    placeholder={
                      ruleType === 'general'
                        ? 'Leave blank to show always'
                        : 'e.g. Turner, Hensel Phelps'
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                    required={ruleType !== 'general'}
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Overlay Level
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as AssignmentRuleSeverity)}
                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  <option value="block">🚫 Do Not Assign (Red)</option>
                  <option value="warning">⚠️ Caution / Rule (Amber)</option>
                  <option value="info">ℹ️ Info Note (Blue)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Overlay Note
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Does not take jobs from this contractor, or Non-local — Furnish Only (no install)"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving || !note.trim()}
                className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                {editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{editingId ? 'Update Rule' : 'Add Rule'}</span>
              </button>
            </div>
          </form>

          {/* Existing Rules List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Saved Rules ({rules.length})
            </h3>
            {rules.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl">
                No assignment rules yet. Add one above so it overlays automatically when assigning bids.
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => {
                  const style = SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.warning;
                  return (
                    <div
                      key={rule.id}
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 transition-opacity ${
                        style.border
                      } ${rule.is_active ? '' : 'opacity-50'}`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${style.badge}`}
                          >
                            {rule.severity === 'block' && <ShieldAlert className="w-3 h-3 inline mr-1" />}
                            {rule.severity === 'warning' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                            {rule.severity === 'info' && <Info className="w-3 h-3 inline mr-1" />}
                            {style.label}
                          </span>
                          {rule.estimator_name && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-800">
                              👤 {rule.estimator_name}
                            </span>
                          )}
                          {rule.contractor_name && (
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-bold text-slate-800">
                              🏢 {rule.contractor_name}
                            </span>
                          )}
                          {!rule.is_active && (
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              (Paused)
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-800">{rule.note}</p>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(rule)}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {rule.is_active ? 'Pause' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(rule)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                          title="Edit rule"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rule.id)}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
