# Test Coverage Status — Ellines EIP

**Generated:** 2026-08-09  
**Status:** Test infrastructure implemented, coverage tracking active

## Summary

Test coverage is **implemented and operational** across the Ellines EIP monorepo. Three workspaces have Jest configured with coverage thresholds:

| Workspace | Tests | Coverage | Status |
|-----------|-------|----------|--------|
| **@ellines-eip/identity** | 211 passing | 33.99% statements | ✅ Passing |
| **@ellines-eip/shared** | 29 passing | 91.48% statements | ✅ Excellent |
| **@ellines-eip/web** | 4 passing, 2 failing | 1.21% statements | ⚠️ Needs work |

## Detailed Coverage

### Identity Service (`services/identity`)

**Overall Coverage:**
- **Statements:** 33.99%
- **Branches:** 26.71%
- **Functions:** 36.41%
- **Lines:** 34.17%

**Test Suites:** 15 passed  
**Total Tests:** 211 passed  
**Time:** 103.6s

**Well-Covered Modules:**
- `encryption.service` — 87.82% statements, 82.35% functions
- `auth.service` — 93.93% statements, 81.81% functions
- `all-exceptions.filter` — 87.27% statements, 100% functions
- `rate-limit.service` — 95.91% statements, 100% functions
- `rbac.service` — 83.07% statements, 66.66% functions
- `orgs.service` — 47.27% statements, 69.56% functions

**Modules Needing Coverage:**
- Controllers (explicitly excluded from coverage collection)
- DTOs (explicitly excluded from coverage collection)
- Decorators (explicitly excluded from coverage collection)
- Strategies (explicitly excluded from coverage collection)
- Connector implementations (0% coverage)
- Webhook implementations (0% coverage)
- Notification implementations (0% coverage)

**Coverage Threshold:** 5% (intentionally low threshold for MVP phase)

**Test Configuration:**
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 5,
      "functions": 5,
      "lines": 5,
      "statements": 5
    }
  }
}
```

### Shared Package (`packages/shared`)

**Overall Coverage:**
- **Statements:** 91.48%
- **Branches:** 85.16%
- **Functions:** 100%
- **Lines:** 100%

**Test Suites:** 1 passed  
**Total Tests:** 29 passed  
**Time:** 8.5s

**Tested Features:**
- ✅ `emptyUemCounts` — returns all-zero counts
- ✅ `normalizeUemModel` — handles explicit counts, nested models, string coercion
- ✅ `packTimelineStorage` / `unpackTimelineStorage` — event serialization
- ✅ `inferUemFromMetrics` — metrics mapping to UEM counts
- ✅ `UEM_OBJECT_KINDS` — constant validation

**Coverage Notes:**
- Excellent coverage on core UEM (Unified Event Model) utilities
- 100% function coverage
- Only minor gaps in edge-case branches (85.16%)

### Web App (`apps/web`)

**Overall Coverage:**
- **Statements:** 1.19% ⚠️
- **Branches:** 0.46% ⚠️
- **Functions:** 1.25% ⚠️
- **Lines:** 1.35% ⚠️

**Test Suites:** 1 passed  
**Total Tests:** 6 passed  
**Time:** 16.6s

**Coverage Threshold (Not Met):**
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 40,
      "functions": 50,
      "lines": 50,
      "statements": 50
    }
  }
}
```

**Test Status:**
- ✅ `functions/api/v1/auth/__tests__/login.spec.ts` — 6 tests (all passing)
  - ✅ should reject GET requests
  - ✅ should reject invalid JSON
  - ✅ should reject missing email
  - ✅ should reject invalid email format
  - ✅ should reject short password
  - ✅ should reject oversized payloads

**Note:** Two API endpoint files (`functions/api/v1/orgs/me/sso-providers/[id]/test.ts` and `functions/api/v1/connectors/installations/[id]/test.ts`) are named `test.ts` but are actual endpoint implementations, not test files. They've been excluded from Jest using `testPathIgnorePatterns` to prevent false "empty test suite" failures.

**Modules Covered (Minimal):**
- Only `login.spec.ts` has active tests
- Cloudflare Pages Functions are mostly untested
- Front-end React components have no tests

**Action Required:**
- Add tests for Cloudflare Pages Functions (register, logout, org management, connectors)
- Add tests for React components (Command Center, dashboards, etc.)
- Consider lowering coverage thresholds temporarily (currently set to 50% statements, not met)

## Running Tests

### Run all tests with coverage:
```bash
npm run test:coverage
```

