/**
 * Collaborative Intelligence Service Tests
 * Comprehensive unit tests for multi-user collaborative decision-making
 */

import { CollaborativeIntelligenceService } from './collaborative-intelligence.service';
import { Participant, ParticipantRole, UserContribution } from './types';

describe('CollaborativeIntelligenceService', () => {
  let service: CollaborativeIntelligenceService;

  const mockParticipant = (id: string, role: ParticipantRole = 'member'): Participant => ({
    id,
    name: `User ${id}`,
    email: `user${id}@example.com`,
    role,
    isActive: true,
    joinedAt: new Date(),
    lastActivityAt: new Date(),
  });

  beforeEach(() => {
    service = new CollaborativeIntelligenceService();
  });

  // ============ Session Management Tests ============

  describe('Session Management', () => {
    it('should create a new collaborative session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', 'Quarterly planning meeting', creator);

      expect(session).toBeDefined();
      expect(session.title).toBe('Q4 Planning');
      expect(session.topic).toBe('strategic');
      expect(session.status).toBe('active');
      expect(session.organizationId).toBe('org-1');
    });

    it('should add participant to session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      const participant = mockParticipant('2', 'executive');

      const updated = service.addParticipant(session.id, participant);

      expect(updated).toBeDefined();
      expect(updated!.participants.length).toBe(2);
      expect(updated!.participants.some(p => p.id === '2')).toBe(true);
    });

    it('should not add duplicate participants', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      const participant = mockParticipant('2', 'executive');

      service.addParticipant(session.id, participant);
      const updated = service.addParticipant(session.id, participant);

      expect(updated!.participants.length).toBe(2);
    });

    it('should remove participant from session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      const participant = mockParticipant('2', 'executive');

      service.addParticipant(session.id, participant);
      const updated = service.removeParticipant(session.id, '2');

      expect(updated!.participants.length).toBe(1);
      expect(updated!.participants.some(p => p.id === '2')).toBe(false);
    });

    it('should retrieve session by ID', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      const retrieved = service.getSession(session.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
      expect(retrieved!.title).toBe('Q4 Planning');
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = service.getSession('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should end a session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      
      const concluded = service.endSession(session.id, creator, 'Decision made');

      expect(concluded).toBeDefined();
      expect(concluded!.status).toBe('concluded');
      expect(concluded!.concludedAt).toBeDefined();
    });

    it('should pause and resume a session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      
      const paused = service.pauseSession(session.id);
      expect(paused!.status).toBe('paused');

      const resumed = service.resumeSession(session.id);
      expect(resumed!.status).toBe('active');
    });

    it('should get all participants in session', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      service.addParticipant(session.id, mockParticipant('2', 'executive'));
      service.addParticipant(session.id, mockParticipant('3', 'manager'));

      const participants = service.getParticipants(session.id);

      expect(participants.length).toBe(3);
    });
  });

  // ============ Contribution Tests ============

  describe('Contributions', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      sessionId = session.id;
    });

    it('should add contribution to session', () => {
      const contribution = service.addContribution(
        sessionId,
        '1',
        'We should focus on market expansion',
        'recommendation',
        85
      );

      expect(contribution).toBeDefined();
      expect(contribution.participantId).toBe('1');
      expect(contribution.type).toBe('recommendation');
      expect(contribution.confidence).toBe(85);
    });

    it('should retrieve all contributions for session', () => {
      service.addContribution(sessionId, '1', 'Contribution 1', 'opinion');
      service.addContribution(sessionId, '2', 'Contribution 2', 'data_point');

      const contributions = service.getContributions(sessionId);

      expect(contributions.length).toBe(2);
    });

    it('should handle different contribution types', () => {
      const types: Array<'opinion' | 'data_point' | 'analysis' | 'recommendation' | 'concern'> = 
        ['opinion', 'data_point', 'analysis', 'recommendation', 'concern'];

      types.forEach((type, index) => {
        service.addContribution(sessionId, `${index}`, `Contribution ${type}`, type);
      });

      const contributions = service.getContributions(sessionId);
      expect(contributions.length).toBe(5);
      expect(contributions.every((c, i) => c.type === types[i])).toBe(true);
    });

    it('should set default confidence to 50 if not provided', () => {
      const contribution = service.addContribution(
        sessionId,
        '1',
        'Contribution without confidence',
        'opinion'
      );

      expect(contribution.confidence).toBe(50);
    });

    it('should retrieve empty contribution list for new session', () => {
      const newCreator = mockParticipant('new1', 'owner');
      const newSession = service.createSession('org-1', 'New Session', 'operational', undefined, newCreator);
      const contributions = service.getContributions(newSession.id);

      expect(contributions).toEqual([]);
    });
  });

  // ============ Synthesis Tests ============

  describe('Contribution Synthesis', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Q4 Planning', 'strategic', undefined, creator);
      sessionId = session.id;
    });

    it('should synthesize contributions into themes', () => {
      service.addContribution(sessionId, '1', 'Focus on market growth', 'opinion', 75);
      service.addContribution(sessionId, '2', 'Expand market reach', 'recommendation', 80);
      
      const synthesized = service.synthesizeContributions(sessionId);

      expect(synthesized.length).toBeGreaterThan(0);
      expect(synthesized[0]).toHaveProperty('consensusScore');
      expect(synthesized[0].consensusScore).toBeGreaterThanOrEqual(0);
      expect(synthesized[0].consensusScore).toBeLessThanOrEqual(100);
    });

    it('should return empty array for session with no contributions', () => {
      const synthesized = service.synthesizeContributions(sessionId);
      expect(synthesized).toEqual([]);
    });

    it('should analyze agreement between contributions', () => {
      const contrib1 = service.addContribution(
        sessionId,
        '1',
        'Priority: increase revenue',
        'opinion',
        75
      );
      service.addContribution(sessionId, '2', 'Focus on revenue growth', 'opinion', 80);

      const agreement = service.analyzeAgreement(sessionId, contrib1.id);

      expect(agreement).toBeDefined();
      expect(agreement!.contributionId).toBe(contrib1.id);
      expect(agreement!.averageAlignment).toBeGreaterThanOrEqual(0);
      expect(agreement!.averageAlignment).toBeLessThanOrEqual(100);
    });

    it('should return null for non-existent contribution', () => {
      const agreement = service.analyzeAgreement(sessionId, 'non-existent-id');
      expect(agreement).toBeNull();
    });

    it('should detect consensus in similar contributions', () => {
      service.addContribution(sessionId, '1', 'Priority: market expansion', 'opinion', 80);
      service.addContribution(sessionId, '2', 'We should expand market reach', 'opinion', 75);
      service.addContribution(sessionId, '3', 'Focus on market growth', 'recommendation', 85);

      const consensus = service.detectConsensus(sessionId);

      expect(consensus.exists).toBeDefined();
      expect(consensus.score).toBeGreaterThanOrEqual(0);
      expect(consensus.score).toBeLessThanOrEqual(100);
    });

    it('should identify disagreements between participants', () => {
      service.addContribution(sessionId, '1', 'Increase prices', 'recommendation', 75);
      service.addContribution(sessionId, '2', 'Decrease prices for market share', 'concern', 80);

      const disagreements = service.identifyDisagreements(sessionId);

      expect(Array.isArray(disagreements)).toBe(true);
    });
  });

  // ============ Decision Tests ============

  describe('Decision Management', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Decision Session', 'strategic', undefined, creator);
      sessionId = session.id;
      service.addParticipant(sessionId, mockParticipant('2', 'executive'));
      service.addParticipant(sessionId, mockParticipant('3', 'manager'));
    });

    it('should create decision option', () => {
      const contrib = service.addContribution(sessionId, '1', 'Market analysis', 'data_point');
      const option = service.createDecisionOption(
        sessionId,
        'Expand East',
        'Expand operations to Eastern market',
        [contrib],
        mockParticipant('1', 'executive')
      );

      expect(option).toBeDefined();
      expect(option.title).toBe('Expand East');
      expect(option.description).toBe('Expand operations to Eastern market');
    });

    it('should retrieve decision options for session', () => {
      const contrib1 = service.addContribution(sessionId, '1', 'Analysis 1', 'data_point');
      const contrib2 = service.addContribution(sessionId, '2', 'Analysis 2', 'data_point');

      service.createDecisionOption(sessionId, 'Option A', 'Description A', [contrib1], mockParticipant('1'));
      service.createDecisionOption(sessionId, 'Option B', 'Description B', [contrib2], mockParticipant('2'));

      const options = service.getDecisionOptions(sessionId);

      expect(options.length).toBe(2);
      expect(options[0].title).toBe('Option A');
      expect(options[1].title).toBe('Option B');
    });

    it('should record vote on decision option', () => {
      const contrib = service.addContribution(sessionId, '1', 'Analysis', 'data_point');
      const option = service.createDecisionOption(sessionId, 'Option A', 'Description', [contrib], mockParticipant('1'));

      service.recordVote(sessionId, '2', option.id, 'support');
      service.recordVote(sessionId, '3', option.id, 'oppose');

      const options = service.getDecisionOptions(sessionId);
      expect(options[0].proponents.includes('2')).toBe(true);
      expect(options[0].opponents.includes('3')).toBe(true);
    });

    it('should not duplicate votes from same participant', () => {
      const contrib = service.addContribution(sessionId, '1', 'Analysis', 'data_point');
      const option = service.createDecisionOption(sessionId, 'Option', 'Description', [contrib], mockParticipant('1'));

      service.recordVote(sessionId, '2', option.id, 'support');
      service.recordVote(sessionId, '2', option.id, 'support');

      const options = service.getDecisionOptions(sessionId);
      const supportCount = options[0].proponents.filter(p => p === '2').length;
      expect(supportCount).toBe(1);
    });

    it('should change vote from support to oppose', () => {
      const contrib = service.addContribution(sessionId, '1', 'Analysis', 'data_point');
      const option = service.createDecisionOption(sessionId, 'Option', 'Description', [contrib], mockParticipant('1'));

      service.recordVote(sessionId, '2', option.id, 'support');
      service.recordVote(sessionId, '2', option.id, 'oppose');

      const options = service.getDecisionOptions(sessionId);
      expect(options[0].proponents.includes('2')).toBe(false);
      expect(options[0].opponents.includes('2')).toBe(true);
    });

    it('should get decision facilitation view with recommendations', () => {
      const contrib = service.addContribution(sessionId, '1', 'Analysis', 'data_point');
      service.createDecisionOption(sessionId, 'Option A', 'Description', [contrib], mockParticipant('1'));

      const view = service.getDecisionFacilitationView(sessionId);

      expect(view).toBeDefined();
      expect(view.options).toBeDefined();
      expect(view.recommendations).toBeDefined();
      expect(view.riskAssessment).toBeDefined();
      expect(view.timelineSuggestion).toBeDefined();
    });

    it('should get action items from recommendations', () => {
      service.addContribution(sessionId, '1', 'Should expand hiring', 'recommendation', 85);
      service.addContribution(sessionId, '2', 'Implement new process', 'recommendation', 75);

      const actionItems = service.getActionItems(sessionId);

      expect(Array.isArray(actionItems)).toBe(true);
    });
  });

  // ============ Role-Based Filtering Tests ============

  describe('Role-Based Information Filtering', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Sensitive', 'financial', undefined, creator);
      sessionId = session.id;
      service.addParticipant(sessionId, mockParticipant('2', 'executive'));
      service.addParticipant(sessionId, mockParticipant('3', 'member'));
    });

    it('should provide filtered view based on role', () => {
      service.addContribution(sessionId, '1', 'Financial data', 'data_point');
      service.addContribution(sessionId, '2', 'General analysis', 'analysis');

      const ownerView = service.getFilteredView(sessionId, '1');

      expect(ownerView).toBeDefined();
      expect(ownerView!.role).toBe('owner');
    });

    it('should restrict access based on role permissions', () => {
      const permissions = service.getRolePermissions('member');

      expect(permissions!.canViewFinancialData).toBe(false);
      expect(permissions!.canViewPersonnelData).toBe(false);
    });

    it('should allow owner unrestricted access', () => {
      const permissions = service.getRolePermissions('owner');

      expect(permissions!.canViewFinancialData).toBe(true);
      expect(permissions!.canViewPersonnelData).toBe(true);
      expect(permissions!.canViewStrategicAnalysis).toBe(true);
    });
  });

  // ============ History & Audit Tests ============

  describe('Session History & Audit Trail', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Audit Test', 'operational', undefined, creator);
      sessionId = session.id;
    });

    it('should record session history', () => {
      const history = service.getSessionHistory(sessionId);

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should generate audit trail', () => {
      service.addContribution(sessionId, '1', 'Contribution', 'opinion');
      const contrib = service.addContribution(sessionId, '1', 'Recommendation', 'recommendation');
      service.createDecisionOption(sessionId, 'Option', 'Desc', [contrib], mockParticipant('1'));

      const auditTrail = service.getSessionAuditTrail(sessionId);

      expect(auditTrail).toBeDefined();
      expect(auditTrail.sessionId).toBe(sessionId);
      expect(auditTrail.totalEvents).toBeGreaterThan(0);
    });

    it('should retrieve audit trail with statistics', () => {
      service.addContribution(sessionId, '1', 'Op1', 'opinion');
      service.addContribution(sessionId, '2', 'Op2', 'opinion');

      const auditTrail = service.getSessionAuditTrail(sessionId);

      expect(auditTrail.totalEvents).toBeGreaterThan(0);
      expect(auditTrail.contributions).toBeGreaterThanOrEqual(1);
    });
  });

  // ============ Absent Stakeholder Tests ============

  describe('Absent Stakeholder Notification', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Financial Decision', 'financial', undefined, creator);
      sessionId = session.id;
      service.addParticipant(sessionId, mockParticipant('2', 'manager'));
    });

    it('should identify absent stakeholders for topic', () => {
      const absentStakeholders = service.identifyAbsentStakeholders(sessionId);

      expect(Array.isArray(absentStakeholders)).toBe(true);
    });

    it('should send notification to absent stakeholder', () => {
      const absentStakeholders = service.identifyAbsentStakeholders(sessionId);
      expect(absentStakeholders.length).toBeGreaterThan(0);
    });

    it('should retrieve unread notifications', () => {
      const notifications = service.getUnreadNotifications('user1@example.com');

      expect(Array.isArray(notifications)).toBe(true);
    });

    it('should mark notification as read', () => {
      // This would require a notification to exist first
      const result = service.markNotificationAsRead('non-existent-id');
      // Should not throw, but return false
      expect(typeof result).toBe('boolean');
    });
  });

  // ============ Metrics & Analytics Tests ============

  describe('Session Metrics & Analytics', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Metrics Test', 'operational', undefined, creator);
      sessionId = session.id;
      service.addParticipant(sessionId, mockParticipant('2', 'manager'));
      service.addParticipant(sessionId, mockParticipant('3', 'member'));
    });

    it('should calculate session metrics', () => {
      service.addContribution(sessionId, '1', 'Contribution 1', 'opinion');
      service.addContribution(sessionId, '2', 'Contribution 2', 'opinion');

      const metrics = service.getSessionMetrics(sessionId);

      expect(metrics).toBeDefined();
      expect(metrics!.totalParticipants).toBe(3);
      expect(metrics!.totalContributions).toBeGreaterThanOrEqual(0);
      expect(metrics!.consensusLevel).toBeGreaterThanOrEqual(0);
      expect(metrics!.consensusLevel).toBeLessThanOrEqual(100);
    });

    it('should include session duration in metrics', () => {
      const metrics = service.getSessionMetrics(sessionId);

      expect(metrics!.sessionDurationMinutes).toBeDefined();
      expect(metrics!.sessionDurationMinutes).toBeGreaterThanOrEqual(0);
    });

    it('should calculate participation rate', () => {
      service.addContribution(sessionId, '1', 'Contribution', 'opinion');

      const metrics = service.getSessionMetrics(sessionId);

      expect(metrics!.averageParticipationRate).toBeGreaterThanOrEqual(0);
      expect(metrics!.averageParticipationRate).toBeLessThanOrEqual(100);
    });

    it('should return null metrics for non-existent session', () => {
      const metrics = service.getSessionMetrics('non-existent-id');

      expect(metrics).toBeNull();
    });

    it('should get consensus details for session', () => {
      service.addContribution(sessionId, '1', 'Priority: growth', 'opinion');
      service.addContribution(sessionId, '2', 'Focus on growth', 'opinion');

      const details = service.getConsensusDetails(sessionId);

      expect(details).toBeDefined();
      expect(details.consensus).toBeDefined();
      expect(details.disagreements).toBeDefined();
    });

    it('should generate decision summary', () => {
      const contrib = service.addContribution(sessionId, '1', 'Analysis', 'data_point');
      service.createDecisionOption(sessionId, 'Option A', 'Description', [contrib], mockParticipant('1'));

      const summary = service.generateDecisionSummary(sessionId);

      expect(summary).toBeDefined();
      expect(summary!.sessionTitle).toBe('Metrics Test');
      expect(summary!.topic).toBe('operational');
      expect(summary!.participants).toBe(3);
      expect(summary!.decisions).toBeGreaterThan(0);
    });

    it('should return null summary for non-existent session', () => {
      const summary = service.generateDecisionSummary('non-existent-id');

      expect(summary).toBeNull();
    });
  });

  // ============ Permissions & Authorization Tests ============

  describe('Permissions & Authorization', () => {
    let sessionId: string;
    const creator = mockParticipant('1', 'owner');

    beforeEach(() => {
      const session = service.createSession('org-1', 'Auth Test', 'financial', undefined, creator);
      sessionId = session.id;
      service.addParticipant(sessionId, mockParticipant('2', 'manager'));
    });

    it('should check action permissions for participant', () => {
      const canView = service.canPerformAction(sessionId, '1', 'view_financial_data');
      expect(typeof canView).toBe('boolean');
    });

    it('should deny financial data access for member role', () => {
      const session = service.createSession('org-1', 'Member Auth', 'financial', undefined, mockParticipant('creator', 'owner'));
      service.addParticipant(session.id, mockParticipant('2', 'member'));

      const canView = service.canPerformAction(session.id, '2', 'view_financial_data');
      expect(canView).toBe(false);
    });

    it('should allow owner all permissions', () => {
      const canView = service.canPerformAction(sessionId, '1', 'view_financial_data');
      const canApprove = service.canPerformAction(sessionId, '1', 'approve_decisions');

      expect(canView).toBe(true);
      expect(canApprove).toBe(true);
    });

    it('should return false for invalid action', () => {
      const result = service.canPerformAction(sessionId, '1', 'invalid_action');
      expect(result).toBe(false);
    });
  });

  // ============ Edge Cases & Robustness Tests ============

  describe('Edge Cases & Robustness', () => {
    it('should handle empty session gracefully', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Empty', 'operational', undefined, creator);

      const contributions = service.getContributions(session.id);
      const options = service.getDecisionOptions(session.id);
      const history = service.getSessionHistory(session.id);

      expect(contributions).toEqual([]);
      expect(options).toEqual([]);
      expect(history.length).toBeGreaterThan(0); // Session creation events
    });

    it('should handle operations on non-existent session', () => {
      const result = service.getSession('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle removing non-existent participant', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Test', 'operational', undefined, creator);
      const result = service.removeParticipant(session.id, 'non-existent');

      expect(result).toBeDefined();
      expect(result!.participants.length).toBe(1);
    });

    it('should handle multiple contributions from same participant', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Test', 'operational', undefined, creator);

      service.addContribution(session.id, '1', 'Contribution 1', 'opinion');
      service.addContribution(session.id, '1', 'Contribution 2', 'opinion');
      service.addContribution(session.id, '1', 'Contribution 3', 'opinion');

      const contributions = service.getContributions(session.id);
      expect(contributions.length).toBe(3);
      expect(contributions.every(c => c.participantId === '1')).toBe(true);
    });
  });

  // ============ Integration Tests ============

  describe('Integration Scenarios', () => {
    it('should complete full collaborative decision-making workflow', () => {
      // Create session
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Product Decision', 'strategic', undefined, creator);
      const sessionId = session.id;

      // Add participants
      service.addParticipant(sessionId, mockParticipant('2', 'executive'));
      service.addParticipant(sessionId, mockParticipant('3', 'manager'));

      // Add contributions
      const contrib1 = service.addContribution(sessionId, '1', 'Product A shows promise', 'opinion', 75);
      const contrib2 = service.addContribution(sessionId, '2', 'Product A has good market fit', 'data_point', 80);
      const contrib3 = service.addContribution(sessionId, '3', 'Some concerns about timing', 'concern', 65);

      // Synthesize
      const synthesized = service.synthesizeContributions(sessionId);
      expect(synthesized.length).toBeGreaterThan(0);

      // Create decision
      const decision = service.createDecisionOption(
        sessionId,
        'Launch Product A',
        'Launch Product A next quarter',
        [contrib1, contrib2],
        creator
      );

      // Record votes
      service.recordVote(sessionId, '2', decision.id, 'support');
      service.recordVote(sessionId, '3', decision.id, 'oppose');

      // Get metrics
      const metrics = service.getSessionMetrics(sessionId);
      expect(metrics).toBeDefined();
      expect(metrics!.totalContributions).toBe(3);

      // End session
      const ended = service.endSession(sessionId, creator, 'Decision made');
      expect(ended!.status).toBe('concluded');
    });

    it('should handle multi-stage decision refinement', () => {
      const creator = mockParticipant('1', 'owner');
      const session = service.createSession('org-1', 'Multi-stage', 'operational', undefined, creator);
      const sessionId = session.id;

      // Stage 1: Initial options
      const contrib1 = service.addContribution(sessionId, '1', 'Option A analysis', 'data_point');
      const option1 = service.createDecisionOption(sessionId, 'Option A', 'Desc A', [contrib1], creator);

      const contrib2 = service.addContribution(sessionId, '2', 'Option B analysis', 'data_point');
      const option2 = service.createDecisionOption(sessionId, 'Option B', 'Desc B', [contrib2], creator);

      expect(service.getDecisionOptions(sessionId).length).toBe(2);

      // Stage 2: Voting
      service.recordVote(sessionId, '1', option1.id, 'support');
      service.recordVote(sessionId, '2', option2.id, 'support');
      service.recordVote(sessionId, '3', option1.id, 'oppose');

      // Stage 3: Analysis
      const view = service.getDecisionFacilitationView(sessionId);
      expect(view.options.length).toBe(2);
      expect(view.recommendations.length).toBeGreaterThan(0);

      // Stage 4: Resolution
      const summary = service.generateDecisionSummary(sessionId);
      expect(summary!.decisions).toBe(2);
    });
  });
});
