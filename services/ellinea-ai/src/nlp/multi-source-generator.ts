/**
 * Multi-Source Query Generator
 * Targets multiple System of Record connectors with optimized queries
 */

import { ParsedQuery } from './query-parser';

export interface ConnectorQuery {
  connectorId: string;
  connectorType: 'sql' | 'nosql' | 'api' | 'graphql' | 'rest' | 'webhook';
  connectorName: string;
  query: string;
  parameters?: Record<string, any>;
  expectedSchema?: Record<string, string>;
  timeout?: number;
  priority: number; // 1-10, higher = more important for answer
}

export interface MultiSourceQuery {
  originalQuery: string;
  targetConnectors: ConnectorQuery[];
  aggregationStrategy: 'union' | 'join' | 'correlation' | 'hierarchy';
  joinConditions?: Array<{
    left: { connector: string; field: string };
    right: { connector: string; field: string };
    type: 'inner' | 'left' | 'right' | 'full';
  }>;
}

interface ConnectorCapabilities {
  id: string;
  type: string;
  name: string;
  dataTypes: string[]; // What types of data this connector provides
  supportedOperations: string[]; // What operations it supports
  estimatedLatency: number; // ms
  reliability: number; // 0-1
}

export class MultiSourceQueryGenerator {
  private connectorRegistry: Map<string, ConnectorCapabilities>;

  constructor(connectors: ConnectorCapabilities[] = []) {
    this.connectorRegistry = new Map(connectors.map(c => [c.id, c]));
  }

  /**
   * Register a connector capability
   */
  registerConnector(connector: ConnectorCapabilities): void {
    this.connectorRegistry.set(connector.id, connector);
  }

  /**
   * Generate optimized queries for multiple source systems
   */
  generateMultiSourceQuery(parsedQuery: ParsedQuery): MultiSourceQuery {
    // Find relevant connectors
    const relevantConnectors = this.findRelevantConnectors(parsedQuery);

    // Generate connector-specific queries
    const connectorQueries = relevantConnectors.map(connector =>
      this.generateConnectorQuery(parsedQuery, connector),
    );

    // Sort by priority
    connectorQueries.sort((a, b) => b.priority - a.priority);

    // Determine aggregation strategy
    const aggregationStrategy = this.determineAggregationStrategy(connectorQueries, parsedQuery);

    // Generate join conditions if multiple connectors
    const joinConditions =
      connectorQueries.length > 1 ? this.generateJoinConditions(parsedQuery, connectorQueries) : [];

    return {
      originalQuery: parsedQuery.originalQuery,
      targetConnectors: connectorQueries,
      aggregationStrategy,
      joinConditions: joinConditions.length > 0 ? joinConditions : undefined,
    };
  }

  private findRelevantConnectors(query: ParsedQuery): ConnectorCapabilities[] {
    const relevant: ConnectorCapabilities[] = [];
    const scores = new Map<string, number>();

    for (const connector of this.connectorRegistry.values()) {
      let score = 0;

      // Match based on query entities and connector data types
      for (const entity of query.entities) {
        const entityTypeMap: Record<string, string> = {
          person: 'crm',
          product: 'erp',
          location: 'crm',
          metric: 'analytics',
          date: 'all',
        };
        const expectedType = entityTypeMap[entity.type];
        if (expectedType && connector.dataTypes.includes(expectedType)) {
          score += 2;
        }
      }

      // Match based on query intent
      if (query.intent.type === 'search' && connector.supportedOperations.includes('filter')) {
        score += 1.5;
      }
      if (query.intent.type === 'analysis' && connector.supportedOperations.includes('aggregate')) {
        score += 1.5;
      }
      if (query.intent.type === 'prediction' && connector.supportedOperations.includes('timeseries')) {
        score += 2;
      }

      // Boost score for reliable connectors
      score *= connector.reliability;

      // Reduce score for high latency (prefer fast connectors)
      score /= 1 + connector.estimatedLatency / 1000;

      if (score > 0) {
        scores.set(connector.id, score);
      }
    }

    // Get top 3 most relevant connectors
    const sorted = Array.from(scores.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([id]) => this.connectorRegistry.get(id)!);

    return sorted;
  }