### Run specific workspace tests:
```bash
# Identity service
npm run test:coverage -w @ellines-eip/identity

# Shared package
npm run test:coverage -w @ellines-eip/shared

# Web app
npm run test:coverage -w @ellines-eip/web
```

### Run tests in watch mode:
```bash
# Identity service
npm run test:watch -w @ellines-eip/identity

# Web app
npm run test:watch -w @ellines-eip/web
```

## Test Infrastructure

### Identity Service (`services/identity/package.json`)

**Test Scripts:**
- `npm run test` — Run all tests
- `npm run test:watch` — Run tests in watch mode
- `npm run test:coverage` — Run tests with coverage report

**Configuration:**
- **Framework:** Jest + ts-jest
- **Environment:** Node.js
- **Coverage output:** `services/identity/coverage/`
- **Test pattern:** `*.spec.ts`
- **Excluded from coverage:** Controllers, DTOs, decorators, strategies, main.ts, index.ts

### Shared Package (`packages/shared/package.json`)

**Test Scripts:**
- `npm run test` — Run all tests
- `npm run test:coverage` — Run tests with coverage report

**Configuration:**
- **Framework:** Jest + ts-jest
- **Environment:** Node.js
- **Coverage output:** `packages/shared/coverage/`
- **Test patterns:** `*.spec.ts`, `*.test.ts`
- **Excluded from coverage:** `src/index.ts`

### Web App (`apps/web/package.json`)

**Test Scripts:**
- `npm run test` — Run all tests
- `npm run test:watch` — Run tests in watch mode
- `npm run test:coverage` — Run tests with coverage report

**Configuration:**
- **Framework:** Jest + ts-jest
- **Environment:** Node.js (should be jsdom for React components)
- **Coverage output:** `apps/web/coverage/`
- **Test patterns:** `*.spec.ts`, `*.test.ts`
- **Test roots:** `functions/`, `src/`

## Coverage Reports

After running `npm run test:coverage`, detailed HTML reports are available at:

- **Identity:** `services/identity/coverage/lcov-report/index.html`
- **Shared:** `packages/shared/coverage/lcov-report/index.html`
- **Web:** `apps/web/coverage/lcov-report/index.html`

## Recommendations

### Completed ✅:
1. ~~**Fix failing web tests**~~ — ✅ Fixed! Updated assertions in `login.spec.ts` and improved error handling in `login.ts` to return proper 413 status for oversized payloads
2. ~~**Handle empty test files**~~ — ✅ Fixed! Added `testPathIgnorePatterns` to Jest config to exclude API endpoint files named `test.ts`

### Immediate Actions:
1. **Add critical path tests** for web Functions:
   - Auth endpoints (register, logout, token refresh)
   - Org management endpoints
   - Connector installation endpoints
2. **Improve identity service coverage** for:
   - Connector implementations (SQL, REST, SFTP)
   - Webhook handlers
   - Notification handlers

### Short-term (v1.0):
1. **Add React component tests** using React Testing Library
2. **Add end-to-end tests** using Playwright or Cypress for critical user flows
3. **Consider adjusting web coverage thresholds** — Current 50% threshold is aspirational; consider lowering to 10-20% for MVP

### Long-term (v1.1+):
1. **Increase coverage thresholds** gradually:
   - Identity: 5% → 50%
   - Web: 1.19% → 50% (aspirational target)
2. **Add integration tests** for:
   - Database operations
   - External system connectors
   - Email/push notifications

## CI/CD Integration

Tests are **not currently blocking deployments**. The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) does not include a test step.

**Recommended addition to CI:**
```yaml
- name: Run tests
  run: npm run test:coverage
  
- name: Upload coverage reports
  uses: codecov/codecov-action@v3
  with:
    files: ./services/identity/coverage/lcov.info,./packages/shared/coverage/lcov.info,./apps/web/coverage/lcov.info
```

## Notes

- **Coverage is intentionally low during MVP phase** — Focus is on rapid feature delivery
- **Identity service has good test foundation** — Core services (auth, rbac, encryption) are well-tested
- **Shared package is exemplary** — 91% coverage, all functions tested
- **Web app needs attention** — Only 1.19% coverage, minimal tests (but login tests now passing!)
- **No performance/load tests** — Current tests focus on unit/integration only
- **No security-specific tests** — Auth logic is tested, but no dedicated security test suite

## Related Documentation

- Jest configuration: `services/identity/package.json`, `packages/shared/package.json`, `apps/web/jest.config.ts`
- Test files: `**/*.spec.ts`, `**/*.test.ts`
- Coverage reports: `*/coverage/lcov-report/index.html`
