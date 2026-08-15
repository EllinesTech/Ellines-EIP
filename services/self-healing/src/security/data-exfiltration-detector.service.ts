/**
 * Data Exfiltration Detector Service
 *
 * Detects large downloads and unusual export operations compared to
 * per-role/department baselines.
 *
 * Requirements: 15.2 — Detect data exfiltration attempts including large
 * downloads and unusual export operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  SecurityEvent,
  SecurityPolicy,
  SecuritySeverity,
  UserBehaviorBaseline,
  UserSession,
} from './security-anomaly.interfaces';
import { UserBehaviorProfilerService } from './user-behavior-profiler.service';

@Injectable()
export class DataExfiltrationDetectorService {
  private readonly logger = new Logger(DataExfiltrationDetectorService.name);

  constructor(private readonly profiler: UserBehaviorProfilerService) {}

  /**
   * Analyze a session for data exfiltration signals.
   *
   * Detection logic:
   *  1. Absolute threshold: export > policy.maxExportBytesAbsolute (default 500 MB)
   *  2. Relative threshold: export > policy.exfiltrationThresholdMultiplier × role baseline
   *
   * Both checks are performed; the higher-confidence one is returned.
   */
  detect(
    session: UserSession,
    role: string,
    department: string,
    policy: SecurityPolicy,
  ): SecurityEvent | null {
    const exportBytes = session.exportVolumeBytes;
    const downloadBytes = session.dataAccessedBytes;

    // Retrieve baseline export volume for this user's role/dept
    const baselineExport = this.profiler.getExportVolumeBaseline(
      session.userId,
      role,
      department,
    );

    const relativeThreshold =
      baselineExport * policy.exfiltrationThresholdMultiplier;

    // Absolute threshold: 500 MB by default
    const absoluteThreshold = policy.maxExportBytesAbsolute ?? 500 * 1024 * 1024;

    const absoluteTriggered = exportBytes > absoluteThreshold || downloadBytes > absoluteThreshold;
    const relativeTriggered =
      this.profiler.isUserBaselineReliable(session.userId) &&
      exportBytes > relativeThreshold;

    if (!absoluteTriggered && !relativeTriggered) return null;

    const userBaseline = this.profiler.getUserBaseline(session.userId);
    const confidence = this.computeConfidence(
      exportBytes,
      baselineExport,
      policy.exfiltrationThresholdMultiplier,
      absoluteTriggered,
      relativeTriggered,
    );
    const severity: SecuritySeverity = confidence >= 0.9 ? 'critical' : 'high';

    const reasons: string[] = [];
    if (absoluteTriggered) {
      reasons.push(
        `Export volume ${this.fmt(exportBytes)} exceeds absolute threshold ${this.fmt(absoluteThreshold)}`,
      );
    }
    if (relativeTriggered) {
      reasons.push(
        `Export volume ${this.fmt(exportBytes)} exceeds ${policy.exfiltrationThresholdMultiplier}x role baseline (${this.fmt(baselineExport)})`,
      );
    }

    const event: SecurityEvent = {
      id: `exfil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organizationId: session.organizationId,
      userId: session.userId,
      sessionId: session.sessionId,
      type: 'data_exfiltration',
      severity,
      confidence,
      evidence: {
        description: reasons.join('; '),
        data: {
          exportVolumeBytes: exportBytes,
          downloadVolumeBytes: downloadBytes,
          baselineExportBytes: baselineExport,
          relativeThreshold,
          absoluteThreshold,
          multiplier: exportBytes / Math.max(baselineExport, 1),
          role,
          department,
        },
        baseline: userBaseline ?? undefined,
        observed: {
          exportVolumeBytes: exportBytes,
          dataAccessedBytes: downloadBytes,
        },
      },
      timestamp: new Date(),
      resolved: false,
    };

    this.logger.warn(
      `[DataExfil] user=${session.userId} org=${session.organizationId} ` +
        `export=${this.fmt(exportBytes)} baseline=${this.fmt(baselineExport)} ` +
        `conf=${confidence.toFixed(2)} severity=${severity}`,
    );
    return event;
  }

  private computeConfidence(
    exportBytes: number,
    baselineBytes: number,
    multiplier: number,
    absoluteTriggered: boolean,
    relativeTriggered: boolean,
  ): number {
    let confidence = 0.6;

    if (absoluteTriggered) {
      // Larger absolute volumes → higher confidence
      const absoluteThreshold = 500 * 1024 * 1024;
      confidence = Math.min(
        0.65 + 0.35 * ((exportBytes - absoluteThreshold) / absoluteThreshold),
        0.98,
      );
    }

    if (relativeTriggered) {
      const excess =
        (exportBytes - baselineBytes * multiplier) / Math.max(baselineBytes * multiplier, 1);
      const relativeConfidence = Math.min(0.6 + 0.4 * excess, 0.97);
      confidence = Math.max(confidence, relativeConfidence);
    }

    return Math.max(0, Math.min(confidence, 1));
  }

  private fmt(bytes: number): string {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${bytes} B`;
  }
}
