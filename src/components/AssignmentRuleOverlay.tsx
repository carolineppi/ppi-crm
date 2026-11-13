'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { AssignmentRule } from '@/lib/assignment-rules';

interface AssignmentRuleOverlayProps {
  rules: AssignmentRule[];
  compact?: boolean;
}

export default function AssignmentRuleOverlay({
  rules,
  compact = false,
}: AssignmentRuleOverlayProps) {
  if (!rules || rules.length === 0) return null;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {rules.map((rule) => {
        const isBlock = rule.severity === 'block';
        const isWarning = rule.severity === 'warning';

        const containerClass = isBlock
          ? 'bg-rose-50 border-rose-300 text-rose-900'
          : isWarning
          ? 'bg-amber-50 border-amber-300 text-amber-900'
          : 'bg-blue-50 border-blue-200 text-blue-900';

        const Icon = isBlock ? ShieldAlert : isWarning ? AlertTriangle : Info;

        return (
          <div
            key={rule.id}
            className={`rounded-lg border flex items-start gap-1.5 ${containerClass} ${
              compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
            }`}
          >
            <Icon className={`${compact ? 'w-3 h-3 mt-0.5' : 'w-3.5 h-3.5 mt-0.5'} flex-shrink-0`} />
            <div className="min-w-0 leading-snug">
              <span className="font-bold">
                {rule.estimator_name && rule.contractor_name
                  ? `${rule.estimator_name} × ${rule.contractor_name}: `
                  : rule.estimator_name
                  ? `${rule.estimator_name}: `
                  : rule.contractor_name
                  ? `${rule.contractor_name}: `
                  : ''}
              </span>
              <span className="font-medium">{rule.note}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
