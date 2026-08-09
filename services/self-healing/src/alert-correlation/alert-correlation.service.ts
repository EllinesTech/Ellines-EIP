/**
 * Alert Correlation Engine
 *
 * Groups related alerts, identifies root causes, suppresses noise
 * Requirements: 12.1–12.8
 */

import { Injectable, Logger } from '@nestjs/common';

export interface Alert {
  id: string;
  organizationId: string;
  component: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  category: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertCluster {
  id: string;
  alerts: Alert[];
  rootCause: Alert | null;
  symptoms: Alert[];
  correlationStrength: number;
  firstSeen: Date;
  lastSeen: Date;
  resolved: boolean;
}

export interface UrgencyScore {
  score: number; // 0-100
  businessImpact: number;
  affectedUsers: number;
  serviceDependencies: string[];
}

export interface TopologyNode {
  id: string;
  component: string;
  alertCount: number;
  severity: string;
}

export interface TopologyVisualization {
  nodes: TopologyNode[];
  edges: Array<{ from: string; to: string; weight: number }>;
}

export interface AlertStorm {
  id: string;
  alertCount: number;
  timeWindowSeconds: number;
  summary: string;
  topCategories: Record<string, number>;
  action: 'create_incident' | 'suppress' | 'escalate';
}

// Requirement 12.1: 5-minute clustering window
const CLUSTER_WINDOW_MS = 5 * 60 * 1000;
// Requirement 12.4: >10 alerts in 1 minute = storm
const STORM_THRESHOLD = 10;
const STORM_WINDOW_MS = 60 * 1000;

@Injectable()
export class AlertCorrelationService {
  private readonly logger = new Logger(AlertCorrelationService.name);

  /**
   * Correlate alerts into clusters by time window and component proximity
   * Requirement 12.1: Group alerts within 5-minute windows
   */
  correlateAlerts(alerts: Alert[]): AlertCluster[] {
    if (alerts.length === 0) return [];

    const sorted = [...alerts].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const clusters: AlertCluster[] = [];
    const assigned = new Set<string>();

    for (const alert of sorted) {
      if (assigned.has(alert.id)) continue;

      // Find all alerts within the 5-minute window and same/related component
      const window = sorted.filter(
        (a) =>
          !assigned.has(a.id) &&
          Math.abs(a.timestamp.getTime() - alert.timestamp.getTime()) <= CLUSTER_WINDOW_MS &&
          this.areComponentsRelated(a.component, alert.component),
      );

      if (window.length === 0) continue;

      window.forEach((a) => assigned.add(a.id));

      const rootCause = this.identifyRootCause(window);
      const symptoms = window.filter((a) => a.id !== rootCause?.id);

      clusters.push({
        id: `cluster_${Date.now()}_${clusters.length}`,
        alerts: window,
        rootCause,
        symptoms,
        correlationStrength: this.calculateCorrelationStrength(window),
        firstSeen: window[0].timestamp,
        lastSeen: window[window.length - 1].timestamp,
        resolved: false,
      });
    }

    this.logger.log(`Correlated ${alerts.length} alerts into ${clusters.length} clusters`);
    return clusters;
  }

