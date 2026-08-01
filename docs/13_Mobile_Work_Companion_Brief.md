# Ellines EIP — Mobile Work Companion (Phase 7 vision)

**Status:** Vision brief done; **7.2 phone shell / PWA stub** is the v1.0-adjacent web deliverable. Native apps remain v1.1+.  
**Stance:** EIP wraps Systems of Record (HIS / ERP / CRM). The phone companion is a **Work Companion**, not a replacement SoR.

## Problem

Owners and permitted employees need day-to-day ops visibility away from the desktop Work Console: who’s working, what’s moving (fleet), what Ellinea recommends, and short summaries — without installing a second enterprise system.

## Product shape

A **phone-first slice** of the Work Console:

| Capability | Source of truth | Companion role |
|------------|-----------------|----------------|
| Fleet / company car status | SoR / GPS connector later | Surface status + Ellinea alerts |
| People directory | UEM people / HR SoR | Read + Owner-scoped actions only |
| Live KPIs & report previews | Sync-backed enterprise summary | Glanceable cards, not full BI |
| Ellinea Ask + recommendations | Same Ellinea APIs as web | Always available on phone |
| Work email summarization | Email connector | Ellinea summarize inbox highlights |

## Access

Same EIP role model: **Owner** plus employees the org permits. No bypass of SoR authority. JWT + org isolation unchanged.

## Out of scope for this brief

- Full native iOS/Android apps in v1.0
- Offline-first sync rewrite
- Multi-company consolidation
- Replacing payroll / fleet / HR systems of record

## Suggested delivery order

1. **Done / shipping:** Responsive PWA shell of Overview + Ask Ellinea (installable web — Phase 7.2)
2. Push notifications (needs VAPID Pages secrets — same as web outbox)
3. People + fleet read surfaces when connectors exist
4. Email summarization on top of the email connector

## Related

- Build queue Phase 7: [05_Build_Queue.md](./05_Build_Queue.md)
- MVP deferral: [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)
- Ellinea surfaces: Ask = float/workspace; Console = Owner/IT operator lab only
