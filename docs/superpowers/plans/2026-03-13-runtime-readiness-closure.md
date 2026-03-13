# Runtime Readiness Closure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully close the remaining runtime readiness gaps by making Mongo outage/recovery transitions deterministic in compose, then updating hardening gate evidence to reflect verified behavior.

**Architecture:** Keep readiness decisioning centralized in `readiness-policy` and shared dependency state, with dependency bootstrap as the single runtime updater. Use strict TDD for each behavior change: add failing tests first, implement minimal code, then verify with targeted compose evidence. Finalize by updating risk and gate docs only after fresh runtime proof.

**Tech Stack:** Node.js, Express, MongoDB driver, Jest, Docker Compose, curl

---

## File Structure Map

### Modify
- `tests/server/health/dependency-bootstrap.test.js` — add missing runtime-transition regression tests around monitor timing and disconnect behavior.
- `src/server/health/dependency-bootstrap.js` — fix root cause(s) in Mongo monitoring path with minimal code changes.
- `docker-compose.yml` — tune monitor interval/timeout env vars for deterministic local compose validation (if needed).
- `docs/superpowers/hardening/compose-validation.md` — replace stale blocked evidence with fresh verified runtime outputs.
- `docs/superpowers/hardening/risk-register.md` — update H-API-001, H-DB-001, H-CQ-001 statuses with new evidence links.
- `docs/superpowers/hardening/verification-matrix.md` — align matrix checks with completed evidence.
- `docs/superpowers/hardening/final-gate-report.md` — re-evaluate gate outcomes after runtime verification.

### Existing reference (read-only unless strictly needed)
- `src/server/api/routes.js`
- `src/server/health/dependency-state.js`
- `src/server/health/readiness-policy.js`
- `src/server/index.js`

---

## Chunk 1: Root-Cause Reproduction + Deterministic Test Harness

### Task 1: Capture reproducible failing runtime evidence for Mongo stop transition

**Files:**
- Modify: `docs/superpowers/hardening/compose-validation.md` (append raw failing baseline section first)

- [ ] **Step 1: Start clean compose stack**

Run:
```bash
docker compose down -v && docker compose up -d --build
```
Expected: all services created and started.

- [ ] **Step 2: Wait for app readiness baseline**

Run:
```bash
docker compose ps
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected: readiness returns HTTP 200 with `ready: true` before outage simulation.

- [ ] **Step 3: Reproduce Mongo outage transition failure exactly**

Run:
```bash
docker compose stop mongo
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected (current failing baseline): transition is incorrect (still 200/ready true, empty reply, or inconsistent payload).

- [ ] **Step 4: Capture app logs during failure window**

Run:
```bash
docker compose logs --since=2m app
```
Expected: capture concrete evidence (timeouts, unhandled rejections, connection errors, or absence of monitor updates).

- [ ] **Step 5: Append baseline failure evidence to compose-validation doc**

Document command output snippets under a dedicated heading:
`## Baseline failing reproduction before fix`

---

### Task 2: Add failing regression tests that model the observed runtime gap

**Files:**
- Modify: `tests/server/health/dependency-bootstrap.test.js`
- Test: `tests/server/health/dependency-bootstrap.test.js`

- [ ] **Step 1: Write failing test for monitor timeout cleanup behavior**

Add test asserting no late/unhandled timeout rejection after a successful ping race.

- [ ] **Step 2: Write failing test for repeated monitor cycle after initial success**

Add test sequence: first ping resolves healthy, second ping hangs/throws, and state must transition to unhealthy.

- [ ] **Step 3: Run RED verification for this file only**

Run:
```bash
npm test -- tests/server/health/dependency-bootstrap.test.js --runInBand
```
Expected: FAIL due missing behavior/cleanup.

- [ ] **Step 4: Verify failure reason is behavioral, not syntax/config**

Expected: parse and module loading are clean; failure points to assertions for new monitor behaviors.

---

## Chunk 2: Minimal Fix in Bootstrap Monitor (TDD GREEN)

### Task 3: Implement the minimal monitor fix for deterministic unhealthy transition

**Files:**
- Modify: `src/server/health/dependency-bootstrap.js`
- Test: `tests/server/health/dependency-bootstrap.test.js`

- [ ] **Step 1: Implement cancel-safe ping timeout race**

In `checkMongoHealth`, replace ad-hoc timeout race with cleanup-safe pattern:
- store timeout handle
- clear timeout in `finally`
- avoid any orphaned rejecting promise

- [ ] **Step 2: Keep state updates immutable and explicit**

Preserve only these transitions:
- success path → `updateSharedDependencyState('mongo', 'healthy')`
- failure path (timeout/error) → `updateSharedDependencyState('mongo', 'unhealthy')`

- [ ] **Step 3: Ensure monitor lifecycle remains single-interval**

Retain `startDependencyReadinessMonitoring` calling `stopDependencyReadinessMonitoring` first; do not add parallel intervals.

- [ ] **Step 4: Run GREEN verification for targeted test file**

