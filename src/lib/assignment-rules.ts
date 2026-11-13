export type AssignmentRuleType = 'estimator' | 'contractor' | 'estimator_contractor' | 'general';
export type AssignmentRuleSeverity = 'info' | 'warning' | 'block';

export interface AssignmentRule {
  id: string;
  rule_type: AssignmentRuleType;
  estimator_name: string | null;
  contractor_name: string | null;
  severity: AssignmentRuleSeverity;
  note: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RuleMatchContext {
  estimatorName?: string | null;
  contractorName?: string | null;
  senderName?: string | null;
  originalSenderName?: string | null;
  subject?: string | null;
  projectName?: string | null;
}

const SEVERITY_RANK: Record<AssignmentRuleSeverity, number> = {
  block: 3,
  warning: 2,
  info: 1,
};

/**
 * Matches active assignment rules against a bid's contractor/project context and optional estimator.
 * - `estimator_contractor`: matches when contractor matches AND (if estimatorName is given, estimator matches;
 *   if estimatorName is omitted/empty, still surfaces so the manager sees the restriction before picking!).
 * - `contractor`: matches whenever contractor/subject/project text contains `contractor_name`.
 * - `estimator`: matches whenever `estimatorName` matches `estimator_name`.
 * - `general`: matches if `contractor_name` keyword is empty or appears in context.
 */
export function matchAssignmentRules(
  rules: AssignmentRule[],
  ctx: RuleMatchContext
): AssignmentRule[] {
  if (!rules || rules.length === 0) return [];

  const estLower = (ctx.estimatorName || '').trim().toLowerCase();
  const haystack = [
    ctx.contractorName,
    ctx.senderName,
    ctx.originalSenderName,
    ctx.subject,
    ctx.projectName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matches: AssignmentRule[] = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const ruleEst = (rule.estimator_name || '').trim().toLowerCase();
    const ruleContractor = (rule.contractor_name || '').trim().toLowerCase();

    const estMatches = Boolean(ruleEst && estLower && ruleEst === estLower);
    const contractorMatches = Boolean(ruleContractor && haystack.includes(ruleContractor));

    if (rule.rule_type === 'estimator_contractor') {
      if (contractorMatches && (!estLower || estMatches)) {
        matches.push(rule);
      }
    } else if (rule.rule_type === 'contractor') {
      if (contractorMatches) {
        matches.push(rule);
      }
    } else if (rule.rule_type === 'estimator') {
      if (estMatches) {
        matches.push(rule);
      }
    } else if (rule.rule_type === 'general') {
      if (!ruleContractor || contractorMatches) {
        matches.push(rule);
      }
    }
  }

  return matches.sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}
