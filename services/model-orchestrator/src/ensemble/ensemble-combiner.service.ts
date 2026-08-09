import { Injectable, Logger } from '@nestjs/common';
import {
  ModelOutput,
  ModelResults,
  UnifiedResult,
  Explanation,
  ModelDecision,
  EnsembleStrategy,
} from '../interfaces/model.interface';

/**
 * Ensemble Combiner Service
 *
 * Combines outputs from multiple models using:
 *  - weighted_vote   — weight each model's answer by its confidence × registry accuracy
 *  - meta_learning   — pick the single highest-confidence answer (simple meta-learner stub)
 *  - cascade         — use primary answer unless confidence is below threshold
 *
 * Requirements: 1.3 (combine outputs using ensemble techniques), 1.7 (resolve conflicts)
 */
@Injectable()
export class EnsembleCombinerService {
  private readonly logger = new Logger(EnsembleCombinerService.name);

  /** Minimum confidence below which we flag potential conflict */
  private readonly CONFLICT_THRESHOLD = 0.3;

  /**
   * Combine model results into a single unified answer
   */
  combine(
    results: ModelResults,
    strategy: EnsembleStrategy,
    modelAccuracies: Map<string, number>,
  ): UnifiedResult {
    this.logger.log(
      `Combining ${results.results.size} model results with strategy: ${strategy}`,
    );

    const outputs = Array.from(results.results.values());

    if (outputs.length === 0) {
      return this.buildEmptyResult('No model outputs to combine');
    }

    switch (strategy) {
      case 'weighted_vote':
        return this.weightedVote(outputs, results, modelAccuracies);
      case 'meta_learning':
        return this.metaLearning(outputs, results);
      case 'cascade':
        return this.cascade(outputs, results);
      default:
        return this.weightedVote(outputs, results, modelAccuracies);
    }
  }

  // ─── Strategies ─────────────────────────────────────────────────────────────

  /**
   * Weighted vote: weight each model's contribution by confidence × accuracy.
   * For textual answers, the model with the highest combined weight wins.
   * The final confidence is the weighted average across all models.
   */
  private weightedVote(
    outputs: ModelOutput[],
    results: ModelResults,
    modelAccuracies: Map<string, number>,
  ): UnifiedResult {
    let totalWeight = 0;
    let weightedConfidence = 0;
    let bestOutput: ModelOutput | undefined;
    let bestWeight = -1;

    const decisions: ModelDecision[] = [];

    for (const output of outputs) {
      const accuracy = modelAccuracies.get(output.modelId) ?? 0.75;
      const weight = output.confidence * accuracy;

      weightedConfidence += output.confidence * weight;
      totalWeight += weight;

      decisions.push({
        modelId: output.modelId,
        queryId: output.metadata?.['queryId'] as string ?? '',
        selected: false,
        reason: `Weight ${weight.toFixed(3)} (conf=${output.confidence.toFixed(2)}, acc=${accuracy.toFixed(2)})`,
        confidence: output.confidence,
        timestamp: new Date(),
      });

      if (weight > bestWeight) {
        bestWeight = weight;
        bestOutput = output;
      }
    }

    if (!bestOutput) {
      return this.buildEmptyResult('No output selected in weighted vote');
    }

    const finalConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 0;

    // Mark the selected model in decisions
    const updatedDecisions = decisions.map((d) => ({
      ...d,
      selected: d.modelId === bestOutput!.modelId,
    }));

    const conflictDetected = this.detectConflict(outputs);

    return {
      answer: this.extractAnswer(bestOutput),
      confidence: Math.min(finalConfidence, 0.99),
      explanation: this.buildExplanation(
        'weighted_vote',
        outputs,
        conflictDetected,
        finalConfidence,
      ),
      sources: this.extractSources(outputs),
      modelDecisions: updatedDecisions,
    };
  }

