/**
 * Knowledge Reasoning Model Provider
 * 
 * Performs logical reasoning over knowledge graphs and structured data
 * Requirement 1.8: Knowledge reasoning capability
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BaseModelProvider,
  ModelCapability,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ModelMetadata,
} from './base-model.provider';

interface ReasoningChain {
  steps: ReasoningStep[];
  conclusion: string;
  confidence: number;
}

interface ReasoningStep {
  stepNumber: number;
  operation: 'premise' | 'inference' | 'lookup' | 'conclusion';
  description: string;
  evidence: string[];
}

@Injectable()
export class ReasoningModelProvider extends BaseModelProvider {
  private readonly logger = new Logger(ReasoningModelProvider.name);
  protected modelId = 'reasoning-engine-v1';
  protected displayName = 'Knowledge Reasoning Model';
  protected provider = 'ellines-internal';

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse> {
    const startTime = Date.now();

    try {
      const { premises, query } = request.parameters ?? {};

      if (!premises || !Array.isArray(premises)) {
        throw new Error('Premises are required for reasoning');
      }

      // Perform logical reasoning
      const reasoningChain = this.performReasoning(premises, query ?? request.query);
      const latencyMs = Date.now() - startTime;

      return {
        result: reasoningChain,
        confidence: reasoningChain.confidence,
        latencyMs,
        modelId: this.modelId,
        metadata: {
          premiseCount: premises.length,
          stepCount: reasoningChain.steps.length,
        },
      };
    } catch (error) {
      this.logger.error(`Reasoning failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Perform logical reasoning over premises
   * Simplified rule-based reasoning engine
   */
  private performReasoning(premises: string[], query: string): ReasoningChain {
    const steps: ReasoningStep[] = [];
    let stepNumber = 1;

    // Step 1: Load premises
    steps.push({
      stepNumber: stepNumber++,
      operation: 'premise',
      description: 'Loaded knowledge base premises',
      evidence: premises,
    });

    // Step 2: Identify relevant premises
    const relevantPremises = premises.filter((p) => 
      this.calculateRelevance(p, query) > 0.5
    );

    if (relevantPremises.length > 0) {
      steps.push({
        stepNumber: stepNumber++,
        operation: 'lookup',
        description: 'Identified relevant premises for query',
        evidence: relevantPremises,
      });
    }

    // Step 3: Perform inference
    const inference = this.makeInference(relevantPremises, query);
    steps.push({
      stepNumber: stepNumber++,
      operation: 'inference',
      description: inference.description,
      evidence: inference.evidence,
    });

    // Step 4: Draw conclusion
    const conclusion = inference.conclusion;
    steps.push({
      stepNumber: stepNumber++,
      operation: 'conclusion',
      description: 'Reached final conclusion',
      evidence: [conclusion],
    });

    return {
      steps,
      conclusion,
      confidence: inference.confidence,
    };
  }

  /**
   * Calculate relevance score between premise and query
   */
  private calculateRelevance(premise: string, query: string): number {
    const premiseWords = premise.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    const matches = queryWords.filter((word) => 
      premiseWords.some((pWord) => pWord.includes(word) || word.includes(pWord))
    );

    return matches.length / queryWords.length;
  }

  /**
   * Make inference from premises
   */
  private makeInference(premises: string[], query: string): {
    description: string;
    conclusion: string;
    confidence: number;
    evidence: string[];
  } {
    if (premises.length === 0) {
      return {
        description: 'Insufficient premises for strong inference',
        conclusion: `Unable to definitively answer: ${query}`,
        confidence: 0.3,
        evidence: ['No matching premises found'],
      };
    }

    // Simple pattern matching for common reasoning patterns
    if (query.toLowerCase().includes('cause')) {
      return {
        description: 'Identified causal relationships from premises',
        conclusion: `Based on available evidence: ${premises[0]}`,
        confidence: 0.75,
        evidence: premises.slice(0, 2),
      };
    }

    if (query.toLowerCase().includes('relationship') || query.toLowerCase().includes('connect')) {
      return {
        description: 'Analyzed relationships between entities',
        conclusion: `Connection found: ${premises.slice(0, 2).join(' → ')}`,
        confidence: 0.80,
        evidence: premises.slice(0, 3),
      };
    }

    // Default inference
    return {
      description: 'Applied logical reasoning to premises',
      conclusion: `Based on ${premises.length} relevant fact(s): ${premises[0]}`,
      confidence: Math.min(0.70 + (premises.length * 0.05), 0.95),
      evidence: premises,
    };
  }

  async checkHealth(): Promise<boolean> {
    // Internal model, always available
    return true;
  }

  getMetadata(): ModelMetadata {
    return {
      modelId: this.modelId,
      displayName: this.displayName,
      provider: this.provider,
      capabilities: this.getCapabilities(),
      isAvailable: true,
    };
  }

  getCapabilities(): ModelCapability[] {
    return [
      { type: 'reasoning', description: 'Logical reasoning over knowledge bases and premises' },
    ];
  }
}
