/**
 * Autonomous Agent Framework - Core Type Definitions
 */

// ============================================================================
// Workflow Execution Engine Types
// ============================================================================

/**
 * Workflow step types for different operations
 */
export type WorkflowStepType = 'action' | 'condition' | 'decision' | 'aggregate' | 'transform';

/**
 * Condition operators for branching logic
 */
export type ConditionOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in_list' | 'contains' | 'regex_match';

/**
 * Step execution status
 */
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting_approval';

/**
 * Workflow execution status
 */
export type WorkflowExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'paused' | 'waiting_approval';

/**
 * Agent action types - allowed operations
 */
export type AgentActionType = 
  | 'create_record'
  | 'update_record'
  | 'delete_record'
  | 'send_notification'
  | 'create_task'
  | 'approve_request'
  | 'escalate_issue'
  | 'run_report'
  | 'trigger_workflow'
  | 'custom_action';

/**
 * Workflow execution context containing state and variables
 */
export interface WorkflowExecutionContext {
  executionId: string;
  workflowId: string;
  orgId: string;
  userId: string;
  agentId: string;
  status: WorkflowExecutionStatus;
  variables: Record<string, any>;
  stepStates: Map<string, StepStatus>;
  decisions: DecisionRecord[];
  approvalRequests: ApprovalRequest[];
  startTime: Date;
  endTime?: Date;
  currentStepIndex: number;
  errorLog: ErrorLogEntry[];
  executionTrace: ExecutionTraceEntry[];
}

/**
 * Workflow definition describing the process DAG
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  orgId: string;
  version: number;
  steps: WorkflowStep[];
  branches: WorkflowBranch[];
  triggers: WorkflowTrigger[];
  policy: AgentPolicy;
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
}

/**
 * Workflow step in the DAG
 */
export interface WorkflowStep {
  id: string;
  stepIndex: number;
  name: string;
  type: WorkflowStepType;
  action?: AgentAction;
  condition?: ConditionExpression;
  decision?: DecisionPoint;
  inputVariables: string[];
  outputVariables: string[];
  timeout?: number;
  retryPolicy?: RetryPolicy;
  nextStepId?: string;
}

/**
 * Branching logic for conditional workflows
 */
export interface WorkflowBranch {
  id: string;
  sourceStepId: string;
  condition: ConditionExpression;
  targetStepId: string;
  priority: number;
}

/**
 * Condition expression for if/then/else branching
 */
export interface ConditionExpression {
  operator: ConditionOperator;
  leftOperand: string; // variable name
  rightOperand: any;
  negated: boolean;
}

/**
 * Workflow trigger definition
 */
export interface WorkflowTrigger {
  id: string;
  type: 'manual' | 'event' | 'schedule' | 'condition_based';
  config: Record<string, any>;
}

/**
 * Retry policy for fault tolerance
 */
