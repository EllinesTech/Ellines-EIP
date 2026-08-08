# Troubleshooting Report — Ellines EIP
**Date:** 2026-08-08  
**Issue:** Website not loading (404 errors for static assets on live site)

## Summary

The issue reported had two components:

1. **Local development** — Dev servers were not running
2. **Production deployment** — Live site (eip.ellines.co.ke) returning 404 errors for `_next/static/*` files

## Resolution Status

### ✅ Local Development — FIXED

**Problem:** Dev servers were not running, causing 404s at http://localhost:3100/app/

**Solution Applied:**
1. Rebuilt shared packages: `npm run build:shared`
2. Rebuilt web application: `npm run build -w @ellines-eip/web`
3. Started identity service: `npm run dev:identity` (running on port 3001)
4. Started web application: `npm run dev:web` (running on port 3100)

**Current Status:**
- ✅ Identity service: http://localhost:3001 (health check: OK)
- ✅ Web app: http://localhost:3100 (responding: 200 OK)
- ✅ PostgreSQL 18 service: Running (postgresql-x64-18)
- ✅ Database: Connected to Supabase (configured in .env)

### ⚠️ Production Deployment — REQUIRES ACTION

**Problem:** Live site showing 404 errors for static assets (CSS, JS files from `_next/static/`)

**Root Cause:** The error messages indicate Cloudflare Pages is returning HTML (404 page) instead of the actual static files. This suggests either:
1. The last GitHub Actions deployment didn't complete successfully
2. Cloudflare Pages cache is stale
3. The static files weren't uploaded during deployment

**Evidence:**
- Local build output exists: `apps/web/out/` contains all static files including `_next/static/`
- Build completed successfully locally (55 pages generated)
- Git status: clean, up to date with origin/main
- Last commit: `163705b feat(reports): Add report history & re-send (B.2.4)`

**Recommended Actions:**

#### Option 1: Trigger New Deployment via Git (Recommended)
```bash
# Create an empty commit to trigger GitHub Actions
git commit --allow-empty -m "chore: retrigger deployment"
git push origin main
```

#### Option 2: Manual Deployment via Wrangler
```bash
npm run deploy:pages
```

#### Option 3: Check GitHub Actions
1. Go to: https://github.com/[your-repo]/actions
2. Check the "Deploy Cloudflare Pages" workflow
3. Look for failed deployments on recent commits
4. Re-run failed workflows if needed

#### Option 4: Cloudflare Pages Dashboard
1. Log in to Cloudflare dashboard
2. Go to Pages → ellines-eip project
3. Check deployment history
4. Trigger manual deployment if needed
5. Clear cache/purge if deployment succeeded but site still shows 404s

## Technical Details

### Database Configuration
The system is currently configured to use **Supabase** (not local database):
- Connection: Session pooler at `aws-1-eu-west-2.pooler.supabase.com:5432`
- Mode: `sslmode=require` with 30s timeout
- Local PostgreSQL 18 is installed but not used by the application

### Build Configuration
- Production build: Static export enabled (`output: 'export'`)
- Output directory: `apps/web/out/` (55 pages + static assets)
- Build ID: `KX-m2wJ9AOWQeCRU_zQu5` (visible in local build)

### Deployment Pipeline
- CI/CD: GitHub Actions (`.github/workflows/deploy-pages.yml`)
- Target: Cloudflare Pages (project: ellines-eip)
- Wrangler version: 3.96.0 (pinned for stability)
- Node.js version: 22.11.0 LTS

## Template Picker Implementation

**Status:** ✅ Already Implemented

The reports page (`apps/web/src/app/app/reports/page.tsx`) already includes a fully functional template picker UI:
- Template dropdown with all available templates from `REPORT_TEMPLATES`
- Auto-updates title when template changes
- Templates include: executive, financial, operational, inventory, hr, custom

No additional work needed on this feature.

## Next Steps

1. **Immediate:** Choose one of the deployment options above to fix the live site
2. **Monitor:** Check GitHub Actions workflow status after push
3. **Verify:** Once deployment completes, test https://eip.ellines.co.ke/app/
4. **Optional:** If issues persist, check Cloudflare Pages logs and build output

## Notes

- Local development environment is fully operational
- No code changes needed — this is a deployment/hosting issue
- The user mentioned trying to "change database to local and hybrid" but the .env file shows Supabase is still the primary database
- All TypeScript builds pass without errors
- 76 Pages Functions verified successfully