Run:
```bash
npm test -- tests/server/health/dependency-bootstrap.test.js --runInBand
```
Expected: PASS including newly added regression tests.

- [ ] **Step 5: Run related health route regression**

Run:
```bash
npm test -- tests/server/routes/health.test.js --runInBand
```
Expected: PASS (no route contract regression).

---

### Task 4: Optional compose tuning for deterministic local monitor checks

**Files:**
- Modify (only if baseline remains flaky): `docker-compose.yml`

- [ ] **Step 1: Add explicit monitor env vars for app service (if missing)**

Set:
- `MONGO_HEALTHCHECK_INTERVAL_MS=1000`
- `MONGO_HEALTHCHECK_TIMEOUT_MS=500`

- [ ] **Step 2: Keep scope minimal**

Do not change unrelated service healthchecks or startup order.

- [ ] **Step 3: Verify compose config remains valid**

Run:
```bash
docker compose config
```
Expected: valid config output.

---

## Chunk 3: Runtime Verification Matrix (Fresh Evidence Only)

### Task 5: Verify full outage/recovery contract in compose

**Files:**
- Modify: `docs/superpowers/hardening/compose-validation.md`

- [ ] **Step 1: Run startup and baseline checks**

Run:
```bash
docker compose down -v && docker compose up -d --build
docker compose ps
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/live
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected:
- live = 200
- ready = 200 with `{ ready: true }`

- [ ] **Step 2: Verify Mongo critical outage transition**

Run:
```bash
docker compose stop mongo
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected: HTTP 503 with `ready: false` and `reasons` containing `mongo`.

- [ ] **Step 3: Verify Mongo recovery transition**

Run:
```bash
docker compose start mongo
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected: HTTP 200 and `ready: true` after recovery window.

- [ ] **Step 4: Re-verify RabbitMQ critical outage contract**

Run:
```bash
docker compose stop rabbitmq
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
docker compose start rabbitmq
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected:
- outage: 503 with `reasons` including `rabbitmq`
- recovery: 200 ready true

- [ ] **Step 5: Re-verify Redis non-critical degraded contract**

Run:
```bash
docker compose stop redis
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
docker compose start redis
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```
Expected:
- outage: 200 with `degraded: true`, `featureImpacts` includes `cache`
- recovery: 200 with `degraded: false`

- [ ] **Step 6: Persist exact command outputs in compose-validation doc**

Update checklist items from unchecked to checked only where evidence exists.

- [ ] **Step 7: Cleanup environment**

Run:
```bash
docker compose down -v
```
Expected: all containers/networks/volumes removed.

---

## Chunk 4: Gate Docs + Final Verification

### Task 6: Update hardening evidence docs and gate statuses

**Files:**
- Modify: `docs/superpowers/hardening/risk-register.md`
- Modify: `docs/superpowers/hardening/verification-matrix.md`
- Modify: `docs/superpowers/hardening/final-gate-report.md`

- [ ] **Step 1: Update risk register closure evidence**

For each open runtime risk (`H-API-001`, `H-DB-001`, `H-CQ-001`), replace stale blocked notes with:
- automated test evidence
- compose runtime evidence paths/snippets
- updated status (Closed/Open) strictly based on evidence

- [ ] **Step 2: Update verification matrix rows**

Map each risk row to completed checks and command outputs from Chunk 3.

- [ ] **Step 3: Recompute gate outcomes**

In `final-gate-report.md`:
- Gate 1: no open P0/P1
- Gate 2: compose startup/recovery validated
- Gate 3: observability baseline operational

- [ ] **Step 4: Set release decision from gate results only**

If any required gate fails, keep NO-GO; otherwise set GO with evidence links.

---

### Task 7: Final regression verification before completion claim

**Files:**
- No file modification expected (verification step)

- [ ] **Step 1: Run focused server regression**

Run:
```bash
npm test -- tests/server --runInBand
```
Expected: PASS.

- [ ] **Step 2: Run coverage (if required by gate criteria)**

Run:
```bash
npm test -- --coverage
```
Expected: PASS with coverage artifacts generated.

- [ ] **Step 3: Verify no stale contradictory statements in docs**

Check that compose/risk/gate docs all reference the same latest evidence.

---

## Plan-level Verification Checklist

- [ ] Root-cause baseline captured before code changes.
- [ ] New failing tests added before monitor implementation changes.
- [ ] Mongo monitor timeout behavior is cancel-safe (no orphaned timeout rejection).
- [ ] Mongo outage transitions readiness to not-ready in compose.
- [ ] Mongo recovery transitions readiness back to ready.
- [ ] RabbitMQ and Redis outage/recovery contracts still pass.
- [ ] Risk register and gate report updated from fresh evidence only.
- [ ] Final verification commands executed before any completion claim.

---

## Review checkpoints

After each chunk:
- run `@superpowers:verification-before-completion`
- run `@superpowers:requesting-code-review`

If either finds gaps, do not mark chunk complete until fixed and re-verified.
