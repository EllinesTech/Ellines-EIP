# How to use the Ellinea brain (standalone)

Ellinea is packaged so other Ellines products can reuse the same intelligence without the full EIP Work Console.

## What you get

| Piece | Location | Role |
|-------|----------|------|
| Core engine | `@ellines-eip/ellinea-ai` | Q&A, brief, recommendations, Memory helpers, DNA, RAG |
| HTTP API | `services/ellinea-ai` | Nest on `:3002` — ask / brief / recommend / memory / feedback |
| Client SDK | `@ellines-eip/ellinea-sdk` | `createEllineaClient({ baseUrl })` |
| Live org data | Pages Functions | Memory, learning, optional LLM Ask, enterprise ingest |
| Operator UI | `/app/ellinea-console` | Owner/IT **operator / API lab** (SDK + contract smoke) — not everyday chat |

**EIP placement (do not invent a second Ask nav):** everyday Ask is the floating “Ask Ellinea AI” panel (optional full workspace `/app/ellinea`). Preferences live on System Settings → **Ellinea AI** card. The console stays an advanced Owner/IT surface linked from that card as “Operator console (API)” — keep the route; it is **not** Work Console side nav. It may later become a thin standalone Ellinea operator product; EIP nav stays clean.

Contract details: [11_Ellinea_API_Contract.md](./11_Ellinea_API_Contract.md)

## Minimal integration (another Ellines app)

1. **Build shared packages**

```bash
npm run build -w @ellines-eip/ellinea-ai
npm run build -w @ellines-eip/ellinea-sdk
npm run build -w @ellines-eip/ellinea-service
```

2. **Run the Nest brain** (optional if you only call Pages Functions)

```bash
npm run start -w @ellines-eip/ellinea-service
# GET  http://localhost:3002/api/v1/health
# POST http://localhost:3002/api/v1/ellinea/ask
```

3. **Call from your product**

```ts
import { createEllineaClient } from '@ellines-eip/ellinea-sdk';

const ellinea = createEllineaClient({
  baseUrl: 'http://localhost:3002/api/v1',
});

const { answer, grounding } = await ellinea.ask({
  question: 'What needs attention today?',
  summary: yourUemSnapshot, // status: 'synced' + health/alerts/…
  memory: yourOrgNotes,     // [{ id, title, body, updatedAt }]
  role: 'owner',
  organizationName: 'Acme Clinics',
});
```

4. **Or call in-process** (no HTTP)

```ts
import {
  buildEllineaAnswer,
  retrieveEllineaContext,
  formatRagGrounding,
} from '@ellines-eip/ellinea-ai';

const answer = buildEllineaAnswer(question, summary, { memory, useMemory: true });
const chunks = retrieveEllineaContext({ question, summary, memory });
```

## Grounding rules

- Prefer a live **UEM snapshot** (`status: 'synced'`) from connectors or `POST /api/v1/enterprise/ingest`.
- Persist **Enterprise Memory** per tenant (`GET/PUT /api/v1/orgs/me/ellinea-memory`).
- Persist **learning** (feedback + DNA) per tenant (`GET/PUT /api/v1/orgs/me/ellinea-learning`).
- Optional LLM: set `ELLINEA_LLM_API_KEY` (or `OPENAI_API_KEY`) on Cloudflare Pages; Ask falls back to template+RAG.

## Demo path inside EIP

1. Sign in as Owner/IT → Connectors → ingest a BYO snapshot (or sync).
2. Use floating **Ask Ellinea AI** (or full Ask workspace) → add Memory notes → mark recommendations helpful.
3. System Settings → **Ellinea AI** → open **Operator console (API)** → run brief / recommend / Ask API smoke.
4. Confirm Audit shows `enterprise.ingest` / `notify.*` / org learning updates as applicable.

## Tenant isolation

All org-scoped routes bind to the JWT `organizationId`. Never accept a client-supplied org id for Memory or learning writes. LocalStorage keys are also prefixed per org as a cache only.

## What’s deferred

- Full Nest auth on `services/ellinea-ai` (open on localhost for MVP).
- SMTP/Web Push providers (notification outbox sends via Resend/SMTP when Pages secrets are set; otherwise simulated).
- Marketplace packaging of the SDK under a public npm scope.
