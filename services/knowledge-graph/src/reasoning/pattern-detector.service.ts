/**
 * Pattern Detector Service
 *
 * Detects hidden patterns by aggregating and correlating data from 3+
 * System of Record sources.
 *
 * Requirement 2.4: Detect hidden patterns by combining data from at least 3 SoR sources
 */

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Pattern, TimeRange } from './reasoning.interfaces';

/** Minimum number of sources required for cross-system pattern detection */
const MIN_SOURCES = 3;

@Injectable()
export class PatternDetectorService {
  private readonly logger = new Logger(PatternDetectorService.name);

  /**
   * Detect patterns across multiple data sources.
   *
   * Enforces the Requirement 2.4 minimum of 3 data sources.
   */
  async detectPatterns(dataSources: DataSource[]): Promise<Pattern[]> {
    this.logger.log(`Detecting patterns across ${dataSources.length} data sources`);

    const patterns: Pattern[] = [];

    // Requirement 2.4: Cross-system patterns need at least 3 sources
    const crossSystemPatterns = this.detectCrossSystemPatterns(dataSources);
    patterns.push(...crossSystemPatterns);

    // Single-source patterns (trends, anomalies, cycles)
    for (const src of dataSources) {
      const singleSourcePatterns = this.detectSingleSourcePatterns(src);
      patterns.push(...singleSourcePatterns);
    }

    this.logger.log(`Detected ${patterns.length} total patterns`);
    return patterns;
  }

  // ─── Cross-system pattern detection ──────────────────────────────────────

  private detectCrossSystemPatterns(dataSources: DataSource[]): Pattern[] {
    if (dataSources.length < MIN_SOURCES) {
      this.logger.warn(
        `Cross-system pattern detection requires ${MIN_SOURCES}+ sources; ` +
          `got ${dataSources.length}.`,
      );
      return [];
    }

    const patterns: Pattern[] = [];

    // Correlation pattern: look for shared entities across all sources
    const correlationPattern = this.detectCrossSourceCorrelation(dataSources);
    if (correlationPattern) patterns.push(correlationPattern);

    // Volume synchronicity: detect when multiple sources spike at the same time
    const volumePattern = this.detectVolumeSynchronicity(dataSources);
    if (volumePattern) patterns.push(volumePattern);

    // Common entity overlap pattern
    const overlapPattern = this.detectEntityOverlap(dataSources);
    if (overlapPattern) patterns.push(overlapPattern);

    return patterns;
  }

  private detectCrossSourceCorrelation(dataSources: DataSource[]): Pattern | null {
    // Find entity IDs (or record fields) that appear in ALL sources
    const idSets = dataSources.map(
      (src) => new Set(src.records.map((r) => String(r.id ?? r.entityId ?? r.customerId ?? ''))),
    );

    const sharedIds = idSets.reduce((a, b) => new Set([...a].filter((id) => id && b.has(id))));
    const sharedCount = sharedIds.size;

    if (sharedCount === 0) return null;

    const systems = dataSources.map((s) => s.systemName);
    const timeRange = this.computeTimeRange(dataSources);

    return {
      id: `cross_correlation_${Date.now()}`,
      name: 'Cross-System Entity Correlation',
      description:
        `${sharedCount} entities appear consistently across all ${dataSources.length} data sources ` +
        `(${systems.join(', ')}), suggesting systemic relationships.`,
      type: 'correlation',
      confidence: Math.min(0.5 + sharedCount * 0.01, 0.92),
      affectedSystems: systems,
      affectedEntityTypes: [...new Set(dataSources.map((s) => s.entityType))],
      occurrences: sharedCount,
      timeRange,
      strength: Math.min(sharedCount / 100, 1),
      metadata: { sharedEntityCount: sharedCount },
    };
  }

