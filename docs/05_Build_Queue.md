# Ellines EIP — Build Queue (Agent Worklist)

**Product:** Ellines EIP v1.0 Foundation
**Authoritative scope:** [02_MVP_Scope_v1.0.md](./02_MVP_Scope_v1.0.md)
**Status key:** `done` · `in_progress` · `next` · `blocked` · `todo`

Cloud Agents and Automations **must pick the first `next` item** (or continue an `in_progress` item), implement it, update status in this file, **verify → build → push `main` (deploy)**, then **immediately start the next `next` item**. Do not stop to ask the human between items.

### Continuous agent loop (mandatory)

```
while queue has next/in_progress and not blocked:
  1. Implement the item (one scoped slice)
  2. Update this file (mark done; set following item to next)
  3. npm run verify:pages-functions   # if Functions touched
  4. npm run build:shared             # if shared touched
  5. npm run build -w @ellines-eip/web
  6. identity build if identity touched
  7. git commit + git push origin main   # Pages deploys from Actions
  8. Start step 1 on the new next item — DO NOT ASK
```

**Stop only if:** item is `blocked`, secrets missing, or a build you cannot fix after a genuine attempt. Never pause for "should I continue?" — the answer is always yes until blocked.

Completed items are removed from this file once shipped (kept in git history / commit log, not duplicated here). v1.0, v1.1 multi-company, and the Track A–E parallel tracks (Connectors, BI Dashboards, Autonomous Workflows, Advanced RBAC, OAuth2/SAML SSO) are all **100% complete and live** at [eip.ellines.co.ke](https://eip.ellines.co.ke).

For the v2.0 backlog (native mobile, multi-region, governance/ABAC UI, infra scaling), see [18_v2.0_Build_Queue.md](./18_v2.0_Build_Queue.md).

---

## Remaining work

| ID | Item | Status | Notes |
|----|------|--------|-------|
| E.9 | Testing: Mock IdP + real Azure AD / Okta / ADFS | `blocked` | Mock IdP server for local testing is ready and passing. Real external IdP testing needs actual Azure AD / Okta / ADFS test tenants and credentials — out of agent scope; needs a human to provision test tenants. |

Nothing else is outstanding in v1.0 scope.

---

## Agent run protocol

1. Read `AGENTS.md` and this queue (especially **Continuous agent loop**).
2. Take the highest-priority `next` (or continue `in_progress`).
3. Implement + verify + build.
4. Update this file; set the following item to `next`.
5. Commit and push `main` (Pages deploys). Never force-push. Never commit secrets.
6. **Immediately** go to step 2 for the next item — do not ask the human.
7. Stop only when blocked or the queue has no `next` / `in_progress`.
8. Humans: `git pull origin main` to match what shipped.

Automation prompt: [06_Automation_Prompt.md](./06_Automation_Prompt.md)
Demo login: [07_Demo_Login.md](./07_Demo_Login.md)
Live Identity: [08_Live_Identity_Setup.md](./08_Live_Identity_Setup.md)
Access layers: [09_Access_Layers.md](./09_Access_Layers.md)
