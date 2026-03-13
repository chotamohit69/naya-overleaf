# Core MVP Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing Naya Overleaf MVP for stable small-compose deployment by closing scoped P0/P1 risks, implementing dependency-aware health/recovery contracts, and establishing a minimum observability baseline.

**Architecture:** Introduce a single health/readiness contract driven by shared dependency state and criticality policy, then harden high-risk runtime paths (DB, realtime, compile API/worker) under TDD. Add structured logs, correlation IDs, baseline metrics, and threshold hooks; validate startup/recovery behavior in Docker Compose with evidence captured in hardening artifacts.

**Tech Stack:** Node.js, Express, MongoDB, Redis, RabbitMQ, ShareDB, Jest, Docker Compose

---

## File Structure Map

### Create
- `docker-compose.yml` — small multi-service deployment with healthchecks/restart behavior for app, worker, mongo, redis, rabbitmq.
- `src/server/health/dependency-state.js` — centralized dependency health state (Mongo/Redis/RabbitMQ), immutable update helpers.
- `src/server/health/readiness-policy.js` — service dependency criticality matrix and readiness evaluator.
- `src/server/observability/correlation.js` — request correlation ID middleware and propagation helper.
- `src/server/observability/logger.js` — structured JSON logging wrapper.
- `src/server/observability/metrics.js` — in-process counters/timers and exposure helpers.
- `src/server/observability/alerts.js` — threshold evaluator for default alert conditions.
- `tests/server/routes/health.test.js` — liveness/readiness contract tests.
- `tests/server/routes/internal-health.test.js` — internal health contract tests.
- `tests/server/db/connection.readiness.test.js` — Mongo failure/recovery readiness tests.
- `tests/server/realtime/sharedb-connection.timeout.test.js` — bounded wait/failure budget tests.
- `tests/server/auth/keycloak-config.production.test.js` — production secret/session hardening tests.
- `tests/server/controllers/compilation.reliability.test.js` — queue-unavailable and enqueue contract tests.
- `tests/server/compiler/worker.reliability.test.js` — bounded retry and terminal-state tests.
- `tests/server/observability/correlation.test.js` — correlation ID behavior tests.
- `tests/server/observability/logger.test.js` — structured logger schema tests.
- `tests/server/observability/metrics.test.js` — baseline metrics/alert threshold tests.
- `docs/superpowers/hardening/risk-register.md` — P0/P1/P2 register and closure evidence.
- `docs/superpowers/hardening/verification-matrix.md` — risk-to-check mapping.
- `docs/superpowers/hardening/compose-validation.md` — startup/recovery validation evidence.
- `docs/superpowers/hardening/observability-baseline.md` — logs/metrics/alerts evidence.

### Modify
- `src/server/index.js` — register correlation/logging/metrics middleware and readiness wiring.
- `src/server/api/routes.js` — replace static health route with liveness/readiness routes.
- `src/server/routes/internalRoutes.js` — align internal health route with readiness policy.
- `src/server/db/connection.js` — stop unconditional process exit; publish dependency state transitions.
- `src/server/auth/keycloak-config.js` — enforce production-safe session secret behavior.
- `src/server/realtime/sharedb-connection.js` — bounded DB wait and explicit init timeout behavior.
- `src/server/api/controllers/compilation.js` — explicit queue-unavailable contract and safer job enqueue behavior.
- `src/server/compiler/worker.js` — bounded retries and terminal failure handling.
- `src/server/compiler/docker.js` — deterministic cleanup/error classification instrumentation.
- `tests/setup.js` — add stable env defaults for new health/observability tests only if required.

### Existing Tests to Run Continuously
- `tests/server/controllers/projects.test.js`
- `tests/server/controllers/documents.test.js`
- `tests/server/controllers/compilation.test.js`
- `tests/server/auth/dev-auth.test.js`

---

## Chunk 1: Governance + Health/Readiness Foundation

### Task 1: Create hardening governance artifacts

**Files:**
- Create: `docs/superpowers/hardening/risk-register.md`
- Create: `docs/superpowers/hardening/verification-matrix.md`
- Test: N/A (documentation evidence gate)

- [ ] **Step 1: Create risk register template with scoped fields**

