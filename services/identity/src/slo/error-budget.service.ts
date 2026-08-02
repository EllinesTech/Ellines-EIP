import { Injectable } from '@nestjs/common';
import { SLICalculator } from './sli-calculator';

export interface ErrorBudget {
  service: string;
  slo: number;
  current_sli: number;
  budget_remaining: number;
  budget_spent_percent: number;
  risk_level: 'green' | 'yellow' | 'red';
  days_remaining: number;
  alert_threshold: string;
}

/**
 * Tracks and manages error budgets for each service
 */
@Injectable()
export class ErrorBudgetService {
  private sloMap = {
    api_availability: 99.5,
    permission_check: 99.9,
    connector_sync: 95.0,
    rule_execution: 99.0,
    dashboard_performance: 98.0,
  };

  constructor(private sliCalculator: SLICalculator) {}

  /**
   * Calculate error budget for a service
   */
  async calculateErrorBudget(
    service: keyof typeof this.sloMap,
    period: 'day' | 'month' = 'month',
  ): Promise<ErrorBudget> {
    const slo = this.sloMap[service];

    const window =
      period === 'day' ? ('day' as const) : ('month' as const);

    let current_sli = 0;

    switch (service) {
      case 'api_availability':
        current_sli = await this.sliCalculator.calculateAPIAvailability(
          window,
        );
        break;
      case 'permission_check':
        current_sli = await this.sliCalculator.calculatePermissionSLI(window);
        break;
      case 'connector_sync':
        current_sli = await this.sliCalculator.calculateConnectorSyncSLI(window);
        break;
      case 'rule_execution':
        current_sli = await this.sliCalculator.calculateRuleExecutionSLI(window);
        break;
      case 'dashboard_performance':
        current_sli = await this.sliCalculator.calculateDashboardPerformanceSLI(
          window,
        );
        break;
    }

    const budget_remaining = slo - current_sli;
    const budget_spent_percent = Math.max(0, ((slo - current_sli) / slo) * 100);

    let risk_level: 'green' | 'yellow' | 'red' = 'green';
    if (budget_spent_percent >= 80) risk_level = 'red';
    else if (budget_spent_percent >= 50) risk_level = 'yellow';

    const days_remaining =
      period === 'day' ? 1 : Math.floor((31 - new Date().getDate()) / 2);

    return {
      service,
      slo,
      current_sli,
      budget_remaining,
      budget_spent_percent,
      risk_level,
      days_remaining,
      alert_threshold: this.getAlertThreshold(service),
    };
  }

  /**
   * Check if error budget has been breached (spent > 100%)
   */
  async checkBudgetBreach(
    service: keyof typeof this.sloMap,
  ): Promise<boolean> {
    const budget = await this.calculateErrorBudget(service, 'month');
    if (budget.budget_spent_percent > 100) {
      console.error(
        `🚨 ERROR BUDGET BREACH: ${service} spent ${budget.budget_spent_percent.toFixed(2)}%`,
      );
      return true;
    }
    return false;
  }

  /**
   * Check if deployment should be frozen
   * Condition: budget >= 90% spent AND >= 10 days remaining
   */
  async shouldFreezeDeployments(
    service: keyof typeof this.sloMap,
  ): Promise<boolean> {
    const budget = await this.calculateErrorBudget(service, 'month');
    const shouldFreeze =
      budget.budget_spent_percent >= 90 && budget.days_remaining >= 10;

    if (shouldFreeze) {
      console.warn(
        `⚠️  DEPLOYMENT FREEZE: ${service} error budget at ${budget.budget_spent_percent.toFixed(2)}%`,
      );
    }

    return shouldFreeze;
  }

  /**
   * Get all error budgets
   */
  async getAllErrorBudgets(period: 'day' | 'month' = 'month') {
    const services = Object.keys(
      this.sloMap,
    ) as (keyof typeof this.sloMap)[];
    const budgets = await Promise.all(
      services.map((service) => this.calculateErrorBudget(service, period)),
    );

    return {
      period,
      timestamp: new Date().toISOString(),
      budgets,
      summary: {
        total_services: services.length,
        green: budgets.filter((b) => b.risk_level === 'green').length,
        yellow: budgets.filter((b) => b.risk_level === 'yellow').length,
        red: budgets.filter((b) => b.risk_level === 'red').length,
        any_breach: budgets.some((b) => b.budget_spent_percent > 100),
        should_freeze_deployments: budgets.some(
          (b) => b.budget_spent_percent >= 90,
        ),
      },
    };
  }

  /**
   * Get alert threshold for a service
   */
  private getAlertThreshold(service: keyof typeof this.sloMap): string {
    const thresholds = {
      api_availability: '< 99.0% in rolling 1-hour window',
      permission_check: '< 99.5% in rolling 30-minute window',
      connector_sync: '< 90% in rolling 6-hour window',
      rule_execution: '< 98.5% in rolling 1-hour window',
      dashboard_performance: 'p95 > 1000ms in rolling 5-minute window',
    };
    return thresholds[service];
  }
}
