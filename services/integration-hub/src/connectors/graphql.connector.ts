/**
 * GraphQL Connector
 * Requirement 22.1: GraphQL connector type
 */

import { Injectable, Logger } from '@nestjs/common';

export interface GraphQLConnectorConfig {
  endpoint: string;
  headers?: Record<string, string>;
  authToken?: string;
  introspectionEnabled?: boolean;
}

export interface GraphQLQueryResult {
  data: any;
  errors?: Array<{ message: string; locations?: any[] }>;
  latencyMs: number;
}

@Injectable()
export class GraphQLConnector {
  private readonly logger = new Logger(GraphQLConnector.name);

  async query(
    config: GraphQLConnectorConfig,
    query: string,
    variables?: Record<string, any>,
  ): Promise<GraphQLQueryResult> {
    const startTime = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (config.authToken) {
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    return { data: body.data, errors: body.errors, latencyMs: Date.now() - startTime };
  }

  async introspect(config: GraphQLConnectorConfig): Promise<any> {
    const introspectionQuery = `
      query IntrospectionQuery {
        __schema {
          types { name kind description fields { name type { name kind } } }
        }
      }
    `;
    const result = await this.query(config, introspectionQuery);
    return result.data?.__schema;
  }

  async testConnection(config: GraphQLConnectorConfig): Promise<boolean> {
    try {
      await this.query(config, '{ __typename }');
      return true;
    } catch {
      return false;
    }
  }
}
