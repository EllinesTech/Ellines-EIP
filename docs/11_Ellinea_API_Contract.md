# Ellinea AI API contract (v0.1)

Base path: `/api/v1`  
Service: `@ellines-eip/ellinea-service` (Nest on `:3002`) · Live web also exposes Memory / Ask via Pages Functions.  
Package engine: `@ellines-eip/ellinea-ai` · Client: `@ellines-eip/ellinea-sdk`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness (`{ status, service, version, contract }`) |
| `POST` | `/ellinea/ask` | Grounded Q&A (template + RAG; multi-hop enterprise reasoning) |
| `POST` | `/ellinea/brief` | CEO / role daily brief |
| `POST` | `/ellinea/recommend` | Explainable recommendations |
| `POST` | `/ellinea/memory/search` | Rank Memory notes for a query |
| `POST` | `/ellinea/feedback` | Record helpful/dismiss (stateless echo + ranked list) |

EIP Pages also serve org-scoped Memory / Learning under `/api/v1/orgs/me/ellinea-*` (JWT via Identity) — those are not duplicated on the Nest stub.

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

Request: `{ organizationId: string; recId: string; vote: 'helpful' | 'dismiss'; recommendations?: Recommendation[]; feedback?: FeedbackMap; summary?: EllineaEnterpriseSnapshot | null; role?: string }`  
Response: `{ feedback: FeedbackMap; recommendations: Recommendation[] }`

## Auth

| Mode | Behavior |
|------|----------|
| **MVP default** | Nest stub is open (localhost). `Authorization: Bearer …` is accepted by the SDK/`EllineaAuthStubGuard` but not required. Health is always open. |
| **`ELLINEA_REQUIRE_AUTH=1`** | Guard requires a Bearer token (presence check). Full JWT verify + tenant isolation remain Identity-backed (see 6.5 on Pages / Nest Identity). |

Production EIP Ask uses Pages Functions with the signed-in org JWT. Standalone Nest is for SDK / operator console smoke tests.

## EIP surfaces that consume this contract

| Surface | How |
|---------|-----|
| **Ask Ellinea** (`/app/ellinea` + float) | Pages Ask / local engine (brief, recommend, memory, DNA) |
| **Ellinea Console** (`/app/ellinea-console`) | Owner/IT operator lab against Nest + SDK |
| **Organization System** (`/app/org-system`) | Owner/IT capability catalog embeds local `buildDailyBriefText` / `buildEllineaRecommendations` over the enterprise snapshot — same engine semantics; not a second API |

## Client SDK

`@ellines-eip/ellinea-sdk` — `createEllineaClient({ baseUrl, getAccessToken? })` wraps health / ask / brief / recommend / memorySearch / feedback. Pass `getAccessToken` when calling a locked Nest instance or any JWT-gated proxy.