  private generateConnectorQuery(
    parsedQuery: ParsedQuery,
    connector: ConnectorCapabilities,
  ): ConnectorQuery {
    let query = '';
    const parameters: Record<string, any> = {};

    if (connector.type === 'sql') {
      query = this.generateSqlQuery(parsedQuery, parameters);
    } else if (connector.type === 'nosql') {
      query = this.generateNoSqlQuery(parsedQuery, parameters);
    } else if (connector.type === 'api' || connector.type === 'rest') {
      query = this.generateRestQuery(parsedQuery, parameters);
    } else if (connector.type === 'graphql') {
      query = this.generateGraphQLQuery(parsedQuery, parameters);
    }

    // Determine priority based on connector relevance
    let priority = 5;
    if (connector.reliability > 0.95) priority += 2;
    if (connector.estimatedLatency < 200) priority += 1;

    return {
      connectorId: connector.id,
      connectorType: connector.type as any,
      connectorName: connector.name,
      query,
      parameters,
      timeout: 5000,
      priority,
    };
  }

  private generateSqlQuery(query: ParsedQuery, parameters: Record<string, any>): string {
    const parts: string[] = [];
    parts.push('SELECT *');

    // Add aggregation if needed
    if (query.aggregation) {
      const aggMap: Record<string, string> = {
        sum: 'SUM',
        average: 'AVG',
        count: 'COUNT',
        max: 'MAX',
        min: 'MIN',
        distinct: 'DISTINCT',
      };
      const aggFunc = aggMap[query.aggregation!] || 'COUNT';
      parts[0] = `SELECT ${aggFunc}(*) as result`;
    }

    parts.push('FROM data');

    // Add WHERE clauses for constraints
    if (query.constraints.length > 0) {
      const whereClauses: string[] = [];
      for (let i = 0; i < query.constraints.length; i++) {
        const constraint = query.constraints[i];
        const paramName = `param_${i}`;
        parameters[paramName] = constraint.value;

        const operator =
          constraint.operator === 'greater_than'
            ? '>'
            : constraint.operator === 'less_than'
              ? '<'
              : constraint.operator === 'equals'
                ? '='
                : constraint.operator === 'between'
                  ? 'BETWEEN'
                  : 'LIKE';

        if (constraint.operator === 'between' && Array.isArray(constraint.value)) {
          whereClauses.push(
            `${constraint.field} BETWEEN ${constraint.value[0]} AND ${constraint.value[1]}`,
          );
        } else {
          whereClauses.push(`${constraint.field} ${operator} $${paramName}`);
        }
      }

      if (whereClauses.length > 0) {
        parts.push(`WHERE ${whereClauses.join(' AND ')}`);
      }
    }

    // Add timeframe filter
    if (query.timeframe) {
      const tf = query.timeframe;
      if (tf.relative === 'today') {
        parts.push("AND DATE(created_at) = DATE('now')");
      } else if (tf.relative === 'this_week') {
        parts.push('AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
      } else if (tf.relative === 'this_month') {
        parts.push('AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
      } else if (tf.relative === 'last_n_days' && tf.relativeValue) {
        parts.push(
          `AND created_at >= DATE_SUB(NOW(), INTERVAL ${tf.relativeValue} DAY)`,
        );
      }
    }

    // Add sorting
    if (query.sorting) {
      parts.push(`ORDER BY ${query.sorting.field} ${query.sorting.direction.toUpperCase()}`);
    }

    return parts.join(' ');
  }

  private generateNoSqlQuery(query: ParsedQuery, parameters: Record<string, any>): string {
    const filter: Record<string, any> = {};

    // Build filter from constraints
    for (const constraint of query.constraints) {
      if (constraint.operator === 'equals') {
        filter[constraint.field] = constraint.value;
      } else if (constraint.operator === 'greater_than') {
        filter[constraint.field] = { $gt: constraint.value };
      } else if (constraint.operator === 'less_than') {
        filter[constraint.field] = { $lt: constraint.value };
      } else if (constraint.operator === 'contains') {
        filter[constraint.field] = { $regex: constraint.value };
      }
    }

    // Add timeframe
    if (query.timeframe) {
      if (query.timeframe.relative === 'today') {
        filter.created_at = {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        };
      }
    }

    parameters.filter = filter;

    if (query.aggregation) {
      const pipeline = [
        { $match: filter },
        {
          $group: {
            _id: null,
            result: { [`$${query.aggregation}`]: '$value' },
          },
        },
      ];
      parameters.pipeline = pipeline;
      return JSON.stringify(pipeline);
    }

    return JSON.stringify(filter);
  }

  private generateRestQuery(query: ParsedQuery, parameters: Record<string, any>): string {
    const params = new URLSearchParams();

    // Add search parameters
    for (const entity of query.entities.slice(0, 3)) {
      params.append('q', entity.value);
    }

    // Add filters
    for (const constraint of query.constraints.slice(0, 3)) {
      params.append(`filter[${constraint.field}]`, String(constraint.value));
    }

    // Add aggregation
    if (query.aggregation) {
      params.append('aggregate', query.aggregation);
    }

    // Add sorting
    if (query.sorting) {
      params.append('sort', `${query.sorting.field}:${query.sorting.direction}`);
    }

    parameters.queryParams = Object.fromEntries(params);

    return `/api/search?${params.toString()}`;
  }

  private generateGraphQLQuery(query: ParsedQuery, parameters: Record<string, any>): string {
    const fields: string[] = [];

    // Add fields based on entities
    if (query.entities.some(e => e.type === 'person')) {
      fields.push('person { id name email department }');
    }
    if (query.entities.some(e => e.type === 'product')) {
      fields.push('product { id name category price }');
    }
    if (query.entities.some(e => e.type === 'metric')) {
      fields.push('metrics { timestamp value unit }');
    }

    const fieldsList = fields.join(' ');
    const query_str = `query { data(filter: $filter, sort: $sort) { ${fieldsList} } }`;

    parameters.variables = {
      filter: query.constraints.reduce(
        (acc, c) => {
          acc[c.field] = c.value;
          return acc;
        },
        {} as Record<string, any>,
      ),
      sort: query.sorting
        ? { field: query.sorting.field, direction: query.sorting.direction }
        : null,
    };

    return query_str;
  }

  private determineAggregationStrategy(
    queries: ConnectorQuery[],
    query: ParsedQuery,
  ): MultiSourceQuery['aggregationStrategy'] {
    if (queries.length === 1) {
      return 'union';
    }

    // If multiple queries have join conditions, use join
    if (queries.some(q => q.connectorName.includes('CRM')) && queries.some(q => q.connectorName.includes('ERP'))) {
      return 'join';
    }

    // If querying time-series data, use correlation
    if (query.timeframe) {
      return 'correlation';
    }

    // Default to hierarchy (parent-child relationships)
    return 'hierarchy';
  }

  private generateJoinConditions(
    query: ParsedQuery,
    queries: ConnectorQuery[],
  ): Array<{
    left: { connector: string; field: string };
    right: { connector: string; field: string };
    type: 'inner' | 'left' | 'right' | 'full';
  }> {
    const conditions: Array<{
      left: { connector: string; field: string };
      right: { connector: string; field: string };
      type: 'inner' | 'left' | 'right' | 'full';
    }> = [];

    if (queries.length >= 2) {
      // Auto-detect common join patterns
      const crm = queries.find(q => q.connectorName.includes('CRM'));
      const erp = queries.find(q => q.connectorName.includes('ERP'));

      if (crm && erp) {
        conditions.push({
          left: { connector: crm.connectorId, field: 'customer_id' },
          right: { connector: erp.connectorId, field: 'customer_id' },
          type: 'inner' as const,
        });
      }
    }

    return conditions;
  }
}
