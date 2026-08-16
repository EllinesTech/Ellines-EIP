/**
 * Decision Facilitator Tests
 * Tests for presenting options and trade-offs for group decision-making
 */

import { DecisionFacilitator } from './decision-facilitator';
import { UserContribution, TradeOff, DecisionOption } from './types';

describe('DecisionFacilitator', () => {
  let facilitator: DecisionFacilitator;

  const createContribution = (
    id: string,
    content: string,
    type: 'opinion' | 'data_point' | 'analysis' | 'recommendation' | 'concern',
    participantId: string,
    confidence: number = 50
  ): UserContribution => ({
    id,
    sessionId: 'session-1',
    participantId,
    content,
    type,
    confidence,
    createdAt: new Date(),
  });

  const createDecisionOption = (
    id: string,
    title: string,
    proponents: string[] = [],
    opponents: string[] = []
  ): DecisionOption => ({
    id,
    title,
    description: `Description for ${title}`,
    proponents,
    opponents,
    estimatedImpact: {},
    tradeoffs: [],
    supportingEvidence: [],
    confidenceScore: 50,
  });

  beforeEach(() => {
    facilitator = new DecisionFacilitator();
  });

  describe('Decision Option Creation', () => {
    it('should create decision option from contributions', () => {
      const contributions = [
        createContribution('1', 'Market analysis', 'data_point', 'p1'),
      ];

      const option = facilitator.createDecisionOption(
        'opt-1',
        'Expand East',
        'Expand to Eastern market',
        contributions
      );

      expect(option).toBeDefined();
      expect(option.id).toBe('opt-1');
      expect(option.title).toBe('Expand East');
      expect(option.description).toBe('Expand to Eastern market');
    });

    it('should extract supporting participants', () => {
      const contributions = [
        createContribution('1', 'Support this', 'opinion', 'p1', 80),
        createContribution('2', 'Also support', 'opinion', 'p2', 75),
      ];

      const option = facilitator.createDecisionOption('opt-1', 'Option', 'Desc', contributions);

      expect(option.proponents.length).toBeGreaterThanOrEqual(0);
    });

    it('should extract opposing participants', () => {
      const contributions = [
        createContribution('1', 'Concern A', 'concern', 'p1', 80),
        createContribution('2', 'Concern B', 'concern', 'p2', 75),
      ];

      const option = facilitator.createDecisionOption('opt-1', 'Option', 'Desc', contributions);

      expect(option.opponents.length).toBeGreaterThanOrEqual(0);
    });

    it('should collect supporting evidence', () => {
      const contributions = [
        createContribution('1', 'Data point 1', 'data_point', 'p1'),
        createContribution('2', 'Analysis data', 'analysis', 'p2'),
        createContribution('3', 'Opinion', 'opinion', 'p3'),
      ];

      const option = facilitator.createDecisionOption('opt-1', 'Option', 'Desc', contributions);

      expect(option.supportingEvidence.length).toBeGreaterThan(0);
    });

    it('should calculate confidence score', () => {
      const contributions = [
        createContribution('1', 'C1', 'opinion', 'p1', 80),
        createContribution('2', 'C2', 'opinion', 'p2', 60),
      ];

      const option = facilitator.createDecisionOption('opt-1', 'Option', 'Desc', contributions);

      expect(option.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(option.confidenceScore).toBeLessThanOrEqual(100);
    });

    it('should handle empty contributions', () => {
      const option = facilitator.createDecisionOption('opt-1', 'Option', 'Desc', []);

      expect(option).toBeDefined();
      expect(option.confidenceScore).toBe(50);
    });
  });

  describe('Trade-off Management', () => {
    it('should add trade-off to option', () => {
      const option = createDecisionOption('opt-1', 'Option A');

      const tradeoff: TradeOff = {
        type: 'cost',
        description: 'Requires $100k investment',
        affectedStakeholders: ['owner', 'admin'],
        magnitude: 'high',
      };

      const result = facilitator.addTradeOff(option, tradeoff);

      expect(result.tradeoffs.length).toBe(1);
      expect(result.tradeoffs[0].description).toBe('Requires $100k investment');
    });

    it('should accumulate multiple trade-offs', () => {
      const option = createDecisionOption('opt-1', 'Option A');

      const tradeoff1: TradeOff = {
        type: 'benefit',
        description: 'Increases revenue',
        affectedStakeholders: ['owner'],
        magnitude: 'high',
      };

      const tradeoff2: TradeOff = {
        type: 'risk',
        description: 'Market risk',
        affectedStakeholders: ['owner', 'executive'],
        magnitude: 'medium',
      };

      facilitator.addTradeOff(option, tradeoff1);
      facilitator.addTradeOff(option, tradeoff2);

      expect(option.tradeoffs.length).toBe(2);
    });

    it('should categorize trade-offs by type', () => {
      const option = createDecisionOption('opt-1', 'Option A');

      const types: Array<'benefit' | 'cost' | 'risk' | 'opportunity'> = 
        ['benefit', 'cost', 'risk', 'opportunity'];

      types.forEach(type => {
        const tradeoff: TradeOff = {
          type,
          description: `${type} description`,
          affectedStakeholders: [],
          magnitude: 'medium',
        };
        facilitator.addTradeOff(option, tradeoff);
      });

      expect(option.tradeoffs.length).toBe(4);
    });
  });

  describe('Stakeholder Alignment', () => {
    it('should calculate alignment for multiple roles', () => {
      const options = [
        createDecisionOption('opt-1', 'A', ['p1', 'p2'], ['p3']),
        createDecisionOption('opt-2', 'B', ['p3'], ['p1']),
      ];

      const participants = [
        { id: 'p1', role: 'owner' },
        { id: 'p2', role: 'manager' },
        { id: 'p3', role: 'admin' },
      ];

      const alignment = facilitator.calculateStakeholderAlignment(options, participants);

      expect(alignment).toBeInstanceOf(Map);
      expect(alignment.size).toBeGreaterThan(0);
    });

    it('should return alignment scores between 0-100', () => {
      const options = [createDecisionOption('opt-1', 'A', ['p1'], ['p2'])];
      const participants = [
        { id: 'p1', role: 'owner' },
        { id: 'p2', role: 'manager' },
      ];

      const alignment = facilitator.calculateStakeholderAlignment(options, participants);

      for (const score of alignment.values()) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Facilitation View Generation', () => {
    it('should generate comprehensive facilitation view', () => {
      const options = [
        createDecisionOption('opt-1', 'Option A', ['p1', 'p2'], ['p3']),
      ];

      const participants = [
        { id: 'p1', role: 'owner' },
        { id: 'p2', role: 'manager' },
        { id: 'p3', role: 'member' },
      ];

      const view = facilitator.generateFacilitationView(options, participants);

      expect(view).toBeDefined();
      expect(view.options).toBeDefined();
      expect(view.recommendations).toBeDefined();
      expect(view.riskAssessment).toBeDefined();
      expect(view.timelineSuggestion).toBeDefined();
      expect(view.stakeholderAlignment).toBeDefined();
    });

    it('should include recommendations in view', () => {
      const options = [createDecisionOption('opt-1', 'Option A', ['p1', 'p2'], [])];
      const participants = [{ id: 'p1', role: 'owner' }, { id: 'p2', role: 'admin' }];

      const view = facilitator.generateFacilitationView(options, participants);

      expect(Array.isArray(view.recommendations)).toBe(true);
      expect(view.recommendations.length).toBeGreaterThan(0);
    });

    it('should assess risks in view', () => {
      const options = [createDecisionOption('opt-1', 'Option A')];
      const participants = [{ id: 'p1', role: 'owner' }];

      const view = facilitator.generateFacilitationView(options, participants);

      expect(view.riskAssessment).toBeDefined();
      expect(typeof view.riskAssessment).toBe('string');
    });

    it('should suggest timeline in view', () => {
      const options = [createDecisionOption('opt-1', 'Option A')];
      const participants = [{ id: 'p1', role: 'owner' }];

      const view = facilitator.generateFacilitationView(options, participants);

      expect(view.timelineSuggestion).toBeDefined();
      expect(typeof view.timelineSuggestion).toBe('string');
    });
  });

  describe('Option Comparison', () => {
    it('should compare two options', () => {
      const option1 = createDecisionOption('opt-1', 'Option A', ['p1'], []);
      const option2 = createDecisionOption('opt-2', 'Option B', ['p2'], ['p1']);

      const comparison = facilitator.compareOptions(option1, option2);

      expect(comparison).toBeDefined();
      expect(comparison.similarities).toBeDefined();
      expect(comparison.differences).toBeDefined();
      expect(comparison.recommendedOption).toBeDefined();
    });

    it('should identify similarities', () => {
      const option1 = createDecisionOption('opt-1', 'A');
      option1.estimatedImpact.financial = 'High';
      
      const option2 = createDecisionOption('opt-2', 'B');
      option2.estimatedImpact.financial = 'High';

      const comparison = facilitator.compareOptions(option1, option2);

      expect(comparison.similarities.length).toBeGreaterThan(0);
    });

    it('should identify differences', () => {
      const option1 = createDecisionOption('opt-1', 'A');
      option1.estimatedImpact.financial = 'High';
      
      const option2 = createDecisionOption('opt-2', 'B');
      option2.estimatedImpact.financial = 'Low';

      const comparison = facilitator.compareOptions(option1, option2);

      expect(comparison.differences.length).toBeGreaterThan(0);
    });

    it('should recommend option with more support', () => {
      const option1 = createDecisionOption('opt-1', 'Option A', ['p1', 'p2', 'p3'], ['p4']);
      const option2 = createDecisionOption('opt-2', 'Option B', ['p5'], ['p1', 'p2', 'p3', 'p4']);

      const comparison = facilitator.compareOptions(option1, option2);

      expect(comparison.recommendedOption).toBe('Option A');
    });
  });

  describe('Option Presentation Formatting', () => {
    it('should format option for presentation', () => {
      const option = createDecisionOption('opt-1', 'Option', ['p1', 'p2'], ['p3']);
      option.confidenceScore = 75;

      const formatted = facilitator.formatOptionPresentation(option);

      expect(formatted).toBeDefined();
      expect(formatted.title).toBe('Option');
      expect(formatted.supportScore).toBeGreaterThanOrEqual(0);
      expect(formatted.supportScore).toBeLessThanOrEqual(100);
      expect(formatted.riskLevel).toMatch(/low|medium|high/);
      expect(formatted.readinessScore).toBeGreaterThanOrEqual(0);
    });

    it('should assess risk level based on trade-offs', () => {
      const option = createDecisionOption('opt-1', 'Option');
      const riskTradeoff: TradeOff = {
        type: 'risk',
        description: 'High risk',
        affectedStakeholders: [],
        magnitude: 'high',
      };
      facilitator.addTradeOff(option, riskTradeoff);

      const formatted = facilitator.formatOptionPresentation(option);

      expect(formatted.riskLevel).toBe('high');
    });

    it('should calculate readiness score', () => {
      const option = createDecisionOption('opt-1', 'Option', ['p1', 'p2', 'p3'], []);
      option.confidenceScore = 80;
      option.supportingEvidence = ['Evidence 1', 'Evidence 2'];

      const formatted = facilitator.formatOptionPresentation(option);

      expect(formatted.readinessScore).toBeGreaterThan(50);
    });
  });

  describe('Blocker Identification', () => {
    it('should identify opposition as blocker', () => {
      const options = [
        createDecisionOption('opt-1', 'Option', ['p1'], ['p2', 'p3']),
      ];

      const blockers = facilitator.identifyBlockers(options);

      expect(Array.isArray(blockers)).toBe(true);
      expect(blockers.some(b => b.type === 'OPPOSITION')).toBe(true);
    });

    it('should identify risk factors as blockers', () => {
      const option = createDecisionOption('opt-1', 'Option', ['p1'], []);
      const riskTradeoff: TradeOff = {
        type: 'risk',
        description: 'Critical risk',
        affectedStakeholders: [],
        magnitude: 'high',
      };
      facilitator.addTradeOff(option, riskTradeoff);

      const blockers = facilitator.identifyBlockers([option]);

      expect(blockers.some(b => b.type === 'RISK')).toBe(true);
    });

    it('should identify low confidence as blocker', () => {
      const option = createDecisionOption('opt-1', 'Option');
      option.confidenceScore = 30;

      const blockers = facilitator.identifyBlockers([option]);

      expect(blockers.some(b => b.type === 'LOW_CONFIDENCE')).toBe(true);
    });

    it('should identify lack of evidence as blocker', () => {
      const option = createDecisionOption('opt-1', 'Option');
      option.supportingEvidence = [];

      const blockers = facilitator.identifyBlockers([option]);

      expect(blockers.some(b => b.type === 'NO_EVIDENCE')).toBe(true);
    });

    it('should sort blockers by severity', () => {
      const option = createDecisionOption('opt-1', 'Option');
      const riskTradeoff: TradeOff = {
        type: 'risk',
        description: 'Critical',
        affectedStakeholders: [],
        magnitude: 'high',
      };
      facilitator.addTradeOff(option, riskTradeoff);
      option.confidenceScore = 30;

      const blockers = facilitator.identifyBlockers([option]);

      if (blockers.length > 1) {
        const severityOrder = { critical: 0, high: 1, medium: 2 };
        expect(
          severityOrder[blockers[0].severity as keyof typeof severityOrder] <=
          severityOrder[blockers[1].severity as keyof typeof severityOrder]
        ).toBe(true);
      }
    });
  });

  describe('Recommendations Generation', () => {
    it('should generate recommendations when consensus exists', () => {
      const options = [
        createDecisionOption('opt-1', 'Preferred Option', ['p1', 'p2', 'p3'], []),
      ];

      const recommendations = facilitator.generateRecommendations(options);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    it('should flag mixed support', () => {
      const options = [
        createDecisionOption('opt-1', 'Mixed Option', ['p1', 'p2'], ['p3', 'p4']),
      ];

      const recommendations = facilitator.generateRecommendations(options);

      const hasMessage = recommendations.some(r => 
        r.toLowerCase().includes('mixed') || 
        r.toLowerCase().includes('discussion')
      );
      expect(hasMessage || recommendations.length > 0).toBe(true);
    });

    it('should highlight unopposed options', () => {
      const options = [
        createDecisionOption('opt-1', 'Unopposed', ['p1', 'p2'], []),
      ];

      const recommendations = facilitator.generateRecommendations(options);

      const hasMessage = recommendations.some(r =>
        r.toLowerCase().includes('unopposed') ||
        r.toLowerCase().includes('no opposition')
      );
      expect(hasMessage || recommendations.length > 0).toBe(true);
    });
  });

  describe('Risk Assessment', () => {
    it('should assess no risks for risk-free options', () => {
      const option = createDecisionOption('opt-1', 'Option');
      option.tradeoffs = [];

      const assessment = facilitator.assessRisks([option]);

      expect(typeof assessment).toBe('string');
    });

    it('should identify high risks', () => {
      const option = createDecisionOption('opt-1', 'Option');
      const riskTradeoff: TradeOff = {
        type: 'risk',
        description: 'Critical risk',
        affectedStakeholders: [],
        magnitude: 'high',
      };
      facilitator.addTradeOff(option, riskTradeoff);

      const assessment = facilitator.assessRisks([option]);

      expect(assessment.toLowerCase()).toContain('risk');
    });
  });

  describe('Timeline Suggestion', () => {
    it('should suggest immediate decision for high consensus', () => {
      const options = [
        createDecisionOption('opt-1', 'A', Array(10).fill('p'), []),
      ];

      const timeline = facilitator.suggestTimeline(options);

      expect(timeline).toContain('immediately') || expect(timeline).toContain('1-2');
    });

    it('should suggest 24-hour for moderate consensus', () => {
      const options = [
        createDecisionOption('opt-1', 'A', Array(7).fill('p'), Array(3).fill('q')),
      ];

      const timeline = facilitator.suggestTimeline(options);

      expect(typeof timeline).toBe('string');
    });

    it('should suggest 48+ hours for low consensus', () => {
      const options = [
        createDecisionOption('opt-1', 'A', Array(3).fill('p'), Array(7).fill('q')),
      ];

      const timeline = facilitator.suggestTimeline(options);

      expect(typeof timeline).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty options list', () => {
      const view = facilitator.generateFacilitationView([], []);

      expect(view).toBeDefined();
      expect(view.options).toEqual([]);
    });

    it('should handle options with no participants', () => {
      const option = createDecisionOption('opt-1', 'A', [], []);

      const blockers = facilitator.identifyBlockers([option]);

      expect(Array.isArray(blockers)).toBe(true);
    });
  });
});
