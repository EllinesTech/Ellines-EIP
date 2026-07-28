# Ellinea AI Service

Enterprise Intelligence Engine — the AI layer of Ellines EIP.

## Responsibilities

- Natural language Q&A over enterprise data
- CEO Daily Brief generation
- Explainable recommendations with confidence scores
- Enterprise Memory (document + decision storage)
- Context engine (role, org, Enterprise DNA-aware)
- RAG pipeline over connected data and memory

## Port

`3003` (default)

## Core Capabilities (v1.0)

| Capability | Description |
|-----------|-------------|
| NL Q&A | Ask questions about enterprise data in plain language |
| Daily Brief | Automated morning executive summary |
| Recommendations | Explainable insights with evidence + confidence |
| Enterprise Memory | Store and retrieve policies, decisions, documents |
| Context Engine | Role and org-aware response tailoring |

## Example Queries

```
"How are all my businesses performing today?"
"Summarize yesterday's critical alerts."
"Which branches need immediate attention?"
"Generate this week's executive report."
```

## AI Governance

- All recommendations include evidence and confidence score
- Sensitive actions require human approval
- Every AI action logged in Audit Center
- Customer data never leaves their environment (configurable)

## Status

🔲 Not yet implemented — Phase 4 (Priority P0)
