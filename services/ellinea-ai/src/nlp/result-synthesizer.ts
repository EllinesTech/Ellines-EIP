/**
 * Result Synthesizer
 * Combines data from multiple sources into natural language narrative
 */

import { ParsedQuery } from './query-parser';

export interface QueryResult {
  connectorId: string;
  connectorName: string;
  data: any[];
  metadata?: {
    rowCount: number;
    executionTime: number;
    latency: number;
  };
}

export interface SynthesizedResult {
  narrative: string;
  summary: string;
  keyFindings: string[];
  dataInsights: DataInsight[];
  confidenceScore: number;
  sources: SourceReference[];
}

export interface DataInsight {
  type: 'trend' | 'anomaly' | 'comparison' | 'distribution' | 'relationship';
  description: string;
  confidence: number;
  evidence: string[];
}

export interface SourceReference {
  connectorName: string;
  recordCount: number;
  executionTime: number;
}

export class ResultSynthesizer {
  /**
   * Synthesize results from multiple sources into natural language narrative
   */
  synthesize(parsedQuery: ParsedQuery, results: QueryResult[]): SynthesizedResult {
    if (results.length === 0) {
      return {
        narrative: 'No results found for your query.',
        summary: 'No data available',
        keyFindings: [],
        dataInsights: [],
        confidenceScore: 0,
        sources: [],
      };
    }

    // Merge and analyze results
    const mergedData = this.mergeResults(results);
    const insights = this.extractInsights(mergedData, parsedQuery);
    const keyFindings = this.generateKeyFindings(mergedData, insights);
    const narrative = this.generateNarrative(parsedQuery, mergedData, keyFindings, insights);
    const summary = this.generateSummary(keyFindings);
    const sourceRefs = results.map(r => ({
      connectorName: r.connectorName,
      recordCount: r.data.length,
      executionTime: r.metadata?.executionTime || 0,
    }));

    // Calculate confidence based on data quality
    const confidenceScore = this.calculateConfidence(results, insights);

    return {
      narrative,
      summary,
      keyFindings,
      dataInsights: insights,
      confidenceScore,
      sources: sourceRefs,
    };
  }

  private mergeResults(results: QueryResult[]): any[] {
    if (results.length === 1) {
      return results[0].data;
    }

    // For multiple results, try to merge intelligently
    const merged: any[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      for (const item of result.data) {
        const key = JSON.stringify(item);
        if (!seen.has(key)) {
          merged.push({
            ...item,
            _source: result.connectorName,
          });
          seen.add(key);
        }
      }
    }

    return merged;
  }

  private extractInsights(data: any[], query: ParsedQuery): DataInsight[] {
    const insights: DataInsight[] = [];

    if (data.length === 0) {
      return insights;
    }

    // Trend analysis
    const trendInsight = this.analyzeTrend(data);
    if (trendInsight) {
      insights.push(trendInsight);
    }

    // Anomaly detection
    const anomalyInsight = this.detectAnomalies(data);
    if (anomalyInsight) {
      insights.push(anomalyInsight);
    }

    // Distribution analysis
    const distributionInsight = this.analyzeDistribution(data);
    if (distributionInsight) {
      insights.push(distributionInsight);
    }

    // Comparison analysis
    if (query.constraints.length > 0) {
      const comparisonInsight = this.compareValues(data, query.constraints);
      if (comparisonInsight) {
        insights.push(comparisonInsight);
      }
    }

    return insights;
  }

