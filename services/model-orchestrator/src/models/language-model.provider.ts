/**
 * Language Understanding Model Provider
 * 
 * Integrates language understanding models (OpenAI GPT or compatible)
 * Requirement 1.1: Language understanding model integration
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BaseModelProvider,
  ModelCapability,
  ModelInvocationRequest,
  ModelInvocationResponse,
  ModelMetadata,
} from './base-model.provider';

@Injectable()
export class LanguageModelProvider extends BaseModelProvider {
  private readonly logger = new Logger(LanguageModelProvider.name);
  protected modelId = 'gpt-4';
  protected displayName = 'GPT-4 Language Model';
  protected provider = 'openai';

  private apiKey: string | undefined;
  private apiEndpoint = 'https://api.openai.com/v1/chat/completions';

  constructor() {
    super();
    this.apiKey = process.env.OPENAI_API_KEY;
  }

  async invoke(request: ModelInvocationRequest): Promise<ModelInvocationResponse> {
    const startTime = Date.now();

    try {
      if (!this.apiKey) {
        this.logger.warn('OpenAI API key not configured, returning mock response');
        return this.getMockResponse(request, startTime);
      }

      // Real OpenAI integration
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are Ellinea AI, an enterprise intelligence assistant.',
            },
            {
              role: 'user',
              content: request.query,
            },
          ],
          temperature: request.parameters?.temperature ?? 0.7,
          max_tokens: request.parameters?.maxTokens ?? 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      return {
        result: data.choices[0].message.content,
        confidence: 0.85, // GPT-4 baseline confidence
        latencyMs,
        modelId: this.modelId,
        metadata: {
          usage: data.usage,
          finishReason: data.choices[0].finish_reason,
        },
      };
    } catch (error) {
      this.logger.error(`Language model invocation failed: ${error.message}`);
      return this.getMockResponse(request, startTime);
    }
  }

  private getMockResponse(request: ModelInvocationRequest, startTime: number): ModelInvocationResponse {
    return {
      result: `Mock language understanding response for: "${request.query.substring(0, 50)}..."`,
      confidence: 0.75,
      latencyMs: Date.now() - startTime,
      modelId: this.modelId,
      metadata: { mock: true },
    };
  }

  async checkHealth(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return false;
    }
  }

  getMetadata(): ModelMetadata {
    return {
      modelId: this.modelId,
      displayName: this.displayName,
      provider: this.provider,
      capabilities: this.getCapabilities(),
      contextWindow: 128000,
      costPerMToken: 30.0,
      isAvailable: !!this.apiKey,
    };
  }

  getCapabilities(): ModelCapability[] {
    return [
      { type: 'text', description: 'Natural language understanding and generation' },
      { type: 'code', description: 'Code generation and analysis' },
      { type: 'reasoning', description: 'Complex reasoning and problem solving' },
    ];
  }
}
