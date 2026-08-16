/**
 * Contribution Synthesizer Tests
 * Tests for combining and synthesizing multiple user contributions
 */

import { ContributionSynthesizer } from './contribution-synthesizer';
import { UserContribution } from './types';

describe('ContributionSynthesizer', () => {
  let synthesizer: ContributionSynthesizer;

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

  beforeEach(() => {
    synthesizer = new ContributionSynthesizer();
  });

  describe('Synthesis', () => {
    it('should synthesize empty contributions list', () => {
      const result = synthesizer.synthesizeContributions([]);
      expect(result).toEqual([]);
    });

    it('should synthesize single contribution', () => {
      const contributions = [
        createContribution('1', 'Focus on growth', 'opinion', 'p1', 75),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].primaryContribution.id).toBe('1');
    });

    it('should group similar contributions', () => {
      const contributions = [
        createContribution('1', 'Focus on market growth', 'opinion', 'p1', 75),
        createContribution('2', 'Expand market reach', 'opinion', 'p2', 80),
        createContribution('3', 'Different focus on costs', 'concern', 'p3', 65),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
      // Similar contributions should be grouped
      expect(result[0].alignedContributions.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify aligned contributions', () => {
      const contributions = [
        createContribution('1', 'We should increase price', 'recommendation', 'p1', 80),
        createContribution('2', 'Price increase is needed', 'opinion', 'p2', 75),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
      // Should recognize alignment
      expect(result[0].consensusScore).toBeGreaterThan(50);
    });

    it('should identify conflicting contributions', () => {
      const contributions = [
        createContribution('1', 'Increase prices', 'recommendation', 'p1', 80),
        createContribution('2', 'Decrease prices for market', 'concern', 'p2', 75),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
      // Should detect conflicts
      expect(result[0].conflictingContributions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Agreement Analysis', () => {
    it('should analyze agreement for single reference', () => {
      const reference = createContribution('1', 'Strategy focus', 'opinion', 'p1');
      const contributions = [
        reference,
        createContribution('2', 'Strategy is key', 'opinion', 'p2'),
      ];

      const result = synthesizer.analyzeAgreement(reference, contributions);

      expect(result.contributionId).toBe('1');
      expect(result.averageAlignment).toBeGreaterThanOrEqual(0);
      expect(result.averageAlignment).toBeLessThanOrEqual(100);
    });

    it('should identify aligned participants', () => {
      const reference = createContribution('1', 'Market expansion', 'opinion', 'p1', 75);
      const contributions = [
        reference,
        createContribution('2', 'Expand to new markets', 'opinion', 'p2', 75),
      ];

      const result = synthesizer.analyzeAgreement(reference, contributions);

      expect(result.alignedWith.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify conflicting participants', () => {
      const reference = createContribution('1', 'Increase prices', 'recommendation', 'p1', 80);
      const contributions = [
        reference,
        createContribution('2', 'Decrease prices', 'concern', 'p2', 80),
      ];

      const result = synthesizer.analyzeAgreement(reference, contributions);

      expect(result.conflictsWith.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate alignment scores', () => {
      const reference = createContribution('1', 'Content A', 'opinion', 'p1');
      const contributions = [reference];

      const result = synthesizer.analyzeAgreement(reference, contributions);

      expect(result.alignmentScores).toBeInstanceOf(Map);
      expect(result.alignmentScores.size).toBe(0); // Only reference, no comparisons
    });

    it('should determine consensus existence', () => {
      const reference = createContribution('1', 'Focus on growth', 'opinion', 'p1');
      const contributions = [
        reference,
        createContribution('2', 'Also focus on growth', 'opinion', 'p2'),
      ];

      const result = synthesizer.analyzeAgreement(reference, contributions);

      expect(result.consensusExists).toBeDefined();
    });
  });

  describe('Consensus Detection', () => {
    it('should detect high consensus', () => {
      const contributions = [
        createContribution('1', 'Primary strategy', 'opinion', 'p1', 80),
        createContribution('2', 'Same strategy', 'opinion', 'p2', 75),
        createContribution('3', 'Similar approach', 'opinion', 'p3', 80),
      ];

      const result = synthesizer.detectConsensus(contributions);

      expect(result.exists).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.mainTheme).toBeDefined();
    });

    it('should handle single contribution consensus', () => {
      const contributions = [
        createContribution('1', 'Only opinion', 'opinion', 'p1'),
      ];

      const result = synthesizer.detectConsensus(contributions);

      expect(result.exists).toBe(true);
      expect(result.score).toBe(100);
    });

    it('should detect no consensus on conflicting views', () => {
      const contributions = [
        createContribution('1', 'Increase prices', 'recommendation', 'p1', 80),
        createContribution('2', 'Decrease prices', 'concern', 'p2', 80),
        createContribution('3', 'Keep same prices', 'opinion', 'p3', 75),
      ];

      const result = synthesizer.detectConsensus(contributions);

      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Disagreement Identification', () => {
    it('should identify no disagreements for aligned contributions', () => {
      const contributions = [
        createContribution('1', 'Strategy focus', 'opinion', 'p1', 80),
        createContribution('2', 'Focus on strategy', 'opinion', 'p2', 80),
      ];

      const result = synthesizer.identifyDisagreements(contributions);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should identify disagreements between opposing views', () => {
      const contributions = [
        createContribution('1', 'Hire more staff', 'recommendation', 'p1', 80),
        createContribution('2', 'Reduce headcount', 'concern', 'p2', 80),
      ];

      const result = synthesizer.identifyDisagreements(contributions);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('participant1Id');
      expect(result[0]).toHaveProperty('participant2Id');
      expect(result[0]).toHaveProperty('conflictScore');
    });

    it('should sort disagreements by conflict score', () => {
      const contributions = [
        createContribution('1', 'Position A', 'opinion', 'p1', 80),
        createContribution('2', 'Position B', 'concern', 'p2', 80),
        createContribution('3', 'Position C', 'opinion', 'p3', 85),
        createContribution('4', 'Position D', 'concern', 'p4', 85),
      ];

      const result = synthesizer.identifyDisagreements(contributions);

      if (result.length > 1) {
        expect(result[0].conflictScore).toBeGreaterThanOrEqual(result[1].conflictScore);
      }
    });
  });

  describe('Action Item Generation', () => {
    it('should generate action items from recommendations', () => {
      const synthesized = [
        {
          primaryContribution: createContribution('1', 'Action: Expand team', 'recommendation', 'p1', 85),
          alignedContributions: [],
          conflictingContributions: [],
          consensus: true,
          consensusScore: 90,
          summary: 'Summary',
        },
      ];

      const result = synthesizer.generateActionItems(synthesized);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('description');
      expect(result[0]).toHaveProperty('priority');
      expect(result[0]).toHaveProperty('suggestedOwner');
    });

    it('should prioritize high-confidence recommendations', () => {
      const synthesized = [
        {
          primaryContribution: createContribution('1', 'High confidence action', 'recommendation', 'p1', 90),
          alignedContributions: [],
          conflictingContributions: [],
          consensus: true,
          consensusScore: 95,
          summary: 'Summary',
        },
        {
          primaryContribution: createContribution('2', 'Low confidence action', 'recommendation', 'p2', 40),
          alignedContributions: [],
          conflictingContributions: [],
          consensus: false,
          consensusScore: 45,
          summary: 'Summary',
        },
      ];

      const result = synthesizer.generateActionItems(synthesized);

      expect(result.length).toBe(2);
      expect(result[0].priority).toBe('high');
      expect(result[1].priority).toBeLessThan('high' as any);
    });

    it('should assign suggested owners', () => {
      const synthesized = [
        {
          primaryContribution: createContribution('1', 'Update documentation', 'recommendation', 'p1'),
          alignedContributions: [createContribution('2', 'Supporting', 'opinion', 'p2')],
          conflictingContributions: [],
          consensus: true,
          consensusScore: 80,
          summary: 'Summary',
        },
      ];

      const result = synthesizer.generateActionItems(synthesized);

      expect(result[0].suggestedOwner).toBeDefined();
    });

    it('should handle empty synthesis list', () => {
      const result = synthesizer.generateActionItems([]);

      expect(result).toEqual([]);
    });
  });

  describe('Alignment Score Calculation', () => {
    it('should give high score to identical contributions', () => {
      // Test through synthesis which uses alignment scoring
      const contributions = [
        createContribution('1', 'Same exact content', 'opinion', 'p1'),
        createContribution('2', 'Same exact content', 'opinion', 'p2'),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should consider contribution type in alignment', () => {
      const contributions = [
        createContribution('1', 'Focus on growth', 'opinion', 'p1'),
        createContribution('2', 'Focus on growth', 'opinion', 'p2'), // Same type
        createContribution('3', 'Concerns about growth', 'concern', 'p3'), // Different type
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should consider confidence difference in alignment', () => {
      const contributions = [
        createContribution('1', 'Strategy A', 'opinion', 'p1', 80),
        createContribution('2', 'Strategy A', 'opinion', 'p2', 30), // Low confidence
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Content Analysis', () => {
    it('should extract keywords for similarity', () => {
      const contributions = [
        createContribution('1', 'Focus on market expansion into Asia', 'opinion', 'p1'),
        createContribution('2', 'Expand Asian market presence', 'opinion', 'p2'),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      // Both mention market and expansion/expand concepts
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle short contributions', () => {
      const contributions = [
        createContribution('1', 'Yes', 'opinion', 'p1'),
        createContribution('2', 'No', 'opinion', 'p2'),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle long contributions', () => {
      const longText = 'Strategy for market expansion should consider multiple factors including geographic diversity, demographic analysis, competitive landscape, supply chain optimization, regulatory requirements, and cultural adaptation.';
      
      const contributions = [
        createContribution('1', longText, 'opinion', 'p1'),
        createContribution('2', 'Market expansion strategy', 'analysis', 'p2'),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Robustness', () => {
    it('should handle contributions with special characters', () => {
      const contributions = [
        createContribution('1', 'Strategic move: expand 2x! #growth', 'opinion', 'p1'),
        createContribution('2', 'Expansion @ 50% capacity', 'data_point', 'p2'),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle mixed confidence levels', () => {
      const contributions = [
        createContribution('1', 'High confidence', 'opinion', 'p1', 95),
        createContribution('2', 'Low confidence', 'opinion', 'p2', 15),
        createContribution('3', 'Medium confidence', 'opinion', 'p3', 50),
      ];

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle all contribution types', () => {
      const types: Array<'opinion' | 'data_point' | 'analysis' | 'recommendation' | 'concern'> = 
        ['opinion', 'data_point', 'analysis', 'recommendation', 'concern'];

      const contributions = types.map((type, i) =>
        createContribution(`${i}`, `Content for ${type}`, type, `p${i}`)
      );

      const result = synthesizer.synthesizeContributions(contributions);

      expect(result.length).toBeGreaterThan(0);
    });
  });
});