Add markdown table with columns:
`Risk ID | Severity (P0/P1/P2) | Surface | Category | Description | Repro Condition | Expected Behavior | Owner | Remediation PR | Verification Evidence | Gate Impact | Status`

- [ ] **Step 2: Create verification matrix template**

Add markdown table with columns:
`Risk ID | Required Checks | Automated Test Path | Manual Check | Alert/Metric Evidence | Gate`

- [ ] **Step 3: Seed initial known risks from approved design**

Seed at least these IDs with severity, owner placeholder, and gate impact:
- `H-API-001` static health endpoint
- `H-DB-001` Mongo exit-on-failure behavior
- `H-RT-001` unbounded ShareDB wait
- `H-CQ-001` compile queue unavailable still returns queued
- `H-OBS-001` missing structured logs/metrics baseline

- [ ] **Step 4: Verify docs exist and are readable**

Run: `ls docs/superpowers/hardening`
Expected: shows `risk-register.md` and `verification-matrix.md`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/hardening/risk-register.md docs/superpowers/hardening/verification-matrix.md
git commit -m "docs: add hardening risk register and verification matrix"
```

---

### Task 2: Implement dependency state and readiness policy modules

**Files:**
- Create: `src/server/health/dependency-state.js`
- Create: `src/server/health/readiness-policy.js`
- Test: `tests/server/routes/health.test.js`

- [ ] **Step 1: Write failing tests for dependency state transitions and readiness evaluation**

```js
it('returns not-ready for app when a critical dependency for app is unhealthy', () => {
  const state = { mongo: 'healthy', rabbitmq: 'unhealthy', redis: 'healthy' };
  const result = evaluateReadiness(state, 'app');
  expect(result.ready).toBe(false);
  expect(result.reasons).toContain('rabbitmq');
});

it('returns degraded-ready for app when only non-critical dependencies for app are unhealthy', () => {
  const state = { mongo: 'healthy', rabbitmq: 'healthy', redis: 'unhealthy' };
  const result = evaluateReadiness(state, 'app');
  expect(result.ready).toBe(true);
  expect(result.degraded).toBe(true);
  expect(result.featureImpacts).toContain('cache');
});

it('returns not-ready for worker when a worker-critical dependency is unhealthy', () => {
  const state = { mongo: 'healthy', rabbitmq: 'unhealthy', redis: 'healthy' };
  const result = evaluateReadiness(state, 'worker');
  expect(result.ready).toBe(false);
  expect(result.reasons).toContain('rabbitmq');
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm test -- tests/server/routes/health.test.js -t "critical dependencies"`
Expected: FAIL because evaluator/module does not exist

- [ ] **Step 3: Write minimal implementation**

Implement:
- immutable dependency snapshot updates
- service-scoped dependency criticality matrix (at minimum `app` and `worker`)
- `evaluateReadiness(state, serviceName)` that returns `{ ready, degraded, reasons, featureImpacts }`

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/routes/health.test.js`
Expected: PASS for readiness evaluator cases

- [ ] **Step 5: Commit**

```bash
git add src/server/health/dependency-state.js src/server/health/readiness-policy.js tests/server/routes/health.test.js
git commit -m "feat: add dependency-state and readiness policy foundation"
```

---

### Task 3: Replace static health route with live/ready contracts

**Files:**
- Modify: `src/server/api/routes.js`
- Modify: `src/server/routes/internalRoutes.js`
- Modify: `src/server/index.js`
- Test: `tests/server/routes/health.test.js`
- Test: `tests/server/routes/internal-health.test.js`

- [ ] **Step 1: Write failing API liveness/readiness route tests**

```js
it('GET /api/health/live returns 200', async () => {
  const res = await request(app).get('/api/health/live');
  expect(res.status).toBe(200);
});

it('GET /api/health/ready returns 503 when critical dependency is down', async () => {
  mockReadiness({ ready: false, degraded: false, reasons: ['mongo'], featureImpacts: [] });
  const res = await request(app).get('/api/health/ready');
  expect(res.status).toBe(503);
  expect(res.body).toEqual(expect.objectContaining({
    ready: false,
    reasons: expect.arrayContaining(['mongo'])
  }));
});

it('GET /api/health/ready returns 200 degraded with feature impact when only non-critical dependency is down', async () => {
  mockReadiness({ ready: true, degraded: true, reasons: [], featureImpacts: ['cache'] });
  const res = await request(app).get('/api/health/ready');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.objectContaining({
    ready: true,
    degraded: true,
    featureImpacts: expect.arrayContaining(['cache'])
  }));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/routes/health.test.js tests/server/routes/internal-health.test.js`
Expected: FAIL because routes do not exist yet

- [ ] **Step 3: Implement minimal routes**

Add:
- `/api/health/live` (process liveness only)
- `/api/health/ready` using readiness evaluator output (`ready`, `degraded`, `reasons`, `featureImpacts`)
- internal health endpoint aligned to the same readiness evaluator and response contract

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/routes/health.test.js tests/server/routes/internal-health.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routes.js src/server/routes/internalRoutes.js src/server/index.js tests/server/routes/health.test.js tests/server/routes/internal-health.test.js
git commit -m "feat: add liveness and readiness health contracts"
```

---

## Chunk 2: Stability Hardening in Critical Runtime Paths

### Task 4: Harden Mongo connection behavior for readiness (no forced process exit)

**Files:**
- Modify: `src/server/db/connection.js`
- Test: `tests/server/db/connection.readiness.test.js`
- Test: `tests/server/routes/health.test.js`

- [ ] **Step 1: Write failing Mongo failure/recovery tests**

```js
it('marks mongo unhealthy on connect failure without exiting process', async () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit should not be called');
  });

  await expect(connect()).rejects.toThrow();
  expect(getDependencyState().mongo).toBe('unhealthy');
  expect(exitSpy).not.toHaveBeenCalled();

  exitSpy.mockRestore();
});

