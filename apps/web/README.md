# Ellines EIP — Web

Executive dashboard and public surface for **Ellines EIP**, live at [eip.ellines.co.ke](https://eip.ellines.co.ke).

## Stack

- Next.js 15 (static export) + React 19 + TypeScript
- Hosted on Cloudflare Pages (`ellines-eip`)

## Local

```bash
# from repo root
npm run dev:web
```

Open [http://localhost:3100](http://localhost:3100).

## Deploy

Pushes to `main` deploy via `.github/workflows/deploy-pages.yml`.

Manual:

```bash
npm run deploy:pages
```

Custom domain: `eip.ellines.co.ke`
