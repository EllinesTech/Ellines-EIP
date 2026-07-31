/** Minimal enterprise snapshot shape Ellinea needs (decoupled from web DTO). */
export type EllineaEnterpriseSnapshot = {
  healthScore: number;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
  connectorName: string;
  connectorId: string;
  timeline: { title: string; detail: string }[];
  model?: {
    version?: string;
    sourceSystem?: string;
    capabilities?: string[];
    counts?: {
      branches: number;
      departments: number;
      people: number;
      documents: number;
      assets: number;
      tasks: number;
      notifications: number;
      events: number;
    };
    objects?: {
      id: string;
      kind: string;
      name: string;
      status?: string;
      branchId?: string;
    }[];
  } | null;
  syncedAt: string | null;
  status: 'idle' | 'synced' | 'error';
};
