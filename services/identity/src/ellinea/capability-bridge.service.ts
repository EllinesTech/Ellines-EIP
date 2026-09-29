/**
 * CapabilityBridgeService
 *
 * Routes capability requests across EIP modules — search, fleet, documents,
 * email, and any future capability domain.  Acts as a simple dispatcher that
 * resolves the appropriate handler based on the requested capability type.
 *
 * Requirement 21.3: Cross-module capability routing.
 *
 * Design: dispatcher pattern — each capability maps to a named handler.
 * Handlers are lightweight stubs; they return enough metadata for the
 * caller to know whether the capability is available and what endpoint
 * to use.  Full implementations live in their respective module services.
 */

import { Injectable, Logger } from '@nestjs/common';

export type CapabilityType =
  | 'search'
  | 'fleet'
  | 'documents'
  | 'email'
  | 'connectors'
  | 'approvals'
  | 'analytics'
  | 'notifications';

export interface CapabilityRequest {
  capability: CapabilityType;
  organizationId: string;
  /** Optional arbitrary parameters forwarded to the capability handler. */
  params?: Record<string, unknown>;
}

export interface CapabilityResponse {
  capability: CapabilityType;
  available: boolean;
  endpoint: string | null;
  metadata: Record<string, unknown>;
  handledAt: Date;
}

@Injectable()
export class CapabilityBridgeService {
  private readonly logger = new Logger(CapabilityBridgeService.name);

  // ---------------------------------------------------------------------------
  // Route table — maps capability type to a descriptor
  // ---------------------------------------------------------------------------

  private readonly routeTable: Record<
    CapabilityType,
    {
      endpoint: string;
      description: string;
      available: boolean;
    }
  > = {
    search:        { endpoint: '/api/v1/search',        description: 'Enterprise full-text search across connected systems.',       available: true },
    fleet:         { endpoint: '/api/v1/fleet',         description: 'Device and asset fleet management.',                          available: true },
    documents:     { endpoint: '/api/v1/documents',     description: 'Document generation, storage and retrieval.',                 available: true },
    email:         { endpoint: '/api/v1/email',         description: 'Email intelligence and inbox connector bridge.',              available: true },
    connectors:    { endpoint: '/api/v1/connectors',    description: 'Connector installation, sync, and health management.',        available: true },
    approvals:     { endpoint: '/api/v1/approvals',     description: 'Approval workflow and decision routing.',                     available: true },
    analytics:     { endpoint: '/api/v1/analytics',     description: 'Predictive analytics, forecasting, and data quality.',        available: true },
    notifications: { endpoint: '/api/v1/notifications', description: 'Outbound notification dispatch (email, push, in-app).',       available: true },
  };

  /**
   * Dispatch a capability request and return routing metadata.
   *
   * Security Rule §6: organizationId is carried through so that capability
   * handlers can enforce tenant isolation on their own queries.
   *
   * @param request  Capability request with type and org scope.
   */
  dispatch(request: CapabilityRequest): CapabilityResponse {
    const route = this.routeTable[request.capability];

    if (!route) {
      this.logger.warn(
        `CapabilityBridge: unknown capability '${request.capability}' requested by org=${request.organizationId}`,
      );
      return {
        capability: request.capability,
        available: false,
        endpoint: null,
        metadata: { error: `Unknown capability: ${request.capability}` },
        handledAt: new Date(),
      };
    }

    this.logger.debug(
      `CapabilityBridge: routing '${request.capability}' for org=${request.organizationId} → ${route.endpoint}`,
    );

    return {
      capability: request.capability,
      available: route.available,
      endpoint: route.endpoint,
      metadata: {
        description: route.description,
        organizationId: request.organizationId,
        ...(request.params ?? {}),
      },
      handledAt: new Date(),
    };
  }

  /**
   * Batch-dispatch multiple capability requests.
   * Returns a map of capability → response.
   */
  dispatchMany(
    requests: CapabilityRequest[],
  ): Record<string, CapabilityResponse> {
    return Object.fromEntries(
      requests.map((req) => [req.capability, this.dispatch(req)]),
    );
  }

  /**
   * List all registered capabilities and their availability.
   */
  listCapabilities(): Array<{
    capability: CapabilityType;
    endpoint: string;
    description: string;
    available: boolean;
  }> {
    return Object.entries(this.routeTable).map(([capability, meta]) => ({
      capability: capability as CapabilityType,
      endpoint: meta.endpoint,
      description: meta.description,
      available: meta.available,
    }));
  }
}
