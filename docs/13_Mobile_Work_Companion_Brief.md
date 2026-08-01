# Ellines EIP — Mobile Work Companion (Phase 7 vision)

**Status:** Vision + web companion slices (7.1–7.8) shipped as installable PWA Work Console. Native apps remain future.  
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

## Auth

- Work Console routes use the signed-in org JWT (same role model as desktop).
- Owner/IT may hide the Ask float from work roles via System Settings (`eip_org_ui_policy`).
- Ellinea Console remains Owner/IT only.

## Out of scope for this brief

- Full native iOS/Android apps in v1.0
- Offline-first sync rewrite
- Multi-company consolidation
- Replacing payroll / fleet / HR systems of record

## Suggested delivery order

1. **Done:** Responsive PWA shell + Ask Ellinea (7.2)
2. **Done (web stubs):** Fleet, People, Glance KPIs/reports, Ellinea mobile recs, Inbox summary CTA (7.3–7.7)
3. Push notifications go live when VAPID Pages secrets are set (same as web outbox)
4. Deeper GPS / mail intelligence when connectors publish richer UEM

## Related

- Build queue Phase 7: [05_Build_Queue.md](./05_Build_Queue.md)
- MVP deferral: [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)
- Ellinea surfaces: Ask = float/workspace; Console = Owner/IT operator lab only
