# Testing Guide

## Environment Setup

- **Package manager:** `npm`
- **Framework:** Next.js 16 (dev server `npm run dev` on port 3000)
- **Required env vars (for full flow):**
  - `ANTHROPIC_API_KEY` — for `/api/summary` portraits and `/api/generate?source=dynamic` batches. Tests that touch the dynamic branch will fall back to static when this is missing or invalid; E2E tests take advantage of that.
  - Firebase env vars (`NEXT_PUBLIC_FIREBASE_*`) — used by auth/sync. E2E tests operate in guest mode so these aren't required.
- **Database:** none (localStorage + optional Firestore sync). Tests clear `localStorage` before each test.
- **Services:** Anthropic API is the only external dependency; tests mock it via `page.route()` instead of relying on live calls.

## Running Tests

### Unit Tests

Not set up in this project. Prefer integration / E2E coverage for this stack (Next API routes + React state flows).

### Integration Tests

Not set up — `/api/generate` and `/api/summary` are exercised end-to-end via Playwright's `request` fixture from the E2E tests below.

### E2E Tests (Playwright)

- **Command:** `npx playwright test`
- **Setup (once per machine):** `npx playwright install chromium`
- **Base URL:** `http://localhost:3000` (override with `PLAYWRIGHT_BASE_URL`)
- **Location:** `tests/e2e/`
- **Prereq:** `npm run dev` must already be running in another terminal. The config does NOT spawn its own server (the existing `.next/dev/lock` would block a second instance).

Run one file: `npx playwright test tests/e2e/dynamic-batching.spec.ts`
Run with UI: `npx playwright test --ui`
Run headed: `npx playwright test --headed`
Flake check: `npx playwright test --repeat-each=3`

## Debugging Failed Tests

- **Traces:** on failure Playwright writes a trace to `test-results/*/trace.zip`. Open with `npx playwright show-trace test-results/<name>/trace.zip`.
- **Screenshots:** automatic on failure under `test-results/`.
- **Single test by title:** `npx playwright test -g "first chunk is all static"`
