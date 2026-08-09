import { Injectable, Logger } from '@nestjs/common';
import { Query, QueryType, ModelCapability } from '../interfaces/query.interface';

/**
 * Query classification result
 */
export interface QueryClassification {
  type: QueryType;
  confidence: number;
  requiredCapabilities: ModelCapability[];
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * Query Analyzer Service
 * Classifies incoming queries to determine appropriate model routing
 */
@Injectable()
export class QueryAnalyzerService {
  private readonly logger = new Logger(QueryAnalyzerService.name);

  /**
   * Analyze and classify a query
   */
  async analyzeQuery(query: Query): Promise<QueryClassification> {
    this.logger.log(`Analyzing query: ${query.id}`);

    const content = query.content.toLowerCase();
    
    // Determine query type
    const type = this.classifyQueryType(content, query);
    
    // Determine required capabilities
    const requiredCapabilities = this.determineCapabilities(content, type, query);
    
    // Determine complexity
    const complexity = this.assessComplexity(content, query);
    
    // Calculate confidence
    const confidence = this.calculateConfidence(type, requiredCapabilities);

    const classification: QueryClassification = {
      type,
      confidence,
      requiredCapabilities,
      complexity,
    };

    this.logger.log(`Query classified as ${type} with ${confidence}% confidence`);
    
    return classification;
  }

  /**
   * Classify query type based on content
   */
  private classifyQueryType(content: string, query: Query): QueryType {
    // If type is already provided, use it
    if (query.type) {
      return query.type;
    }

    // Time-series indicators
    const timeSeriesKeywords = [
      'forecast', 'predict', 'trend', 'future', 'projection',
      'next month', 'next quarter', 'next year', 'will be',
      'expect', 'anticipate', 'timeline'
    ];

    // Anomaly detection indicators
    const anomalyKeywords = [
      'anomaly', 'unusual', 'outlier', 'abnormal', 'irregular',
      'suspicious', 'deviation', 'spike', 'drop', 'unexpected'
    ];

    // Vision indicators
    const visionKeywords = [
      'image', 'photo', 'picture', 'visual', 'diagram',
      'chart', 'graph', 'scan', 'screenshot', 'document image'
    ];

    // Reasoning indicators
    const reasoningKeywords = [
      'why', 'how', 'explain', 'reason', 'cause',
      'relationship', 'connection', 'impact', 'because',
      'analyze', 'compare', 'evaluate', 'deduce'
    ];

    // Check for time-series patterns
    if (timeSeriesKeywords.some(keyword => content.includes(keyword))) {
      return 'time-series';
    }

    // Check for anomaly detection
    if (anomalyKeywords.some(keyword => content.includes(keyword))) {
      return 'anomaly';
    }

    // Check for vision
    if (visionKeywords.some(keyword => content.includes(keyword))) {
      return 'vision';
    }

    // Check for reasoning
    if (reasoningKeywords.some(keyword => content.includes(keyword))) {
      return 'reasoning';
    }

    // Check for hybrid (multiple types)
    const typeCount = [
      timeSeriesKeywords.some(k => content.includes(k)),
      anomalyKeywords.some(k => content.includes(k)),
      visionKeywords.some(k => content.includes(k)),
      reasoningKeywords.some(k => content.includes(k))
    ].filter(Boolean).length;

    if (typeCount > 1) {
      return 'hybrid';
    }

    // Default to text understanding
    return 'text';
  }

  /**
   * Determine required model capabilities
   */
  private determineCapabilities(
    content: string,
    type: QueryType,
    query: Query
  ): ModelCapability[] {
    const capabilities: ModelCapability[] = [];

    // If capabilities are already specified, use them
    if (query.requiredCapabilities && query.requiredCapabilities.length > 0) {
      return query.requiredCapabilities;
    }

    // Map query types to capabilities
    switch (type) {
      case 'text':
        capabilities.push('language_understanding');
        break;
      case 'time-series':
        capabilities.push('time_series_forecasting');
        break;
      case 'anomaly':
        capabilities.push('anomaly_detection');
        break;
      case 'vision':
        capabilities.push('computer_vision');
        break;
      case 'reasoning':
        capabilities.push('knowledge_reasoning', 'causal_analysis');
        break;
      case 'hybrid':
        // Hybrid queries may need multiple capabilities
        capabilities.push('language_understanding', 'knowledge_reasoning');
        break;
    }

    // Check for pattern detection needs
    if (content.includes('pattern') || content.includes('trend') || content.includes('recurring')) {
      capabilities.push('pattern_detection');
    }

    // Check for causal analysis needs
    if (content.includes('cause') || content.includes('because') || content.includes('impact')) {
      if (!capabilities.includes('causal_analysis')) {
        capabilities.push('causal_analysis');
      }
    }

    return capabilities;
  }

  /**
   * Assess query complexity
   */
  private assessComplexity(content: string, query: Query): 'simple' | 'moderate' | 'complex' {
    // Word count
    const wordCount = content.split(/\s+/).length;
    
    // Question count (multiple questions)
    const questionCount = (content.match(/\?/g) || []).length;
    
    // Complexity indicators
    const complexKeywords = [
      'compare', 'contrast', 'analyze', 'evaluate', 'synthesize',
      'multi-step', 'comprehensive', 'detailed', 'across'
    ];
    
    const hasComplexKeywords = complexKeywords.some(keyword => content.includes(keyword));
    
    // Multiple capabilities required
    const capabilityCount = query.requiredCapabilities?.length || 0;

    if (wordCount > 50 || questionCount > 2 || capabilityCount > 2 || hasComplexKeywords) {
      return 'complex';
    } else if (wordCount > 20 || questionCount > 1 || capabilityCount > 1) {
      return 'moderate';
    } else {
      return 'simple';
    }
  }

  /**
   * Calculate confidence in classification
   */
  private calculateConfidence(type: QueryType, capabilities: ModelCapability[]): number {
    // Base confidence
    let confidence = 70;

    // Increase confidence if specific capabilities are identified
    if (capabilities.length > 0) {
      confidence += capabilities.length * 5;
    }

    // Increase confidence for non-hybrid types (more specific)
    if (type !== 'hybrid' && type !== 'text') {
      confidence += 10;
    }

    // Cap at 95
    return Math.min(confidence, 95);
  }
}
