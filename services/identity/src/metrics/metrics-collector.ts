import { Injectable } from '@nestjs/common';
import { Meter, Counter, Histogram } from '@opentelemetry/api';
import { initializeMetrics } from './metrics';

/**
 * Metrics collector for tracking key observability metrics
 */
@Injectable()
export class MetricsCollector {
  private meter: Meter;

  private requestDuration?: Histogram;
  private requestCounter?: Counter;
  private permissionCheckDuration?: Histogram;
  private permissionDenials?: Counter;
  private ruleExecutionDuration?: Histogram;
  private ruleFailures?: Counter;
  private connectorSyncDuration?: Histogram;
  private connectorErrors?: Counter;
  private dashboardRefreshDuration?: Histogram;

  constructor() {
    this.meter = initializeMetrics();
    this.initializeMetrics();
  }

  private initializeMetrics() {
    try {
      // Request metrics
      this.requestDuration = this.meter.createHistogram(
        'http_request_duration_seconds',
        {
          description: 'HTTP request latency in seconds',
          unit: 's',
        },
      );

      this.requestCounter = this.meter.createCounter('http_request_total', {
        description: 'Total HTTP requests',
      });

      // Permission metrics
      this.permissionCheckDuration = this.meter.createHistogram(
        'permission_check_duration_ms',
        {
          description: 'Permission check latency in milliseconds',
          unit: 'ms',
        },
      );

      this.permissionDenials = this.meter.createCounter(
        'permission_denial_total',
        {
          description: 'Total permission denials',
        },
      );

      // Rule metrics
      this.ruleExecutionDuration = this.meter.createHistogram(
        'rule_execution_duration_ms',
        {
          description: 'Rule execution time in milliseconds',
          unit: 'ms',
        },
      );

      this.ruleFailures = this.meter.createCounter('rule_failure_total', {
        description: 'Total rule execution failures',
      });

      // Connector metrics
      this.connectorSyncDuration = this.meter.createHistogram(
        'connector_sync_duration_ms',
        {
          description: 'Connector sync time in milliseconds',
          unit: 'ms',
        },
      );

      this.connectorErrors = this.meter.createCounter('connector_error_total', {
        description: 'Total connector sync errors',
      });

      // Dashboard metrics
      this.dashboardRefreshDuration = this.meter.createHistogram(
        'dashboard_refresh_duration_ms',
        {
          description: 'Dashboard refresh time in milliseconds',
          unit: 'ms',
        },
      );

      console.log('✓ Metrics collector initialized');
    } catch (error) {
      console.error('Failed to initialize metrics:', error);
    }
  }

  // Request metrics methods

  recordRequestDuration(duration: number, attributes?: Record<string, string>) {
    this.requestDuration?.record(duration, attributes);
  }

  recordRequest(attributes?: Record<string, string>) {
    this.requestCounter?.add(1, attributes);
  }

  // Permission metrics methods

  recordPermissionCheckDuration(
    duration: number,
    attributes?: Record<string, string>,
  ) {
    this.permissionCheckDuration?.record(duration, attributes);
  }

  recordPermissionDenial(attributes?: Record<string, string>) {
    this.permissionDenials?.add(1, attributes);
  }

  // Rule metrics methods

  recordRuleExecutionDuration(
    duration: number,
    attributes?: Record<string, string>,
  ) {
    this.ruleExecutionDuration?.record(duration, attributes);
  }

  recordRuleFailure(attributes?: Record<string, string>) {
    this.ruleFailures?.add(1, attributes);
  }

  // Connector metrics methods

  recordConnectorSyncDuration(
    duration: number,
    attributes?: Record<string, string>,
  ) {
    this.connectorSyncDuration?.record(duration, attributes);
  }

  recordConnectorError(attributes?: Record<string, string>) {
    this.connectorErrors?.add(1, attributes);
  }

  // Dashboard metrics methods

  recordDashboardRefreshDuration(
    duration: number,
    attributes?: Record<string, string>,
  ) {
    this.dashboardRefreshDuration?.record(duration, attributes);
  }
}
