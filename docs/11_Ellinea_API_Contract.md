# Ellinea AI API contract (v0.1)

Base path: `/api/v1`  
Service: `@ellines-eip/ellinea-service` (Nest) · Live web also exposes Memory / Ask via Pages Functions.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness |
| `POST` | `/ellinea/ask` | Grounded Q&A (template + RAG) |
| `POST` | `/ellinea/brief` | CEO / role daily brief |
| `POST` | `/ellinea/recommend` | Explainable recommendations |
| `POST` | `/ellinea/memory/search` | Rank Memory notes for a query |
| `POST` | `/ellinea/feedback` | Record helpful/dismiss (stateless echo + ranked list) |

## Shared payload types

```ts
type EllineaEnterpriseSnapshot = {
  status: 'idle' | 'synced' | 'error';
  healthScore: number;
  openAlerts: number;
  openDecisions: number;
  connectedSystems: number;
  briefHighlight: string;
  connectorName: string;
  connectorId: string;
  timeline: { title: string; detail: string }[];
  model?: { counts?: Record<string, number>; objects?: Array<{ id: string; kind: string; name: string; status?: string }> } | null;
  syncedAt: string | null;
};

type EllineaMemoryNote = { id: string; title: string; body: string; updatedAt: string };
```

### POST `/ellinea/ask`

Request: `{ question: string; summary?: EllineaEnterpriseSnapshot | null; memory?: EllineaMemoryNote[]; role?: string; organizationName?: string }`  
Response: `{ answer: string; mode: 'template+rag'; grounding: string; recommendations: Recommendation[] }`

### POST `/ellinea/brief`

Request: `{ summary?: EllineaEnterpriseSnapshot | null; role?: string; organizationName?: string }`  
Response: `{ brief: string }`

### POST `/ellinea/recommend`

Request: `{ summary?: EllineaEnterpriseSnapshot | null; role?: string; feedback?: Record<string, { helpful: number; dismiss: number }> }`  
Response: `{ recommendations: Recommendation[] }`

### POST `/ellinea/memory/search`

Request: `{ question: string; memory: EllineaMemoryNote[]; summary?: EllineaEnterpriseSnapshot | null }`  
Response: `{ chunks: RagChunk[] }`

### POST `/ellinea/feedback`

Request: `{ organizationId: string; recId: string; vote: 'helpful' | 'dismiss'; recommendations?: Recommendation[]; feedback?: FeedbackMap }`  
Response: `{ feedback: FeedbackMap; recommendations: Recommendation[] }`

## Auth (later)

MVP stub is open on localhost. Production will require JWT (same as Identity) and tenant isolation (6.5).

## Client SDK

`@ellines/ellinea-sdk` (queue 6.3) will wrap these routes.
