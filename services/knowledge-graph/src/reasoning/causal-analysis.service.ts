/**
 * Causal Analysis Service
 *
 * Identifies causal relationships between events using temporal analysis
 * and domain knowledge.
 *
 * Requirement 2.3: Identify causal relationships using temporal analysis and domain knowledge
 */

import { Injectable, Logger } from '@nestjs/common';
import { Event, CausalChain, TemporalAnalysis } from './reasoning.interfaces';

/** Maximum lag between cause and effect to consider a causal link (ms) */
const MAX_CAUSAL_LAG_MS = 72 * 60 * 60 * 1000; // 72 hours

/** Minimum occurrences of a (cause-type, effect-type) pair to infer causality */
const MIN_OCCURRENCES = 3;

@Injectable()
export class CausalAnalysisService {
  private readonly logger = new Logger(CausalAnalysisService.name);

  /**
   * Identify causal relationships between a list of events using temporal ordering
   * and domain-knowledge heuristics.
   *
   * Requirement 2.3
   */
  async identifyCausalLinks(events: Event[]): Promise<CausalChain[]> {
    if (events.length < 2) return [];

    this.logger.log(`Analysing causal links in ${events.length} events`);

    // 1. Sort chronologically
    const sorted = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    // 2. Build (cause-type → effect-type) frequency map from event sequences
    const pairFreq = this.buildPairFrequency(sorted);

    // 3. Build candidate causal chains
    const chains: CausalChain[] = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const cause = sorted[i];

      for (let j = i + 1; j < sorted.length; j++) {
        const effect = sorted[j];

        // Skip same entity (self-causation not modelled here)
        if (cause.entityId === effect.entityId) continue;

        const lag = effect.timestamp.getTime() - cause.timestamp.getTime();
        if (lag > MAX_CAUSAL_LAG_MS) break; // Sorted, so all later pairs will also exceed

        const pairKey = `${cause.type}→${effect.type}`;
        const occurrences = pairFreq.get(pairKey) ?? 0;

        if (occurrences < MIN_OCCURRENCES) continue;

        const confidence = this.computeCausalConfidence(lag, occurrences);
        const mechanism = this.inferMechanism(cause.type, effect.type);
        const temporalEvidence = this.buildTemporalAnalysis(cause, effect, lag, occurrences);

        chains.push({
          id: `causal_${cause.id}_${effect.id}`,
          cause,
          effect,
          mechanism,
          confidence,
          temporalEvidence,
        });
      }
    }

    this.logger.log(`Identified ${chains.length} causal chains`);
    return chains;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Build a frequency map of (cause-type → effect-type) event pairs
   * that occur within MAX_CAUSAL_LAG_MS of each other.
   */
  private buildPairFrequency(sorted: Event[]): Map<string, number> {
    const freq = new Map<string, number>();

    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const lag = sorted[j].timestamp.getTime() - sorted[i].timestamp.getTime();
        if (lag > MAX_CAUSAL_LAG_MS) break;

        if (sorted[i].entityId !== sorted[j].entityId) {
          const key = `${sorted[i].type}→${sorted[j].type}`;
          freq.set(key, (freq.get(key) ?? 0) + 1);
        }
      }
    }

    return freq;
  }

  /**
   * Compute causal confidence based on:
   * - How quickly the effect follows the cause (shorter = stronger)
   * - How frequently the pair co-occurs
   */
  private computeCausalConfidence(lagMs: number, occurrences: number): number {
    // Lag decay: confidence 0.9 at 0 lag → 0.5 at MAX_CAUSAL_LAG_MS
    const lagDecay = 0.9 - (0.4 * lagMs) / MAX_CAUSAL_LAG_MS;

    // Frequency boost: log-scale capped at +0.2
    const freqBoost = Math.min(Math.log10(occurrences) * 0.15, 0.2);

    return Math.min(Math.max(lagDecay + freqBoost, 0.1), 0.97);
  }

  /**
   * Infer the causal mechanism from domain-knowledge heuristics on event types.
   */
  private inferMechanism(causeType: string, effectType: string): string {
    const c = causeType.toLowerCase();
    const e = effectType.toLowerCase();

    // Financial causation
    if (c.includes('payment') && e.includes('fulfil')) return 'Payment triggers order fulfillment';
    if (c.includes('order') && e.includes('invoice')) return 'Order creation triggers invoice generation';
    if (c.includes('invoice') && e.includes('payment')) return 'Invoice issuance precedes payment collection';
    if (c.includes('overdue') && e.includes('suspend')) return 'Overdue payment triggers account suspension';

    // HR causation
    if (c.includes('hire') && e.includes('onboard')) return 'New hire triggers onboarding workflow';
    if (c.includes('resign') && e.includes('offboard')) return 'Resignation triggers offboarding process';
    if (c.includes('promotion') && e.includes('salary')) return 'Promotion triggers salary adjustment';

    // Operations causation
    if (c.includes('stockout') && e.includes('order')) return 'Stockout triggers replenishment order';
    if (c.includes('maintenance') && e.includes('downtime')) return 'Maintenance work causes planned downtime';
    if (c.includes('error') && e.includes('alert')) return 'System error triggers alert notification';

    // Default
    return `${causeType} temporally precedes and influences ${effectType}`;
  }

  private buildTemporalAnalysis(
    cause: Event,
    effect: Event,
    lagMs: number,
    sampleSize: number,
  ): TemporalAnalysis {
    const hours = lagMs / (1000 * 60 * 60);
    const lagHumanReadable =
      hours < 1
        ? `${Math.round(hours * 60)} minutes`
        : hours < 24
        ? `${Math.round(hours)} hours`
        : `${Math.round(hours / 24)} days`;

    return {
      causeTimestamp: cause.timestamp,
      effectTimestamp: effect.timestamp,
      lagMs,
      lagHumanReadable,
      isStatisticallySignificant: sampleSize >= MIN_OCCURRENCES,
      sampleSize,
      averageLagMs: lagMs, // Simplified: single observation lag used as average
    };
  }
}
