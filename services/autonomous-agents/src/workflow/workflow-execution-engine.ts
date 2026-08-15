import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowDefinition,
  WorkflowExecutionContext,
  WorkflowStep,
  WorkflowBranch,
  StepStatus,
  WorkflowExecutionStatus,
  ConditionExpression,
  WorkflowOutcome,
  ExecutionTraceEntry,
  ErrorLogEntry,
  DecisionRecord,
  ApprovalRequest,
  LearningPoint,
} from '../types';
import { v4 as uuid } from 'uuid';

/**
 * Workflow Execution Engine
 * Manages DAG-based workflow execution with conditional branching
 */
@Injectable()
export class WorkflowExecutionEngine {
  private readonly logger = new Logger(WorkflowExecutionEngine.name);
  private executionContexts: Map<string, WorkflowExecutionContext> = new Map();

  /**
   * Initialize a new workflow execution
   */
  initializeExecution(
    workflow: WorkflowDefinition,
    orgId: string,
    userId: string,
    agentId: string,
    initialVariables?: Record<string, any>,
  ): WorkflowExecutionContext {
    const executionId = uuid();
    const context: WorkflowExecutionContext = {
      executionId,
      workflowId: workflow.id,
      orgId,
      userId,
      agentId,
      status: 'pending',
      variables: initialVariables || {},
      stepStates: new Map(),
      decisions: [],
      approvalRequests: [],
      startTime: new Date(),
      currentStepIndex: 0,
      errorLog: [],
      executionTrace: [],
    };

    // Initialize all steps as pending
    workflow.steps.forEach((step) => {
      context.stepStates.set(step.id, 'pending');
    });

    this.executionContexts.set(executionId, context);
    this.addTraceEntry(executionId, 'execution_started', 'step_started', {
      workflow: workflow.name,
      version: workflow.version,
    });

    return context;
  }

  /**
   * Execute next step in workflow
   */
  async executeNextStep(
    executionId: string,
    decisionCallback?: (stepId: string, decision: any) => Promise<any>,
  ): Promise<WorkflowExecutionContext> {
    const context = this.executionContexts.get(executionId);
    if (!context) {
      throw new Error(`Execution context not found: ${executionId}`);
    }

    if (context.status !== 'running' && context.status !== 'pending') {
      throw new Error(`Cannot execute step in ${context.status} state`);
    }

    const workflow = this.getWorkflow(context.workflowId); // This would come from DB in real impl
    context.status = 'running';

    const nextStep = workflow.steps[context.currentStepIndex];
    if (!nextStep) {
      // All steps completed
      context.status = 'success';
      context.endTime = new Date();
      this.addTraceEntry(executionId, 'execution_completed', 'step_started', {
        totalTime: context.endTime.getTime() - context.startTime.getTime(),
      });
      return context;
    }

    try {
      // Update step status
      context.stepStates.set(nextStep.id, 'running');
      this.addTraceEntry(executionId, nextStep.id, 'step_started', {
        stepName: nextStep.name,
        type: nextStep.type,
      });

      // Check branching conditions
      const targetStepId = this.evaluateBranching(executionId, workflow, nextStep);

      // Execute step based on type
      switch (nextStep.type) {
        case 'condition':
          await this.executeConditionStep(executionId, nextStep, context);
          break;
        case 'decision':
          if (decisionCallback) {
            await this.executeDecisionStep(executionId, nextStep, context, decisionCallback);
          }
          break;
        case 'action':
          // Action execution handled by decision maker or action executor
          await this.executeActionStep(executionId, nextStep, context);
          break;
        case 'aggregate':
          await this.executeAggregateStep(executionId, nextStep, context);
          break;
        case 'transform':
          await this.executeTransformStep(executionId, nextStep, context);
          break;
      }

      context.stepStates.set(nextStep.id, 'success');
      context.currentStepIndex++;

      this.addTraceEntry(executionId, nextStep.id, 'step_started', {
        stepName: nextStep.name,
        status: 'completed',
      });
    } catch (error) {
      context.stepStates.set(nextStep.id, 'failed');
      context.status = 'failed';
      context.endTime = new Date();

      const errorLogEntry: ErrorLogEntry = {
        timestamp: new Date(),
        level: 'error',
        message: error instanceof Error ? error.message : String(error),
        context: {
          stepId: nextStep.id,
          executionId,
          stepName: nextStep.name,
        },
        stackTrace: error instanceof Error ? error.stack : undefined,
      };

      context.errorLog.push(errorLogEntry);
      this.addTraceEntry(executionId, nextStep.id, 'error_occurred', {
        error: errorLogEntry.message,
      });

      throw error;
    }

    return context;
  }

