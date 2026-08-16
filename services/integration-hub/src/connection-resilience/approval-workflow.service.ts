import { Injectable, Logger } from '@nestjs/common';
import {
  GeneratedConnectorCode,
  ApprovalWorkflowStatus,
  SystemIdentifier,
} from './types';

/**
 * ApprovalWorkflowService — Manages IT admin approval process for generated connectors
 * Implements approval request creation, tracking, and status management
 */
@Injectable()
export class ApprovalWorkflowService {
  private readonly logger = new Logger(ApprovalWorkflowService.name);
  private approvalRequests = new Map<string, ApprovalWorkflowStatus>();
  private requestId = 0;

  constructor() {
    this.logger.log('ApprovalWorkflowService initialized');
  }

  /**
   * Create approval request for generated connector
   */
  async createApprovalRequest(
    systemId: string,
    connectorCode: GeneratedConnectorCode,
  ): Promise<ApprovalWorkflowStatus> {
    const requestId = this.generateApprovalRequestId();

    const approvalRequest: ApprovalWorkflowStatus = {
      requestId,
      connectorId: `${systemId}-connector`,
      status: 'pending',
      requestedBy: 'system-generated',
      requestedAt: new Date(),
    };

    this.approvalRequests.set(requestId, approvalRequest);

    this.logger.log(
      `Created approval request ${requestId} for connector ${systemId}`,
    );

    return approvalRequest;
  }

  /**
   * Submit generated connector for approval by IT admin
   */
  async submitForApproval(
    systemId: string,
    connectorCode: GeneratedConnectorCode,
    approverEmail: string,
  ): Promise<ApprovalWorkflowStatus> {
    const requestId = this.generateApprovalRequestId();

    const approvalRequest: ApprovalWorkflowStatus = {
      requestId,
      connectorId: `${systemId}-connector`,
      status: 'pending',
      requestedBy: 'admin',
      requestedAt: new Date(),
    };

    this.approvalRequests.set(requestId, approvalRequest);

    this.logger.log(
      `Submitted connector ${systemId} for approval to ${approverEmail}`,
    );

    // TODO: Send notification to approver email
    // TODO: Store in database for persistence

    return approvalRequest;
  }

  /**
   * Approve generated connector
   */
  async approveRequest(
    requestId: string,
    approverEmail: string,
    notes?: string,
  ): Promise<ApprovalWorkflowStatus> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(
        `Cannot approve request in ${request.status} status`,
      );
    }

    request.status = 'approved';
    request.approvedBy = approverEmail;
    request.approvedAt = new Date();

    this.approvalRequests.set(requestId, request);

    this.logger.log(
      `Approved connector request ${requestId} by ${approverEmail}`,
    );

    // TODO: Send approval notification
    // TODO: Deploy approved connector

    return request;
  }

  /**
   * Reject generated connector
   */
  async rejectRequest(
    requestId: string,
    approverEmail: string,
    rejectionReason: string,
  ): Promise<ApprovalWorkflowStatus> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(
        `Cannot reject request in ${request.status} status`,
      );
    }

    request.status = 'rejected';
    request.approvedBy = approverEmail;
    request.approvedAt = new Date();
    request.rejectionReason = rejectionReason;

    this.approvalRequests.set(requestId, request);

    this.logger.log(
      `Rejected connector request ${requestId} by ${approverEmail}. Reason: ${rejectionReason}`,
    );

    // TODO: Send rejection notification with reason

    return request;
  }

  /**
   * Get approval status
   */
  async getApprovalStatus(requestId: string): Promise<ApprovalWorkflowStatus> {
    const request = this.approvalRequests.get(requestId);

    if (!request) {
      throw new Error(`Approval request not found: ${requestId}`);
    }

    return request;
  }

  /**
   * Get pending approvals for IT admin
   */
  async getPendingApprovals(approverEmail?: string): Promise<ApprovalWorkflowStatus[]> {
    const pending = Array.from(this.approvalRequests.values()).filter(
      (req) => req.status === 'pending',
    );

    if (approverEmail) {
      // Filter for specific approver if provided
      // TODO: Implement approver filtering once database is set up
    }

    return pending;
  }

  /**
   * Get approval history
   */
  async getApprovalHistory(connectorId: string): Promise<ApprovalWorkflowStatus[]> {
    return Array.from(this.approvalRequests.values()).filter(
      (req) => req.connectorId === connectorId,
    );
  }

  /**
   * Get approval statistics
   */
  getApprovalStats(): {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  } {
    const requests = Array.from(this.approvalRequests.values());

    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    };
  }

  /**
   * Generate unique approval request ID
   */
  private generateApprovalRequestId(): string {
    return `approval-${this.requestId++}-${Date.now()}`;
  }
}
