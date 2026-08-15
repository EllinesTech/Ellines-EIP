/**
 * Complex Query Parser
 * Decomposes natural language queries into structured intent + entities + constraints
 */

export interface QueryIntent {
  type: 'search' | 'analysis' | 'prediction' | 'recommendation' | 'action' | 'report';
  action: string;
  confidence: number;
}

export interface Entity {
  value: string;
  type: 'person' | 'product' | 'location' | 'date' | 'metric' | 'department' | 'custom';
  confidence: number;
  sourceIndex: number;
}

export interface Constraint {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'between' | 'contains' | 'matches';
  value: string | number | [number, number];
  confidence: number;
}

export interface ParsedQuery {
  originalQuery: string;
  intent: QueryIntent;
  entities: Entity[];
  constraints: Constraint[];
  timeframe?: {
    relative?: 'today' | 'this_week' | 'this_month' | 'this_year' | 'last_n_days' | 'last_n_months';
    relativeValue?: number;
    absolute?: [Date, Date];
  };
  aggregation?: 'sum' | 'average' | 'count' | 'max' | 'min' | 'distinct';
  sorting?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  parseConfidence: number;
}

const INTENT_PATTERNS = {
  search: [
    /\b(find|get|list|show|retrieve|locate|search)/i,
    /\bwhere\b/i,
  ],
  analysis: [
    /\b(analyze|examine|review|compare|evaluate|assess)/i,
    /\b(trend|pattern|correlation|distribution)/i,
  ],
  prediction: [
    /\b(predict|forecast|expect|project|estimate)/i,
    /\b(will|might|should|could|likely)/i,
  ],
  recommendation: [
    /\b(recommend|suggest|advise|propose|should)/i,
    /\b(best|optimal|ideal)/i,
  ],
  action: [
    /\b(create|update|delete|modify|change|set|schedule)/i,
  ],
  report: [
    /\b(report|summarize|overview|dashboard|metrics|statistics|summary)/i,
  ],
};

