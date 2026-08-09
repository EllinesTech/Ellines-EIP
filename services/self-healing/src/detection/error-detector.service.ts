import { Injectable, Logger } from '@nestjs/common';
import { Error, ErrorPattern, ErrorClassification } from '../interfaces/error.interface';

/**
 * Error Detector Service
 * 
 * Detects error patterns from multiple sources (logs, metrics, health checks, API responses).
 * Validates Requirements 4.2, 4.4
 */
@Injectable()
export class ErrorDetectorService {
  private readonly logger = new Logger(ErrorDetectorService.name);
  private readonly errorPatterns = new Map<string, ErrorPattern>();
  private readonly recentErrors: Error[] = [];
  private readonly maxRecentErrors = 1000;

  /**
   * Detect error patterns from log entries
   * Requirement 4.2: Detect errors from multiple sources including logs
   */
  async detectErrorPattern(logs: Array<{ timestamp: Date; level: string; message: string; component: string }>): Promise<ErrorPattern[]> {
    const patterns: ErrorPattern[] = [];
    const errorLogs = logs.filter(log => ['error', 'fatal', 'critical'].includes(log.level.toLowerCase()));

    for (const log of errorLogs) {
      const error: Error = {
        id: this.generateErrorId(),
        message: log.message,
        component: log.component,
        timestamp: log.timestamp,
        source: 'log',
        metadata: {},
      };

      this.recentErrors.push(error);
      if (this.recentErrors.length > this.maxRecentErrors) {
        this.recentErrors.shift();
      }

      // Check if error matches existing patterns
      const matchedPattern = this.findMatchingPattern(error);
      if (matchedPattern) {
        matchedPattern.frequency++;
        matchedPattern.lastSeen = error.timestamp;
        matchedPattern.examples.push(error.message.substring(0, 200));
        if (matchedPattern.examples.length > 5) {
          matchedPattern.examples.shift();
        }
      } else {
        // Create new pattern
        const newPattern = this.createErrorPattern(error);
        this.errorPatterns.set(newPattern.id, newPattern);
        patterns.push(newPattern);
      }
    }

    return patterns;
  }

  /**
   * Analyze errors using anomaly detection
   * Requirement 4.4: Use anomaly detection to identify unusual behavior
   */
  async detectAnomalies(timeWindow: number = 3600000): Promise<ErrorPattern[]> {
    const now = Date.now();
    const recentErrors = this.recentErrors.filter(
      err => now - err.timestamp.getTime() < timeWindow
    );

    if (recentErrors.length === 0) return [];

    // Group errors by component
    const errorsByComponent = new Map<string, Error[]>();
    for (const error of recentErrors) {
      const errors = errorsByComponent.get(error.component) || [];
      errors.push(error);
      errorsByComponent.set(error.component, errors);
    }

    const anomalies: ErrorPattern[] = [];

    // Detect components with unusual error rates
    for (const [component, errors] of errorsByComponent.entries()) {
      const errorRate = (errors.length / timeWindow) * 3600000; // errors per hour
      
      // Simple anomaly detection: if error rate > 10 per hour, flag as anomaly
      if (errorRate > 10) {
        const pattern: ErrorPattern = {
          id: this.generatePatternId(),
          pattern: `High error rate in ${component}`,
          frequency: errors.length,
          firstSeen: errors[0].timestamp,
          lastSeen: errors[errors.length - 1].timestamp,
          classification: {
            severity: errorRate > 100 ? 'critical' : errorRate > 50 ? 'high' : 'medium',
            impact: {
              affectedServices: [component],
              businessImpact: errorRate > 100 ? 'high' : 'medium',
            },
            category: 'application_error',
            isRootCause: false,
            confidence: 75,
          },
          examples: errors.slice(0, 5).map(e => e.message),
        };
        anomalies.push(pattern);
      }
    }

    return anomalies;
  }

  /**
   * Get all detected error patterns
   */
  getErrorPatterns(): ErrorPattern[] {
    return Array.from(this.errorPatterns.values());
  }

  /**
   * Get recent errors for analysis
   */
  getRecentErrors(count: number = 100): Error[] {
    return this.recentErrors.slice(-count);
  }

  /**
   * Find matching pattern for an error
   */
  private findMatchingPattern(error: Error): ErrorPattern | null {
    for (const pattern of this.errorPatterns.values()) {
      if (pattern.regex) {
        const regex = new RegExp(pattern.regex);
        if (regex.test(error.message)) {
          return pattern;
        }
      } else if (error.message.includes(pattern.pattern)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Create a new error pattern from an error
   */
  private createErrorPattern(error: Error): ErrorPattern {
    // Extract key error pattern (simplified version)
    const pattern = this.extractPattern(error.message);

    return {
      id: this.generatePatternId(),
      pattern,
      frequency: 1,
      firstSeen: error.timestamp,
      lastSeen: error.timestamp,
      classification: {
        severity: 'medium',
        impact: {
          affectedServices: [error.component],
          businessImpact: 'medium',
        },
        category: 'application_error',
        isRootCause: true,
        confidence: 50,
      },
      examples: [error.message.substring(0, 200)],
    };
  }

  /**
   * Extract pattern from error message (simplified)
   */
  private extractPattern(message: string): string {
    // Remove timestamps, IDs, and other variable parts
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, '[TIMESTAMP]')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
      .replace(/\d+/g, '[NUMBER]')
      .substring(0, 100);
  }

  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePatternId(): string {
    return `ptn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
