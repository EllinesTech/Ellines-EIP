export type BusinessRule = {
  id: string;
  name: string;
  enabled: boolean;
  when: 'open_alerts_gte' | 'open_decisions_gte' | 'health_lt';
  threshold: number;
  then: 'seed_approval' | 'flag_overview';
  createdAt: string;
};

const PREFIX = 'eip_business_rules_';

export function rulesKey(organizationId: string) {
  return `${PREFIX}${organizationId}`;
}

export const DEFAULT_RULES: BusinessRule[] = [
  {
    id: 'rule_alerts',
    name: 'High alerts → approval',
    enabled: true,
    when: 'open_alerts_gte',
    threshold: 3,
    then: 'seed_approval',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'rule_health',
    name: 'Low health → flag Overview',
    enabled: true,
    when: 'health_lt',
    threshold: 70,
    then: 'flag_overview',
    createdAt: new Date(0).toISOString(),
  },
];

export function readBusinessRules(organizationId: string): BusinessRule[] {
  if (typeof window === 'undefined') return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(rulesKey(organizationId));
    if (!raw) return DEFAULT_RULES;
    const parsed = JSON.parse(raw) as BusinessRule[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export function writeBusinessRules(organizationId: string, rules: BusinessRule[]) {
  localStorage.setItem(rulesKey(organizationId), JSON.stringify(rules));
}

export type RuleHit = {
  ruleId: string;
  name: string;
  message: string;
};

export function evaluateBusinessRules(
  rules: BusinessRule[],
  metrics: { openAlerts: number; openDecisions: number; healthScore: number; synced: boolean },
): RuleHit[] {
  if (!metrics.synced) return [];
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    let fire = false;
    if (rule.when === 'open_alerts_gte') fire = metrics.openAlerts >= rule.threshold;
    if (rule.when === 'open_decisions_gte') fire = metrics.openDecisions >= rule.threshold;
    if (rule.when === 'health_lt') fire = metrics.healthScore < rule.threshold;
    if (!fire) continue;
    hits.push({
      ruleId: rule.id,
      name: rule.name,
      message:
        rule.then === 'seed_approval'
          ? `Rule “${rule.name}” suggests opening an approval.`
          : `Rule “${rule.name}” flagged this Overview.`,
    });
  }
  return hits;
}