const ENTITY_PATTERNS: Record<string, RegExp> = {
  date: /\b(today|tomorrow|yesterday|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i,
  metric: /\b(revenue|profit|margin|growth|sales|cost|expense|customer|user|order|transaction)\b/i,
  location: /\b(north|south|east|west|region|country|state|city|office|branch|location)\b/i,
  department: /\b(sales|marketing|engineering|finance|hr|operations|support|product|legal|compliance)\b/i,
};

const CONSTRAINT_PATTERNS = [
  {
    regex: /\b(greater than|more than|>|≥|>=)\s+([\d.]+)/i,
    operator: 'greater_than' as const,
  },
  {
    regex: /\b(less than|fewer than|<|≤|<=)\s+([\d.]+)/i,
    operator: 'less_than' as const,
  },
  {
    regex: /\b(between|from)\s+([\d.]+)\s+(and|to)\s+([\d.]+)/i,
    operator: 'between' as const,
  },
  {
    regex: /\b(equals|is|equals)\s+("?[\w\s]+"?)/i,
    operator: 'equals' as const,
  },
  {
    regex: /\b(contains|includes|has|with)\s+("?[\w\s]+"?)/i,
    operator: 'contains' as const,
  },
];

const AGGREGATION_PATTERNS: Record<string, RegExp> = {
  sum: /\b(sum|total|combined)\b/i,
  average: /\b(average|avg|mean)\b/i,
  count: /\b(count|how many|number of)\b/i,
  max: /\b(maximum|max|highest|top)\b/i,
  min: /\b(minimum|min|lowest)\b/i,
  distinct: /\b(unique|distinct|different)\b/i,
};

const TIMEFRAME_PATTERNS: Record<string, RegExp> = {
  today: /\btoday\b/i,
  this_week: /\b(this week|this past week)\b/i,
  this_month: /\b(this month|this past month)\b/i,
  this_year: /\b(this year|this past year|ytd|year to date)\b/i,
  last_n_days: /\blast (\d+) days?\b/i,
  last_n_months: /\blast (\d+) months?\b/i,
};

export class QueryParser {
  /**
   * Parse natural language query into structured components
   */
  parse(query: string): ParsedQuery {
    const normalizedQuery = query.toLowerCase().trim();

    // Detect intent
    const intent = this.detectIntent(normalizedQuery);

    // Extract entities
    const entities = this.extractEntities(normalizedQuery);

    // Extract constraints
    const constraints = this.extractConstraints(normalizedQuery);

    // Extract timeframe
    const timeframe = this.extractTimeframe(normalizedQuery);

    // Detect aggregation
    const aggregation = this.detectAggregation(normalizedQuery);

    // Detect sorting
    const sorting = this.detectSorting(normalizedQuery);

    // Calculate overall confidence
    const parseConfidence = this.calculateConfidence(intent, entities, constraints);

    return {
      originalQuery: query,
      intent,
      entities,
      constraints,
      timeframe,
      aggregation,
      sorting,
      parseConfidence,
    };
  }

  private detectIntent(query: string): QueryIntent {
    const scores: Record<string, number> = {};

    for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
      let matchCount = 0;
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          matchCount++;
        }
      }
      scores[type] = matchCount / patterns.length;
    }

    const topType = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];
    const type = (topType?.[0] || 'search') as QueryIntent['type'];
    const confidence = topType?.[1] || 0.5;

    const actionMatch = query.match(/\b(find|get|analyze|predict|recommend|create)\b/i);
    const action = actionMatch?.[1] || 'query';

    return { type, action, confidence };
  }

  private extractEntities(query: string): Entity[] {
    const entities: Entity[] = [];
    const seen = new Set<string>();

    // Extract date entities
    for (const [type, pattern] of Object.entries(ENTITY_PATTERNS)) {
      let match;
      const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
      while ((match = globalPattern.exec(query)) !== null) {
        const value = match[1] || match[0];
        if (!seen.has(value.toLowerCase())) {
          entities.push({
            value,
            type: type as Entity['type'],
            confidence: 0.8,
            sourceIndex: match.index,
          });
          seen.add(value.toLowerCase());
        }
      }
    }

    // Extract quoted entities
    const quotedPattern = /"([^"]+)"/g;
    let match;
    while ((match = quotedPattern.exec(query)) !== null) {
      const value = match[1];
      if (!seen.has(value.toLowerCase())) {
        entities.push({
          value,
          type: 'custom',
          confidence: 0.9,
          sourceIndex: match.index,
        });
        seen.add(value.toLowerCase());
      }
    }

    return entities.sort((a, b) => a.sourceIndex - b.sourceIndex);
  }

  private extractConstraints(query: string): Constraint[] {
    const constraints: Constraint[] = [];

    for (const pattern of CONSTRAINT_PATTERNS) {
      const match = query.match(pattern.regex);
      if (match) {
        const field = this.extractField(query, match.index);
        if (pattern.operator === 'between') {
          const value: [number, number] = [parseFloat(match[2]), parseFloat(match[4])];
          constraints.push({
            field,
            operator: pattern.operator,
            value,
            confidence: 0.85,
          });
        } else if (pattern.operator === 'greater_than' || pattern.operator === 'less_than') {
          constraints.push({
            field,
            operator: pattern.operator,
            value: parseFloat(match[2]),
            confidence: 0.85,
          });
        } else {
          constraints.push({
            field,
            operator: pattern.operator,
            value: match[2].replace(/"/g, ''),
            confidence: 0.85,
          });
        }
      }
    }

    return constraints;
  }

  private extractField(query: string, matchIndex: number | undefined): string {
    // Look for field name before the constraint
    if (matchIndex === undefined) return 'value';
    const beforeMatch = query.substring(0, matchIndex);
    const fieldMatch = beforeMatch.match(/\b([\w_]+)\s+(?:is|equals|>|<|>=|<=|between|contains)\b/i);
    return fieldMatch ? fieldMatch[1] : 'value';
  }

  private extractTimeframe(query: string): ParsedQuery['timeframe'] {
    for (const [relative, pattern] of Object.entries(TIMEFRAME_PATTERNS)) {
      const match = query.match(pattern);
      if (match) {
        if (relative === 'last_n_days' || relative === 'last_n_months') {
          const relativeValue = parseInt(match[1], 10);
          return { relative: relative as any, relativeValue };
        }
        return { relative: relative as any };
      }
    }
    return undefined;
  }

  private detectAggregation(query: string): ParsedQuery['aggregation'] {
    for (const [agg, pattern] of Object.entries(AGGREGATION_PATTERNS)) {
      if (pattern.test(query)) {
        return agg as any;
      }
    }
    return undefined;
  }

  private detectSorting(query: string): ParsedQuery['sorting'] {
    const sortMatch = query.match(/\b(sorted? by|order by|sorted?)\s+([\w_]+)\s+(ascending|descending|asc|desc)?/i);
    if (sortMatch) {
      return {
        field: sortMatch[2],
        direction: (sortMatch[3]?.toLowerCase().startsWith('desc') ? 'desc' : 'asc') as any,
      };
    }
    return undefined;
  }

  private calculateConfidence(intent: QueryIntent, entities: Entity[], constraints: Constraint[]): number {
    let confidence = intent.confidence;
    
    // Boost confidence with entities
    if (entities.length > 0) {
      confidence = Math.min(1, confidence + 0.1 * Math.min(entities.length, 3));
    }
    
    // Boost confidence with constraints
    if (constraints.length > 0) {
      confidence = Math.min(1, confidence + 0.1 * Math.min(constraints.length, 3));
    }
    
    return confidence;
  }
}