  private analyzeTrend(data: any[]): DataInsight | null {
    // Look for time-series or sequential patterns
    const numericValues = data
      .map(item => {
        // Try to find numeric value
        for (const key of Object.keys(item)) {
          const val = item[key];
          if (typeof val === 'number') {
            return val;
          }
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (numericValues.length < 3) {
      return null;
    }

    const first = numericValues[0];
    const last = numericValues[numericValues.length - 1];
    const average = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const percentChange = ((last - first) / first) * 100;

    const direction = percentChange > 0 ? 'increasing' : 'decreasing';
    const magnitude = Math.abs(percentChange).toFixed(1);

    return {
      type: 'trend',
      description: `${direction} trend with ${magnitude}% change`,
      confidence: 0.8,
      evidence: [`Initial value: ${first}`, `Final value: ${last}`, `Average: ${average.toFixed(2)}`],
    };
  }

  private detectAnomalies(data: any[]): DataInsight | null {
    // Simple statistical anomaly detection
    const numericValues = data
      .map(item => {
        for (const key of Object.keys(item)) {
          const val = item[key];
          if (typeof val === 'number') {
            return val;
          }
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (numericValues.length < 5) {
      return null;
    }

    const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const variance =
      numericValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericValues.length;
    const stdDev = Math.sqrt(variance);

    const anomalies = numericValues.filter(v => Math.abs(v - mean) > 2 * stdDev);

    if (anomalies.length === 0) {
      return null;
    }

    return {
      type: 'anomaly',
      description: `Found ${anomalies.length} anomalous value(s) exceeding 2 standard deviations`,
      confidence: 0.75,
      evidence: anomalies.map(a => `Outlier: ${a}`).slice(0, 3),
    };
  }

  private analyzeDistribution(data: any[]): DataInsight | null {
    // Analyze distribution of categorical or numeric values
    const valueMap = new Map<string, number>();

    for (const item of data) {
      for (const key of Object.keys(item)) {
        const val = String(item[key]);
        valueMap.set(val, (valueMap.get(val) || 0) + 1);
      }
    }

    if (valueMap.size < 2) {
      return null;
    }

    const sorted = Array.from(valueMap.entries()).sort(([, a], [, b]) => b - a);
    const topValues = sorted.slice(0, 3).map(([val, count]) => `${val}: ${count}`);

    return {
      type: 'distribution',
      description: `Distribution shows ${valueMap.size} distinct values`,
      confidence: 0.8,
      evidence: topValues,
    };
  }

  private compareValues(data: any[], constraints: any[]): DataInsight | null {
    if (data.length < 2) {
      return null;
    }

    const description = `Comparison across ${data.length} records`;

    return {
      type: 'comparison',
      description,
      confidence: 0.7,
      evidence: [`Total records: ${data.length}`, `Constraints applied: ${constraints.length}`],
    };
  }

  private generateKeyFindings(data: any[], insights: DataInsight[]): string[] {
    const findings: string[] = [];

    findings.push(`Total records analyzed: ${data.length}`);

    for (const insight of insights) {
      findings.push(insight.description);
    }

    // Add statistics
    const numericValues = data
      .flatMap(item =>
        Object.values(item).filter((v): v is number => typeof v === 'number'),
      )
      .sort((a, b) => a - b);

    if (numericValues.length > 0) {
      const median = numericValues[Math.floor(numericValues.length / 2)];
      const max = Math.max(...numericValues);
      const min = Math.min(...numericValues);
      findings.push(`Value range: ${min} to ${max}`);
      findings.push(`Median value: ${median}`);
    }

    return findings;
  }

  private generateSummary(findings: string[]): string {
    if (findings.length === 0) {
      return 'No summary available.';
    }

    return findings[0] + (findings.length > 1 ? ` Key insights: ${findings.slice(1, 3).join('; ')}` : '');
  }

  private generateNarrative(
    query: ParsedQuery,
    data: any[],
    findings: string[],
    insights: DataInsight[],
  ): string {
    const parts: string[] = [];

    // Opening
    parts.push(`Based on your query for ${query.intent.action}:`);

    // Results count
    if (data.length === 0) {
      parts.push('No results found.');
      return parts.join(' ');
    }

    parts.push(`I found ${data.length} record${data.length !== 1 ? 's' : ''}.`);

    // Key findings narrative
    if (findings.length > 0) {
      parts.push(`Key findings: ${findings[0].toLowerCase()}.`);

      if (findings.length > 1) {
        const additionalFindings = findings
          .slice(1, 3)
          .map(f => f.toLowerCase())
          .join('; ');
        parts.push(`Additionally: ${additionalFindings}.`);
      }
    }

    // Insights narrative
    for (const insight of insights) {
      parts.push(this.narrativeForInsight(insight));
    }

    // Closing with recommendations
    if (data.length > 100) {
      parts.push('Consider applying filters to narrow down the results.');
    }

    if (insights.some(i => i.type === 'anomaly')) {
      parts.push('The anomalies detected may warrant further investigation.');
    }

    return parts.join(' ');
  }

  private narrativeForInsight(insight: DataInsight): string {
    switch (insight.type) {
      case 'trend':
        return `Trend analysis shows ${insight.description}.`;
      case 'anomaly':
        return `The data contains some anomalies: ${insight.description}.`;
      case 'distribution':
        return `The data distribution indicates ${insight.description}.`;
      case 'comparison':
        return `Comparing across data: ${insight.description}.`;
      case 'relationship':
        return `A relationship is observed: ${insight.description}.`;
      default:
        return insight.description;
    }
  }

  private calculateConfidence(results: QueryResult[], insights: DataInsight[]): number {
    let confidence = 0.8; // Base confidence

    // Boost for multiple sources
    if (results.length > 1) {
      confidence += 0.05;
    }

    // Boost for insights
    confidence += Math.min(insights.length * 0.05, 0.15);

    // Check execution times
    const avgLatency =
      results.reduce((sum, r) => sum + (r.metadata?.latency || 0), 0) / results.length;
    if (avgLatency > 2000) {
      confidence -= 0.1; // Reduce confidence if slow
    }

    return Math.min(confidence, 1);
  }
}