  private detectVolumeSynchronicity(dataSources: DataSource[]): Pattern | null {
    // Compare record counts per source and check for proportional spikes
    const counts = dataSources.map((s) => s.records.length);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance =
      counts.reduce((acc, c) => acc + Math.pow(c - avg, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    // If all sources have similar volume (low relative stdDev), flag as trend
    const relativeStdDev = stdDev / (avg || 1);
    if (relativeStdDev > 0.5) return null; // Too much variance — no synchronicity

    const systems = dataSources.map((s) => s.systemName);
    const timeRange = this.computeTimeRange(dataSources);

    return {
      id: `volume_sync_${Date.now()}`,
      name: 'Synchronized Data Volume Across Systems',
      description:
        `Record volumes across ${systems.join(', ')} are proportionally aligned ` +
        `(CV=${relativeStdDev.toFixed(2)}), indicating coordinated business activity.`,
      type: 'trend',
      confidence: Math.max(0.6, 1 - relativeStdDev),
      affectedSystems: systems,
      affectedEntityTypes: [...new Set(dataSources.map((s) => s.entityType))],
      occurrences: counts.reduce((a, b) => a + b, 0),
      timeRange,
      strength: 1 - relativeStdDev,
    };
  }

  private detectEntityOverlap(dataSources: DataSource[]): Pattern | null {
    const systems = dataSources.map((s) => s.systemName);
    const totalRecords = dataSources.reduce((acc, s) => acc + s.records.length, 0);
    if (totalRecords === 0) return null;

    // Count how many sources each entity type appears in
    const entityTypeSources = new Map<string, Set<string>>();
    for (const src of dataSources) {
      const key = src.entityType;
      if (!entityTypeSources.has(key)) entityTypeSources.set(key, new Set());
      entityTypeSources.get(key)!.add(src.systemName);
    }

    // Find types present in 3+ sources
    const overlapping = [...entityTypeSources.entries()].filter(
      ([, srcs]) => srcs.size >= MIN_SOURCES,
    );
    if (overlapping.length === 0) return null;

    const timeRange = this.computeTimeRange(dataSources);

    return {
      id: `entity_overlap_${Date.now()}`,
      name: 'Entity Type Overlap Across Systems',
      description:
        `Entity types [${overlapping.map(([k]) => k).join(', ')}] appear in ` +
        `${MIN_SOURCES}+ systems (${systems.join(', ')}), indicating ` +
        `shared master data and cross-system operational patterns.`,
      type: 'correlation',
      confidence: 0.78,
      affectedSystems: systems,
      affectedEntityTypes: overlapping.map(([k]) => k),
      occurrences: overlapping.length,
      timeRange,
      strength: overlapping.length / entityTypeSources.size,
    };
  }

  // ─── Single-source pattern detection ─────────────────────────────────────

  private detectSingleSourcePatterns(source: DataSource): Pattern[] {
    const patterns: Pattern[] = [];

    if (source.records.length < 5) return patterns;

    // Anomaly: unusually small or large record count
    const anomaly = this.detectVolumeAnomaly(source);
    if (anomaly) patterns.push(anomaly);

    // Distribution: detect numeric field distribution
    const distribution = this.detectDistributionPattern(source);
    if (distribution) patterns.push(distribution);

    return patterns;
  }

  private detectVolumeAnomaly(source: DataSource): Pattern | null {
    const count = source.records.length;
    // A very simplified anomaly: flag if record count is a power of 2 (test heuristic)
    // In production this would use statistical baselines from InfluxDB
    if (count > 1000 || count < 5) {
      const timeRange = source.timeRange ?? this.defaultTimeRange();
      return {
        id: `volume_anomaly_${source.id}_${Date.now()}`,
        name: `Unusual Record Volume in ${source.systemName}`,
        description: `${source.systemName} has ${count} ${source.entityType} records — outside typical range.`,
        type: 'anomaly',
        confidence: 0.6,
        affectedSystems: [source.systemName],
        affectedEntityTypes: [source.entityType],
        occurrences: count,
        timeRange,
        strength: 0.5,
      };
    }
    return null;
  }

  private detectDistributionPattern(source: DataSource): Pattern | null {
    // Find the first numeric field and compute a simple distribution metric
    const sample = source.records.slice(0, 100);
    const numericKey = Object.keys(sample[0] ?? {}).find(
      (k) => typeof sample[0][k] === 'number',
    );
    if (!numericKey) return null;

    const values = sample.map((r) => Number(r[numericKey])).filter(isFinite);
    if (values.length < 5) return null;

    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
    const cv = Math.sqrt(variance) / (Math.abs(avg) || 1);

    if (cv < 0.1) return null; // Too uniform to be interesting

    const timeRange = source.timeRange ?? this.defaultTimeRange();
    return {
      id: `distribution_${source.id}_${Date.now()}`,
      name: `Distribution Pattern in ${source.systemName}.${numericKey}`,
      description:
        `Field "${numericKey}" in ${source.systemName} shows a coefficient of variation ` +
        `of ${cv.toFixed(2)}, indicating notable spread in ${source.entityType} data.`,
      type: 'distribution',
      confidence: 0.55,
      affectedSystems: [source.systemName],
      affectedEntityTypes: [source.entityType],
      occurrences: values.length,
      timeRange,
      strength: Math.min(cv, 1),
      metadata: { field: numericKey, average: avg, cv },
    };
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private computeTimeRange(dataSources: DataSource[]): TimeRange {
    const ranges = dataSources.map((s) => s.timeRange).filter(Boolean) as TimeRange[];
    if (ranges.length === 0) return this.defaultTimeRange();

    const froms = ranges.map((r) => r.from.getTime());
    const tos = ranges.map((r) => r.to.getTime());
    return { from: new Date(Math.min(...froms)), to: new Date(Math.max(...tos)) };
  }

  private defaultTimeRange(): TimeRange {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: thirtyDaysAgo, to: now };
  }
}
