# Ellinea AI service (Phase 6.1)

Standalone Nest stub that packages Ellinea reasoning for reuse outside the Work Console.

## Package

Core engine lives in `@ellines-eip/ellinea-ai` (`packages/ellinea-ai`):

- Q&A / daily brief / recommendations
- Enterprise Memory helpers
- DNA + learning signals
- Local RAG retrieval

## Run

```bash
npm run build -w @ellines-eip/ellinea-ai
npm run build -w @ellines-eip/ellinea-service
npm run start -w @ellines-eip/ellinea-service
```

Health: `http://localhost:3002/api/v1/health`  
Ask: `POST /api/v1/ellinea/ask` with `{ question, summary?, memory? }`

The live web app still uses same-origin Pages Functions for Memory + optional LLM; this service is the extractable brain for other Ellines products.
