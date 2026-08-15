/**
 * Types for AI Explainability Service
 * Supports detailed explanation generation for AI recommendations and conclusions
 */

/**
 * Data source citation with specific record reference
 */
export interface DataSourceCitation {
  source: string; // System name (e.g., "ERP", "CRM", "HRMS")
  table?: string; // Table or collection name
  recordId: string; // Specific record identifier
  recordName?: string; // Human-readable record identifier
  field?: string; // Specific field/attribute cited
  value?: any; // The value from the source
  timestamp?: Date; // When the data was retrieved
  confidence: number; // 0-100, confidence in the citation
}

/**
 * Confidence score with explanation of uncertainty sources
 */
export interface ConfidenceExplanation {
  score: number; // 0-100, overall confidence
  reasoning: string; // Narrative explanation of confidence level
  uncertaintySources: UncertaintySource[];
  factors: ConfidenceFactor[];
}

export interface UncertaintySource {
  type: 'missing_data' | 'conflicting_signals' | 'model_limitation' | 'external_factor' | 'temporal_lag';
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface ConfidenceFactor {
  factor: string; // Description of the factor
  contribution: number; // -100 to 100, how much it affects confidence
  reason: string;
}

/**
 * Assumption made during reasoning
 */
export interface Assumption {
  statement: string; // What was assumed
  rationale: string; // Why this assumption was made
  validity: 'high' | 'medium' | 'low'; // How likely the assumption is to be true
  alternatives?: string[]; // Alternative assumptions that were considered
  invalidityRisks?: string[]; // Ways this assumption might be invalid
}

/**
 * Alternative explanation or recommendation
 */
export interface AlternativeExplanation {
  explanation: string;
  confidence: number; // 0-100
  reasoning: string;
  pros: string[];
  cons: string[];
  tradeoffs: Tradeoff[];
}

export interface Tradeoff {
  aspect: string; // What is being traded off
  firstOption: string; // What we gain
  secondOption: string; // What we lose
  recommendation: string; // Which is generally preferred and why
}

/**
 * Ruled-out option explanation
 */
export interface RuledOutOption {
  option: string; // The option that was considered but rejected
  reasoning: string; // Why it was ruled out
  ruleOutFactors: string[]; // Specific factors that led to rejection
  underWhatConditions?: string; // When this option might actually be viable
  confidence: number; // 0-100, confidence in the ruling-out
}

/**
 * Step in a reasoning chain
 */
export interface ReasoningStep {
  stepNumber: number;
  operation: 'data_retrieval' | 'analysis' | 'comparison' | 'inference' | 'pattern_detection' | 'aggregation';
  description: string;
  input: any; // What this step used as input
  output: any; // What this step produced
  justification: string; // Why this step was taken
  sources?: DataSourceCitation[]; // Sources used in this step
}

/**
 * Visualization-ready reasoning chain
 */
export interface ReasoningChainVisualization {
  title: string;
  steps: ReasoningStep[];
  conclusion: string;
  visualizationType: 'flowchart' | 'tree' | 'timeline' | 'dependency_graph';
  nodeData: ReasoningNode[];
  edgeData: ReasoningEdge[];
}

export interface ReasoningNode {
  id: string;
  label: string;
  type: 'input' | 'process' | 'decision' | 'output';
  confidence?: number;
  data?: any;
}

export interface ReasoningEdge {
  from: string;
  to: string;
  label?: string;
  type?: 'strong' | 'weak' | 'conditional';
}

/**
 * Counter-evidence challenge
 */
export interface CounterEvidenceChallenge {
  counterEvidence: string; // User-provided counter-evidence
  submittedAt: Date;
  submittedBy?: string; // User ID
  status: 'pending' | 'analyzed' | 'accepted' | 'rejected';
}

/**
 * Re-evaluation result after counter-evidence
 */
export interface ReEvaluationResult {
  originalConclusion: string;
  originalConfidence: number;
  challenge: CounterEvidenceChallenge;
  reevaluatedConclusion?: string;
  reevaluatedConfidence?: number;
  reasoning: string;
  conclusionChanged: boolean; // Whether the counter-evidence changed the conclusion
  newCitations?: DataSourceCitation[];
}

/**
 * Complete explanation for a recommendation or conclusion
 */
export interface CompleteExplanation {
  id: string;
  conclusion: string; // The recommendation or conclusion being explained
  timestamp: Date;
  citations: DataSourceCitation[]; // Specific record references
  confidenceExplanation: ConfidenceExplanation;
  assumptions: Assumption[];
  alternatives: AlternativeExplanation[]; // Alternative recommendations with pros/cons
  ruledOutOptions: RuledOutOption[]; // Why other options were rejected
  reasoningChain: ReasoningChainVisualization; // Complex reasoning steps
  counterEvidenceChallenges: CounterEvidenceChallenge[];
  reEvaluations: ReEvaluationResult[];
  summary: string; // Short narrative summary of the explanation
}

/**
 * Request for explanation
 */
export interface ExplanationRequest {
  conclusionId: string; // ID of the recommendation or conclusion to explain
  question?: string; // Optional specific question about the explanation
  includeAlternatives?: boolean; // Include alternative recommendations
  includeReasoning?: boolean; // Include detailed reasoning chain
  includeAssumptions?: boolean; // Include assumptions made
  format?: 'detailed' | 'summary' | 'visual'; // Output format
}