  /**
   * Evaluate branching conditions to determine next step
   */
  private evaluateBranching(
    executionId: string,
    workflow: WorkflowDefinition,
    currentStep: WorkflowStep,
  ): string {
    const context = this.executionContexts.get(executionId)!;

    // Find applicable branches from current step
    const applicableBranches = workflow.branches
      .filter((b) => b.sourceStepId === currentStep.id)
      .sort((a, b) => b.priority - a.priority);

    for (const branch of applicableBranches) {
      if (this.evaluateCondition(branch.condition, context.variables)) {
        this.addTraceEntry(executionId, currentStep.id, 'branch_taken', {
          branch: branch.id,
          targetStep: branch.targetStepId,
          condition: this.conditionToString(branch.condition),
        });

        // Find the index of target step
        const workflow = this.getWorkflow(context.workflowId);
        const targetIndex = workflow.steps.findIndex((s) => s.id === branch.targetStepId);
        if (targetIndex >= 0) {
          context.currentStepIndex = targetIndex;
        }
        return branch.targetStepId;
      }
    }

    // No branch matched, continue to next step
    return currentStep.nextStepId || '';
  }

  /**
   * Evaluate a condition expression
   */
  evaluateCondition(condition: ConditionExpression, variables: Record<string, any>): boolean {
    const leftValue = variables[condition.leftOperand];
    const rightValue = condition.rightOperand;

    let result = false;

    switch (condition.operator) {
      case 'equals':
        result = leftValue === rightValue;
        break;
      case 'not_equals':
        result = leftValue !== rightValue;
        break;
      case 'greater_than':
        result = leftValue > rightValue;
        break;
      case 'less_than':
        result = leftValue < rightValue;
        break;
      case 'in_list':
        result = Array.isArray(rightValue) && rightValue.includes(leftValue);
        break;
      case 'contains':
        result = String(leftValue).includes(String(rightValue));
        break;
      case 'regex_match':
        try {
          const regex = new RegExp(rightValue);
          result = regex.test(String(leftValue));
        } catch {
          result = false;
        }
        break;
    }

    return condition.negated ? !result : result;
  }