export interface RetryPolicy {
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

// ============================================================================
// Decision Maker Types
// ============================================================================

/**
 * Decision point requiring agent choice
 */
export interface DecisionPoint {
  id: string;
  question: string;
  options: DecisionOption[];
  context: Record<string, any>;
  requiresApproval: boolean;
}

/**
 * Decision option
 */
export interface DecisionOption {
  id: string;
  label: string;
  value: string;
  description: string;
  action?: AgentAction;
}

/**
 * Decision made by the agent
 */
export interface Decision {
  id: string;
  decisionPointId: string;
  selectedOptionId: string;
  confidence: number; // 0-1
  reasoning: DecisionReasoning;
  timestamp: Date;
  requiresApproval: boolean;
  approved?: boolean;
  approvedBy?: string;
  approvalTimestamp?: Date;
}

/**
 * Decision record for tracking
 */
export interface DecisionRecord extends Decision {
  executionId: string;
  workflowId: string;
  agentId: string;
  outcome?: DecisionOutcome;
  feedback?: string;
}

/**
 * Decision outcome tracking for learning
 */
export interface DecisionOutcome {
  success: boolean;
  impact: string;
  metrics: Record<string, number>;
  timestamp: Date;
}

/**
 * Reasoning behind a decision
 */
export interface DecisionReasoning {
  factors: DecisionFactor[];
  confidenceFactors: ConfidenceFactor[];
  knowledgeGapWarnings: string[];
  assumptionsUsed: string[];
}

/**
 * Factor contributing to a decision
 */
export interface DecisionFactor {
  name: string;
  weight: number; // 0-1
  value: any;
  source: string;
  reliability: number; // 0-1
}

/**
 * Factors affecting decision confidence
 */
export interface ConfidenceFactor {
  factor: string;
  impact: number; // negative or positive
  description: string;
}

// ============================================================================
// Agent Action Types
// ============================================================================

/**
 * Agent action to be executed
 */
export interface AgentAction {
  id: string;
  type: AgentActionType;
  targetSystem: string;
  targetEntity: string;
  payload: Record<string, any>;
  preconditions: ConditionExpression[];
  successCriteria: ConditionExpression[];
  rollbackActions?: AgentAction[];
}

/**
 * Action execution result
 */
export interface ActionExecutionResult {
  actionId: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  output: Record<string, any>;
  error?: string;
  sideEffects: SideEffect[];
  rollbackRequired: boolean;
}

/**
 * Side effects of an action
 */
export interface SideEffect {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  automatic: boolean;
  targetSystem: string;
  targetEntity: string;
}

// ============================================================================
// Approval Request Types
// ============================================================================

/**
 * Approval request for low-confidence decisions
 */
export interface ApprovalRequest {
  id: string;
  executionId: string;
  workflowId: string;
  decisionId: string;
  reason: string;
  confidence: number;
  proposedAction: AgentAction;
  reasoning: DecisionReasoning;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  escalationPath: string[];
  createdAt: Date;
  dueAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  approvedBy?: string;
  approvalTimestamp?: Date;
  comments?: string;
}

// ============================================================================
// Outcome Monitor Types
// ============================================================================

/**
 * Workflow execution outcome
 */
export interface WorkflowOutcome {
  executionId: string;
  workflowId: string;
  agentId: string;
  success: boolean;
  completionTime: number; // milliseconds
  actionsExecuted: number;
  decisionsRecorded: number;
  approvalsRequired: number;
  approvalsGranted: number;
  approvalsRejected: number;
  errors: WorkflowError[];
  sideEffects: SideEffect[];
  learningPoints: LearningPoint[];
  recordedAt: Date;
}

/**
 * Workflow error
 */
export interface WorkflowError {
  stepId: string;
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  timestamp: Date;
}

/**
 * Learning point extracted from execution
 */
export interface LearningPoint {
  type: 'pattern' | 'success_factor' | 'failure_reason' | 'unknown_interaction';
  description: string;
  confidence: number;
  applicability: string[];
  actionableInsight: string;
}

// ============================================================================
// Execution Trace Types
// ============================================================================

/**
 * Single entry in execution trace for debugging
 */
export interface ExecutionTraceEntry {
  timestamp: Date;
  stepId: string;
  eventType: 'step_started' | 'decision_made' | 'action_executed' | 'approval_requested' | 'branch_taken' | 'error_occurred';
  data: Record<string, any>;
  context: Record<string, any>;
}

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  message: string;
  context: Record<string, any>;
  stackTrace?: string;
}

// ============================================================================
// Agent Coordination Types
// ============================================================================

/**
 * Registry of in-flight agent actions
 */
export interface InFlightActionRegistry {
  agentId: string;
  actionId: string;
  targetResource: ResourceReference;
  startTime: Date;
  lockTimeout: number;
  executingAgent: string;
}

/**
 * Resource reference for conflict detection
 */
export interface ResourceReference {
  systemId: string;
  entityId: string;
  entityType: string;
  operationType: 'read' | 'write' | 'delete' | 'execute';
}

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflictingActions: InFlightActionRegistry[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: 'defer' | 'parallel' | 'escalate';
}