it('marks mongo healthy after successful reconnect', async () => {
  await connect();
  expect(getDependencyState().mongo).toBe('healthy');
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/db/connection.readiness.test.js`
Expected: FAIL against current exit-on-error behavior

- [ ] **Step 3: Implement minimal behavior change**

- remove `process.exit(1)` path
- publish state transitions through dependency-state module

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/db/connection.readiness.test.js tests/server/routes/health.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/db/connection.js tests/server/db/connection.readiness.test.js tests/server/routes/health.test.js
git commit -m "fix: make mongo failures drive readiness instead of process exit"
```

---

### Task 5: Bound ShareDB initialization wait and fail clearly on timeout

**Files:**
- Modify: `src/server/realtime/sharedb-connection.js`
- Modify: `src/server/index.js`
- Test: `tests/server/realtime/sharedb-connection.timeout.test.js`

- [ ] **Step 1: Write failing timeout/failure budget tests**

```js
it('fails initialization after timeout when db never becomes ready', async () => {
  await expect(initializeShareDB({ timeoutMs: 500 })).rejects.toMatchObject({
    code: 'SHAREDB_INIT_TIMEOUT'
  });
});

it('succeeds when db becomes ready before timeout', async () => {
  mockDbReadyAfter(100);
  await expect(initializeShareDB({ timeoutMs: 500 })).resolves.toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/realtime/sharedb-connection.timeout.test.js`
Expected: FAIL because current code has unbounded wait

- [ ] **Step 3: Implement minimal timeout budget**

Add bounded wait logic with a default timeout budget and explicit typed timeout error (`code: 'SHAREDB_INIT_TIMEOUT'`). In `src/server/index.js`, handle ShareDB init timeout by updating dependency/readiness state (not-ready for affected surface) instead of hanging startup indefinitely.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/realtime/sharedb-connection.timeout.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/realtime/sharedb-connection.js src/server/index.js tests/server/realtime/sharedb-connection.timeout.test.js
git commit -m "fix: add bounded timeout for sharedb initialization"
```

---

### Task 6: Enforce production-safe session secret/auth defaults

**Files:**
- Modify: `src/server/auth/keycloak-config.js`
- Test: `tests/server/auth/keycloak-config.production.test.js`
- Test: `tests/server/auth/dev-auth.test.js`

- [ ] **Step 1: Write failing production secret tests**

```js
it('rejects production startup when SESSION_SECRET is missing', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.SESSION_SECRET;
  expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
});

it('rejects production startup when SESSION_SECRET is empty', () => {
  process.env.NODE_ENV = 'production';
  process.env.SESSION_SECRET = '';
  expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
});

it('rejects production startup when SESSION_SECRET uses insecure default value', () => {
  process.env.NODE_ENV = 'production';
  process.env.SESSION_SECRET = 'naya-overleaf-secret';
  expect(() => requireConfigFresh()).toThrow(/SESSION_SECRET/);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/auth/keycloak-config.production.test.js`
Expected: FAIL because fallback secret currently allowed

- [ ] **Step 3: Implement minimal hardening**

Require explicit, non-empty, non-default `SESSION_SECRET` in production while preserving existing development-mode behavior.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/auth/keycloak-config.production.test.js tests/server/auth/dev-auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auth/keycloak-config.js tests/server/auth/keycloak-config.production.test.js tests/server/auth/dev-auth.test.js
git commit -m "fix: enforce production session secret requirements"
```

---

## Chunk 3: Compile Path Reliability + Observability Baseline

### Task 7: Harden compile enqueue contract when RabbitMQ is unavailable

**Files:**
- Modify: `src/server/api/controllers/compilation.js`
- Test: `tests/server/controllers/compilation.reliability.test.js`
- Test: `tests/server/controllers/compilation.test.js`

- [ ] **Step 1: Write failing queue-unavailable behavior tests**

```js
it('does not return queued when rabbitmq channel is unavailable', async () => {
  mockQueueUnavailable();
  await compileDocument(req, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/queue/i) }));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/controllers/compilation.reliability.test.js`
Expected: FAIL because current flow can return queued without enqueue

- [ ] **Step 3: Implement minimal contract fix**

Return explicit failure/temporary unavailable response when enqueue cannot occur; keep successful path unchanged.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/controllers/compilation.reliability.test.js tests/server/controllers/compilation.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/api/controllers/compilation.js tests/server/controllers/compilation.reliability.test.js tests/server/controllers/compilation.test.js
git commit -m "fix: enforce explicit compile enqueue failure contract"
```

---

### Task 8: Bound worker retries and enforce terminal failure state

**Files:**
- Modify: `src/server/compiler/worker.js`
- Modify: `src/server/compiler/docker.js`
- Test: `tests/server/compiler/worker.reliability.test.js`

- [ ] **Step 1: Write failing retry/terminal-state tests**

```js
it('marks job failed after max retry attempts', async () => {
  await processMessageThatAlwaysFails();
  expect(updateJobStatus).toHaveBeenCalledWith(expect.any(String), 'failed', expect.any(Object));
});

it('does not requeue infinitely after max attempts', async () => {
  await processMessageThatAlwaysFails();
  expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/compiler/worker.reliability.test.js`
Expected: FAIL because current behavior requeues indefinitely on error

- [ ] **Step 3: Implement minimal bounded retry logic**

Add attempt counting via message headers/payload, transition to terminal failed state after threshold, and enforce deterministic cleanup for failed compile runs (temporary artifacts/containers) before final status update.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/compiler/worker.reliability.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/compiler/worker.js src/server/compiler/docker.js tests/server/compiler/worker.reliability.test.js
git commit -m "fix: add bounded worker retries and terminal failure handling"
```

---

### Task 9: Add structured logging and correlation IDs

**Files:**
- Create: `src/server/observability/correlation.js`
- Create: `src/server/observability/logger.js`
- Modify: `src/server/index.js`
- Modify: `src/server/api/controllers/compilation.js`
- Modify: `src/server/compiler/worker.js`
- Test: `tests/server/observability/correlation.test.js`
- Test: `tests/server/observability/logger.test.js`

- [ ] **Step 1: Write failing schema/correlation tests**

```js
it('logger emits required structured fields', () => {
  const event = logInfo('message', { component: 'api', errorClass: 'NONE' });
  expect(event).toEqual(expect.objectContaining({
    timestamp: expect.any(String),
    level: 'info',
    service: expect.any(String),
    component: 'api',
    correlationId: expect.any(String),
    message: 'message',
    errorClass: expect.any(String)
  }));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/observability/correlation.test.js tests/server/observability/logger.test.js`
Expected: FAIL because modules are missing

- [ ] **Step 3: Implement minimal middleware/wrapper**

- generate or propagate correlation ID from request headers
- propagate correlation ID across compile enqueue -> worker message headers/payload
- emit structured logs through wrapper with required fields: timestamp, level, service, component, correlationId, message, errorClass

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/observability/correlation.test.js tests/server/observability/logger.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/observability/correlation.js src/server/observability/logger.js src/server/index.js src/server/api/controllers/compilation.js src/server/compiler/worker.js tests/server/observability/correlation.test.js tests/server/observability/logger.test.js
git commit -m "feat: add structured logging and correlation id propagation"
```

---

### Task 10: Add metrics baseline and default alert threshold evaluator

**Files:**
- Create: `src/server/observability/metrics.js`
- Create: `src/server/observability/alerts.js`
- Modify: `src/server/api/routes.js`
- Modify: `src/server/index.js`
- Test: `tests/server/observability/metrics.test.js`

- [ ] **Step 1: Write failing metrics/alert tests**

```js
it('exposes baseline metrics snapshot', () => {
  const snapshot = getMetricsSnapshot();
  expect(snapshot).toEqual(expect.objectContaining({
    liveness: expect.any(Object),
    readiness: expect.any(Object),
    api: expect.any(Object),
    websocket: expect.any(Object),
    queue: expect.any(Object),
    compilation: expect.any(Object),
    dependencies: expect.any(Object)
  }));
});

it('triggers readiness alert on 3 consecutive failed 30s probe windows', () => {
  const alerts = evaluateAlerts(mockReadinessSeries);
  expect(alerts).toContainEqual(expect.objectContaining({ code: 'ALERT_READINESS_CONSECUTIVE_FAILURES' }));
});

it('triggers api 5xx alert when 5xx rate exceeds 5% for 10 minutes', () => {
  const alerts = evaluateAlerts(mockApi5xxSeries);
  expect(alerts).toContainEqual(expect.objectContaining({ code: 'ALERT_API_5XX_RATE_SPIKE' }));
});

it('triggers queue backlog alert when backlog exceeds 200 jobs for 10 minutes', () => {
  const alerts = evaluateAlerts(mockQueueBacklogSeries);
  expect(alerts).toContainEqual(expect.objectContaining({ code: 'ALERT_QUEUE_BACKLOG_BREACH' }));
});

it('triggers compile failure-rate alert when failure rate exceeds 10% over 15 minutes', () => {
  const alerts = evaluateAlerts(mockCompileFailureSeries);
  expect(alerts).toContainEqual(expect.objectContaining({ code: 'ALERT_COMPILE_FAILURE_RATE_SPIKE' }));
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/server/observability/metrics.test.js`
Expected: FAIL because metrics/alerts modules are missing

- [ ] **Step 3: Implement minimal metrics and threshold evaluator**

Implement baseline metrics and alert evaluator exactly matching approved spec:
- metrics: liveness/readiness state, API latency/error rate, websocket connect/disconnect/error churn, queue depth, compile duration and success/failure rates, dependency connectivity failures (Mongo/Redis/RabbitMQ)
- alert thresholds:
  1) readiness not-ready for >3 consecutive probe windows (30s each)
  2) API 5xx rate >5% for 10 minutes
  3) queue backlog >200 jobs for 10 minutes
  4) compile failure rate >10% over 15 minutes

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm test -- tests/server/observability/metrics.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/observability/metrics.js src/server/observability/alerts.js src/server/api/routes.js src/server/index.js tests/server/observability/metrics.test.js
git commit -m "feat: add observability baseline metrics and alert evaluator"
```

---

## Chunk 4: Compose Validation + Gate Evidence Finalization

### Task 11: Add Docker Compose stack with healthchecks and restart policy

**Files:**
- Create: `docker-compose.yml`
- Modify: `scripts/start-worker.js` (only if needed for container startup compatibility)
- Test: `docs/superpowers/hardening/compose-validation.md`

- [ ] **Step 1: Write compose validation checklist with expected outcomes (RED by default)**

Create checklist entries:
- all services become healthy
- dependency criticality matrix is documented per service (critical vs non-critical dependencies)
- app readiness fails (`not-ready`) when a **critical** dependency is stopped
- app reports **degraded-ready** (with explicit feature impact noted) when a **non-critical** dependency is stopped
- app recovers readiness/degraded state correctly when each dependency is restored
- restart policy behavior is verified under crash/restart simulation
- operator runbook notes are included for unhealthy states (symptoms, likely causes, recovery commands, and verification steps)

- [ ] **Step 2: Run compose config validation (RED first, if file missing/invalid)**

Run: `docker compose -f docker-compose.yml config`
Expected: initial FAIL until compose file is valid

- [ ] **Step 3: Implement minimal compose stack**

Include services:
- app
- worker
- mongo
- redis
- rabbitmq

with healthchecks and restart policies.

- [ ] **Step 4: Run compose startup/recovery verification**

Run:
- `docker compose -f docker-compose.yml up -d --build`
- `docker compose -f docker-compose.yml ps`

Critical dependency simulation (from dependency matrix):
- `docker compose -f docker-compose.yml stop <critical_dependency_service>`
- `docker compose -f docker-compose.yml ps`
- `docker compose -f docker-compose.yml start <critical_dependency_service>`
- `docker compose -f docker-compose.yml ps`

Non-critical dependency simulation (from dependency matrix):
- `docker compose -f docker-compose.yml stop <non_critical_dependency_service>`
- `docker compose -f docker-compose.yml ps`
- `docker compose -f docker-compose.yml start <non_critical_dependency_service>`
- `docker compose -f docker-compose.yml ps`

Restart-policy failure simulation:
- `docker compose -f docker-compose.yml kill <service_under_test>`
- `docker compose -f docker-compose.yml ps`

Cleanup:
- `docker compose -f docker-compose.yml down -v`

Expected:
- services report healthy after startup
- critical dependency outage transitions app to `not-ready`; readiness recovers after restore
- non-critical dependency outage keeps app `degraded-ready` with explicit impacted features documented
- restart policy engages after forced failure and service returns to healthy/degraded state per dependency condition

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docs/superpowers/hardening/compose-validation.md scripts/start-worker.js
git commit -m "chore: add compose stack with healthchecks and recovery validation"
```

---

### Task 12: Final gate verification, evidence docs, and regression pass

**Files:**
- Modify: `docs/superpowers/hardening/risk-register.md`
- Modify: `docs/superpowers/hardening/verification-matrix.md`
- Create: `docs/superpowers/hardening/observability-baseline.md`
- Modify: `docs/superpowers/hardening/compose-validation.md`
- Create: `docs/superpowers/hardening/final-gate-report.md`

- [ ] **Step 1: Run full server test suite and capture outputs**

Run: `npm test -- tests/server --runInBand`
Expected: PASS

- [ ] **Step 2: Run coverage to confirm hardening visibility**

Run: `npm test -- --coverage`
Expected: PASS with coverage report generated in `coverage/`

- [ ] **Step 3: Update risk register statuses with evidence links**

Apply closure rules explicitly:
- P0: close only if at least **two independent evidence types** are attached, including at least **one automated check**
- P1/P2: close only if at least one accepted evidence type is attached
- keep any unresolved P0/P1 open and explicitly blocking

- [ ] **Step 4: Publish final gate report with pass/fail and evidence**

Create `docs/superpowers/hardening/final-gate-report.md` documenting final pass/fail for:
1. no open P0/P1
2. compose health/startup/recovery validated
3. observability baseline operational

Include:
- rationale for each gate decision
- links to verification artifacts
- explicit release decision (go/no-go)

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/hardening/risk-register.md docs/superpowers/hardening/verification-matrix.md docs/superpowers/hardening/compose-validation.md docs/superpowers/hardening/observability-baseline.md docs/superpowers/hardening/final-gate-report.md
git commit -m "docs: finalize hardening gate evidence and verification outcomes"
```

---

## Plan-level Verification Checklist

- [ ] All new tests created before corresponding implementation (RED→GREEN sequence recorded per task).
- [ ] No feature creep beyond hardening scope.
- [ ] ai-service remains out of scope unless explicitly justified by documented P0/P1 dependency.
- [ ] Health/readiness contract implemented and dependency-aware.
- [ ] Compile queue unavailable path no longer reports false queued success.
- [ ] Worker retry behavior is bounded with terminal failure state.
- [ ] Structured logs + correlation IDs + baseline metrics + alert thresholds implemented.
- [ ] Compose startup/recovery evidence captured and gate status documented.
- [ ] No open P0/P1 before release decision.

---

## Review checkpoints

After each chunk completion, run a plan-to-code conformance review with:
- `@superpowers:verification-before-completion`
- `@superpowers:requesting-code-review`

If verification fails, do not mark chunk complete; fix and re-run checks.