  /**
   * Execute a condition step
   */
  private async executeConditionStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowExecutionContext,
  ): Promise<void> {
    if (!step.condition) {
      throw new Error(`Condition step ${step.id} has no condition defined`);
    }

    const result = this.evaluateCondition(step.condition, context.variables);
    context.variables[`${step.id}_result`] = result;

    this.addTraceEntry(executionId, step.id, 'step_started', {
      type: 'condition',
      condition: this.conditionToString(step.condition),
      result,
    });
  }

  /**
   * Execute a decision step
   */
  private async executeDecisionStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowExecutionContext,
    decisionCallback: (stepId: string, decision: any) => Promise<any>,
  ): Promise<void> {
    if (!step.decision) {
      throw new Error(`Decision step ${step.id} has no decision defined`);
    }

    // Record decision point
    const result = await decisionCallback(step.id, step.decision);
    context.variables[`${step.id}_decision`] = result;

    this.addTraceEntry(executionId, step.id, 'decision_made', {
      type: 'decision',
      decision: result,
    });
  }

  /**
   * Execute an action step
   */
  private async executeActionStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowExecutionContext,
  ): Promise<void> {
    if (!step.action) {
      throw new Error(`Action step ${step.id} has no action defined`);
    }

    // Action execution would be delegated to action executor
    context.variables[`${step.id}_action`] = step.action;

    this.addTraceEntry(executionId, step.id, 'action_executed', {
      type: 'action',
      actionType: step.action.type,
      targetSystem: step.action.targetSystem,
    });
  }

  /**
   * Execute an aggregate step
   */
  private async executeAggregateStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowExecutionContext,
  ): Promise<void> {
    // Aggregate input variables into output
    const aggregated = {} as any;
    for (const inputVar of step.inputVariables) {
      const value = context.variables[inputVar];
      if (value !== undefined) {
        aggregated[inputVar] = value;
      }
    }

    for (const outputVar of step.outputVariables) {
      context.variables[outputVar] = aggregated;
    }

    this.addTraceEntry(executionId, step.id, 'step_started', {
      type: 'aggregate',
      inputVariables: step.inputVariables,
      outputVariables: step.outputVariables,
    });
  }

  /**
   * Execute a transform step
   */
  private async executeTransformStep(
    executionId: string,
    step: WorkflowStep,
    context: WorkflowExecutionContext,
  ): Promise<void> {
    // Transform input variables into output
    const transformed = {} as any;
    for (const inputVar of step.inputVariables) {
      const value = context.variables[inputVar];
      // Simple transform: uppercase all string values (placeholder)
      transformed[inputVar] = typeof value === 'string' ? value.toUpperCase() : value;
    }

    for (const outputVar of step.outputVariables) {
      context.variables[outputVar] = transformed;
    }

    this.addTraceEntry(executionId, step.id, 'step_started', {
      type: 'transform',
      inputVariables: step.inputVariables,
      outputVariables: step.outputVariables,
    });
  }

  /**
   * Pause workflow execution
   */
  pauseExecution(executionId: string): void {
    const context = this.executionContexts.get(executionId);
    if (context) {
      context.status = 'paused';
      this.addTraceEntry(executionId, 'system', 'step_started', {
        event: 'execution_paused',
      });
    }
  }

  /**
   * Resume workflow execution
   */
  resumeExecution(executionId: string): void {
    const context = this.executionContexts.get(executionId);
    if (context && context.status === 'paused') {
      context.status = 'running';
      this.addTraceEntry(executionId, 'system', 'step_started', {
        event: 'execution_resumed',
      });
    }
  }

  /**
   * Get execution context
   */
  getExecutionContext(executionId: string): WorkflowExecutionContext | null {
    return this.executionContexts.get(executionId) || null;
  }

  /**
   * Record approval request in execution context
   */
  recordApprovalRequest(executionId: string, request: ApprovalRequest): void {
    const context = this.executionContexts.get(executionId);
    if (context) {
      context.approvalRequests.push(request);
      context.status = 'waiting_approval';
      this.addTraceEntry(executionId, 'system', 'approval_requested', {
        approvalId: request.id,
        reason: request.reason,
        confidence: request.confidence,
      });
    }
  }

  /**
   * Record decision in execution context
   */
  recordDecision(executionId: string, decision: DecisionRecord): void {
    const context = this.executionContexts.get(executionId);
    if (context) {
      context.decisions.push(decision);
      this.addTraceEntry(executionId, decision.decisionPointId, 'decision_made', {
        decisionId: decision.id,
        selectedOption: decision.selectedOptionId,
        confidence: decision.confidence,
      });
    }
  }

  /**
   * Generate workflow execution outcome
   */
  generateOutcome(executionId: string, learningPoints: LearningPoint[] = []): WorkflowOutcome {
    const context = this.executionContexts.get(executionId);
    if (!context) {
      throw new Error(`Execution context not found: ${executionId}`);
    }

    const outcome: WorkflowOutcome = {
      executionId,
      workflowId: context.workflowId,
      agentId: context.agentId,
      success: context.status === 'success',
      completionTime: (context.endTime || new Date()).getTime() - context.startTime.getTime(),
      actionsExecuted: context.decisions.length,
      decisionsRecorded: context.decisions.length,
      approvalsRequired: context.approvalRequests.length,
      approvalsGranted: context.approvalRequests.filter((a) => a.approved).length,
      approvalsRejected: context.approvalRequests.filter((a) => a.approved === false).length,
      errors: context.errorLog.map((e) => ({
        stepId: e.context.stepId || '',
        error: e.message,
        severity: e.level as any,
        recoverable: true,
        timestamp: e.timestamp,
      })),
      sideEffects: [],
      learningPoints,
      recordedAt: new Date(),
    };

    return outcome;
  }

  /**
   * Add trace entry for execution debugging
   */
  private addTraceEntry(
    executionId: string,
    stepId: string,
    eventType: any,
    data: Record<string, any>,
  ): void {
    const context = this.executionContexts.get(executionId);
    if (context) {
      context.executionTrace.push({
        timestamp: new Date(),
        stepId,
        eventType,
        data,
        context: {
          status: context.status,
          stepIndex: context.currentStepIndex,
        },
      });
    }
  }

  /**
   * Convert condition to human-readable string
   */
  private conditionToString(condition: ConditionExpression): string {
    const operatorSymbols: Record<string, string> = {
      equals: '=',
      not_equals: '!=',
      greater_than: '>',
      less_than: '<',
      in_list: 'in',
      contains: 'contains',
      regex_match: 'matches',
    };

    const symbol = operatorSymbols[condition.operator] || condition.operator;
    return `${condition.leftOperand} ${symbol} ${JSON.stringify(condition.rightOperand)}`;
  }

  /**
   * Placeholder - would load from database
   */
  private getWorkflow(workflowId: string): WorkflowDefinition {
    // In real implementation, this would fetch from database
    return {
      id: workflowId,
      name: 'Test Workflow',
      description: '',
      orgId: '',
      version: 1,
      steps: [],
      branches: [],
      triggers: [],
      policy: {} as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      enabled: true,
    };
  }
}