  /**
   * Identify root cause alert in a cluster
   * Requirement 12.2: Separate causes from symptoms
   */
  identifyRootCause(alerts: Alert[]): Alert | null {
    if (alerts.length === 0) return null;
    if (alerts.length === 1) return alerts[0];

    // Root cause heuristics (in priority order):
    // 1. Infrastructure/database alerts usually cause application alerts
    // 2. Earlier alerts are more likely root causes
    // 3. Higher severity = more likely root cause
    const scored = alerts.map((alert) => ({
      alert,
      score: this.rootCauseScore(alert, alerts),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].alert;
  }

  private rootCauseScore(alert: Alert, allAlerts: Alert[]): number {
    let score = 0;

    // Infrastructure components score higher as root causes
    const infraKeywords = ['database', 'postgres', 'redis', 'network', 'disk', 'memory', 'cpu'];
    if (infraKeywords.some((k) => alert.component.toLowerCase().includes(k))) {
      score += 40;
    }

    // Earlier alert = more likely root cause
    const minTime = Math.min(...allAlerts.map((a) => a.timestamp.getTime()));
    if (alert.timestamp.getTime() === minTime) score += 30;

    // Higher severity = higher score
    const severityScore = { critical: 30, high: 20, medium: 10, low: 5 };
    score += severityScore[alert.severity] || 0;

    return score;
  }

  /**
   * Suppress duplicate alerts
   * Requirement 12.3: Duplicate suppression
   */
  suppressDuplicates(alerts: Alert[]): Alert[] {
    const seen = new Map<string, Alert>();

    for (const alert of alerts) {
      const key = `${alert.component}:${alert.category}:${alert.severity}`;
      const existing = seen.get(key);

      if (!existing || alert.timestamp > existing.timestamp) {
        seen.set(key, alert);
      }
    }

    const unique = Array.from(seen.values());
    const suppressed = alerts.length - unique.length;
    if (suppressed > 0) {
      this.logger.log(`Suppressed ${suppressed} duplicate alerts`);
    }
    return unique;
  }

  /**
   * Detect alert storms
   * Requirement 12.4: >10 alerts in 1 minute = storm
   */
  detectStorm(alerts: Alert[]): AlertStorm | null {
    if (alerts.length < STORM_THRESHOLD) return null;

    const now = Date.now();
    const recentAlerts = alerts.filter(
      (a) => now - a.timestamp.getTime() <= STORM_WINDOW_MS,
    );

    if (recentAlerts.length < STORM_THRESHOLD) return null;

    // Count by category
    const categories: Record<string, number> = {};
    for (const alert of recentAlerts) {
      categories[alert.category] = (categories[alert.category] || 0) + 1;
    }

    this.logger.warn(`Alert storm detected: ${recentAlerts.length} alerts in 60s`);

    return {
      id: `storm_${Date.now()}`,
      alertCount: recentAlerts.length,
      timeWindowSeconds: 60,
      summary: `${recentAlerts.length} alerts in 60 seconds across ${Object.keys(categories).length} categories`,
      topCategories: categories,
      action: recentAlerts.length > 50 ? 'suppress' : 'create_incident',
    };
  }

  /**
   * Calculate urgency score
   * Requirement 12.7: Urgency based on business impact and affected users
   */
  calculateUrgency(alert: Alert, affectedUsers = 0, dependencies: string[] = []): UrgencyScore {
    let businessImpact = 0;

    // Severity weighting
    const severityWeight = { critical: 40, high: 30, medium: 15, low: 5 };
    businessImpact += severityWeight[alert.severity] || 0;

    // Component criticality
    const criticalComponents = ['auth', 'identity', 'payment', 'database'];
    if (criticalComponents.some((c) => alert.component.toLowerCase().includes(c))) {
      businessImpact += 30;
    }

    // Affected users impact
    const userScore = Math.min(affectedUsers / 100, 20); // Max 20 points for users
    businessImpact += userScore;

    // Dependencies impact
    const depScore = Math.min(dependencies.length * 3, 10); // Max 10 points for deps
    businessImpact += depScore;

    const finalScore = Math.min(Math.round(businessImpact), 100);

    return {
      score: finalScore,
      businessImpact,
      affectedUsers,
      serviceDependencies: dependencies,
    };
  }

  /**
   * Generate topology visualization
   * Requirement 12.6: Visual topology showing related alerts
   */
  visualizeTopology(cluster: AlertCluster): TopologyVisualization {
    const nodeMap = new Map<string, TopologyNode>();
    const edges: Array<{ from: string; to: string; weight: number }> = [];

    // Build nodes
    for (const alert of cluster.alerts) {
      if (!nodeMap.has(alert.component)) {
        nodeMap.set(alert.component, {
          id: alert.component,
          component: alert.component,
          alertCount: 0,
          severity: alert.severity,
        });
      }
      const node = nodeMap.get(alert.component)!;
      node.alertCount++;
      // Escalate severity
      if (this.severityLevel(alert.severity) > this.severityLevel(node.severity as any)) {
        node.severity = alert.severity;
      }
    }

    // Build edges from root cause to symptoms
    if (cluster.rootCause) {
      for (const symptom of cluster.symptoms) {
        if (symptom.component !== cluster.rootCause.component) {
          edges.push({
            from: cluster.rootCause.component,
            to: symptom.component,
            weight: cluster.correlationStrength,
          });
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    };
  }

  /**
   * Close symptom alerts when root cause is resolved
   * Requirement 12.8: Auto-close symptoms when root cause resolved
   */
  resolveCluster(cluster: AlertCluster): AlertCluster {
    this.logger.log(
      `Resolving cluster ${cluster.id}: closing ${cluster.symptoms.length} symptom alerts`,
    );
    return { ...cluster, resolved: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private areComponentsRelated(a: string, b: string): boolean {
    if (a === b) return true;
    // Same service prefix (e.g. identity-api and identity-worker)
    const prefixA = a.split('-')[0];
    const prefixB = b.split('-')[0];
    return prefixA === prefixB;
  }

  private calculateCorrelationStrength(alerts: Alert[]): number {
    if (alerts.length === 1) return 1.0;
    const timeSpan =
      alerts[alerts.length - 1].timestamp.getTime() - alerts[0].timestamp.getTime();
    // Tighter time window = stronger correlation
    return Math.max(0, 1 - timeSpan / CLUSTER_WINDOW_MS);
  }

  private severityLevel(severity: 'critical' | 'high' | 'medium' | 'low'): number {
    return { critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0;
  }
}