  /**
   * Meta-learning: pick the single model with the highest confidence score.
   * Simulates a trained meta-learner that knows which base model to trust.
   */
  private metaLearning(
    outputs: ModelOutput[],
    _results: ModelResults,
  ): UnifiedResult {
    const sorted = [...outputs].sort((a, b) => b.confidence - a.confidence);
    const winner = sorted[0]!;

    const decisions: ModelDecision[] = outputs.map((o) => ({
      modelId: o.modelId,
      queryId: o.metadata?.['queryId'] as string ?? '',
      selected: o.modelId === winner.modelId,
      reason: o.modelId === winner.modelId
        ? `Highest confidence (${winner.confidence.toFixed(2)})`
        : `Lower confidence (${o.confidence.toFixed(2)})`,
      confidence: o.confidence,
      timestamp: new Date(),
    }));

    return {
      answer: this.extractAnswer(winner),
      confidence: winner.confidence,
      explanation: this.buildExplanation('meta_learning', outputs, false, winner.confidence),
      sources: this.extractSources(outputs),
      modelDecisions: decisions,
    };
  }

  /**
   * Cascade: use the primary model's answer unless its confidence is below 0.5,
   * then fall through to the next-best model.
   */
  private cascade(
    outputs: ModelOutput[],
    _results: ModelResults,
  ): UnifiedResult {
    const CASCADE_THRESHOLD = 0.5;
    const sorted = [...outputs].sort((a, b) => b.confidence - a.confidence);

    const selected = sorted.find((o) => o.confidence >= CASCADE_THRESHOLD) ?? sorted[0]!;

    const decisions: ModelDecision[] = outputs.map((o) => ({
      modelId: o.modelId,
      queryId: o.metadata?.['queryId'] as string ?? '',
      selected: o.modelId === selected.modelId,
      reason: o.modelId === selected.modelId
        ? `Cascade selected (conf=${selected.confidence.toFixed(2)} >= ${CASCADE_THRESHOLD})`
        : `Cascade skipped (conf=${o.confidence.toFixed(2)})`,
      confidence: o.confidence,
      timestamp: new Date(),
    }));

    return {
      answer: this.extractAnswer(selected),
      confidence: selected.confidence,
      explanation: this.buildExplanation('cascade', outputs, false, selected.confidence),
      sources: this.extractSources(outputs),
      modelDecisions: decisions,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Extract a string answer from a ModelOutput */
  private extractAnswer(output: ModelOutput): string {
    if (typeof output.result === 'string') return output.result;
    if (output.result && typeof output.result === 'object') {
      if ('answer' in output.result) return String(output.result['answer']);
      if ('text' in output.result) return String(output.result['text']);
      return JSON.stringify(output.result);
    }
    return '';
  }

  /** Detect meaningful conflicts between model outputs (Req 1.7) */
  private detectConflict(outputs: ModelOutput[]): boolean {
    if (outputs.length < 2) return false;
    const confidences = outputs.map((o) => o.confidence);
    const max = Math.max(...confidences);
    const min = Math.min(...confidences);
    return max - min > this.CONFLICT_THRESHOLD;
  }

  /** Build explanation for the combined result */
  private buildExplanation(
    strategy: EnsembleStrategy,
    outputs: ModelOutput[],
    conflictDetected: boolean,
    finalConfidence: number,
  ): Explanation {
    const modelNames = outputs.map((o) => o.modelId).join(', ');
    const steps: string[] = [
      `Strategy: ${strategy}`,
      `Models evaluated: ${modelNames}`,
      `Final confidence: ${(finalConfidence * 100).toFixed(1)}%`,
    ];

    if (conflictDetected) {
      steps.push('⚠ Confidence divergence detected — results may be uncertain');
    }

    const factors: Record<string, number> = {};
    for (const o of outputs) {
      factors[o.modelId] = o.confidence;
    }

    return {
      reasoning: `Combined ${outputs.length} model outputs using ${strategy} ensemble`,
      steps,
      confidence: finalConfidence,
      factors,
    };
  }

  /** Extract source references from outputs */
  private extractSources(outputs: ModelOutput[]) {
    return outputs.map((o) => ({
      id: o.modelId,
      type: 'model',
      name: o.modelId,
      timestamp: new Date(),
    }));
  }

  /** Build an empty fallback result */
  private buildEmptyResult(reason: string): UnifiedResult {
    return {
      answer: '',
      confidence: 0,
      explanation: {
        reasoning: reason,
        steps: [reason],
        confidence: 0,
        factors: {},
      },
      sources: [],
      modelDecisions: [],
    };
  }
}