// ============================================================================
// Explainability Types
// ============================================================================

/**
 * Explainable decision explanation
 */
export interface ExplainableDecision {
  decision: Decision;
  explanation: DecisionExplanation;
  alternativeOptions: AlternativeOption[];
  assumptionsHighlights: string[];
  confidenceBreakdown: ConfidenceBreakdownItem[];
  ruledOutReasons: RuledOutReason[];
}

/**
 * Decision explanation with reasoning
 */
export interface DecisionExplanation {
  summary: string;
  detailedReasoning: string;
  keyFactors: {
    name: string;
    importance: number;
    value: any;
  }[];
  dataSourceCitations: DataSourceCitation[];
  uncertaintySources: UncertaintySources;
}

/**
 * Alternative option explanation
 */
export interface AlternativeOption {
  optionId: string;
  label: string;
  whyNotChosen: string;
  confidence: number;
  tradeoffs: string[];
}

/**
 * Ruled out option and why
 */
export interface RuledOutReason {
  optionId: string;
  reason: string;
  confidence: number;
}

/**
 * Confidence breakdown by factor
 */
export interface ConfidenceBreakdownItem {
  factor: string;
  contribution: number; // -1 to 1
  description: string;
}

/**
 * Uncertainty sources in decision
 */
export interface UncertaintySources {
  dataQuality: string[];
  modelLimitations: string[];
  knowledgeGaps: string[];
  timelinessIssues: string[];
}

/**
 * Citation to data source
 */
export interface DataSourceCitation {
  source: string;
  systemId: string;
  recordId: string;
  fieldName: string;
  value: any;
  retrievedAt: Date;
  confidence: number;
}

// ============================================================================
// Policy Types
// ============================================================================

/**
 * Agent policy defining boundaries and thresholds
 */
export interface AgentPolicy {
  id: string;
  orgId: string;
  name: string;
  description: string;
  allowedActions: AgentActionType[];
  autonomyThreshold: number; // confidence threshold for autonomous action (0-1), typically 0.9
  approvalThreshold: number; // confidence threshold requiring approval (0-1), typically 0.5
  escalationThreshold: number; // confidence requiring escalation (0-1), typically 0.2
  escalationPath: string[]; // user IDs or roles in escalation order
  allowedTargetSystems: string[];
  actionLimits: ActionLimit[];
  resourceLimits: ResourceLimit[];
  timeWindows?: TimeWindow[];
  riskToleranceLevel: 'conservative' | 'moderate' | 'aggressive';
  createdAt: Date;
  updatedAt: Date;
  enabled: boolean;
}

/**
 * Action limit to prevent resource exhaustion
 */
export interface ActionLimit {
  actionType: AgentActionType;
  maxPerHour: number;
  maxPerDay: number;
  maxConcurrent: number;
}

/**
 * Resource limit to prevent overload
 */
export interface ResourceLimit {
  resourceType: string;
  maxConcurrentOperations: number;
  maxOperationsPerHour: number;
  backoffStrategy: 'linear' | 'exponential';
}

/**
 * Time window for agent operations
 */
export interface TimeWindow {
  dayOfWeek: number[]; // 0-6
  startHour: number;
  endHour: number;
  restriction: 'allowed_only' | 'not_allowed';
}

// ============================================================================
// Health and Status Types
// ============================================================================

/**
 * Agent health status
 */
export interface AgentHealthStatus {
  agentId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number; // milliseconds
  executionsInProgress: number;
  successRate: number; // 0-1
  averageExecutionTime: number; // milliseconds
  errorRate: number; // 0-1
  lastHealthCheck: Date;
  metrics: AgentMetrics;
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageConfidence: number;
  autonomousActionsCount: number;
  approvalsRequiredCount: number;
  escalationsCount: number;
  averageExecutionTime: number;
  p95ExecutionTime: number;
  p99ExecutionTime: number;
}
