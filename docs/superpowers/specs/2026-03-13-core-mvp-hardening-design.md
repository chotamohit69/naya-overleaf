# Core MVP Hardening Design (Sub-project 1)

- **Project:** Naya Overleaf
- **Date:** 2026-03-13
- **Status:** Approved in brainstorming, documented for planning
- **Approach:** Option A — Risk-first hardening audit + gated remediation waves
- **Priority Order:** Stability → Production Readiness → UX
- **Deployment Target:** Small multi-service Docker Compose
- **Timeline Target:** 4–6 weeks
- **Release Gates (must pass):**
  1. No open P0/P1 issues in scoped risk register
  2. Compose stack has healthchecks + clean startup/recovery
  3. Observability baseline is operational

---

## 1) Problem Statement

Naya Overleaf already has core capabilities implemented (editor, realtime path, compile pipeline, auth integration), but the current MVP needs hardening for stable operation in a small production-like Docker Compose deployment.

This sub-project does **not** add major product features. It hardens existing behavior by making failures explicit, recovery predictable, and operations observable.

---

## 2) Current-State Observations (codebase-informed)

The following observations shape hardening scope:

1. **Health/readiness is minimal**
   - `src/server/api/routes.js` exposes `/api/health` returning static `{status:"ok"}`.
   - No dependency-aware readiness contract is present.

2. **Session/auth dev defaults are not production-safe by default**
   - `src/server/auth/keycloak-config.js` uses `MemoryStore` and falls back to a default secret (`naya-overleaf-secret`) when env is missing.

3. **Dependency handling is inconsistent across services**
   - `src/server/db/connection.js` exits process on Mongo connect failure.
   - `src/server/api/controllers/compilation.js` continues in degraded mode when RabbitMQ is unavailable and can still return queued status.

4. **Realtime initialization has no bounded wait**
   - `src/server/realtime/sharedb-connection.js` polls for DB readiness with interval loop and no timeout/failure budget.

5. **Compile path and worker need explicit reliability contracts**
   - Compile queue/worker flows exist (`src/server/api/controllers/compilation.js`, `src/server/compiler/worker.js`, `src/server/compiler/docker.js`), but retry/idempotency/backlog/terminal-state policy is not formalized end-to-end.

6. **Observability baseline is not established**
   - Logging is mostly unstructured `console.*`; no explicit core metrics/alerts baseline is defined in code/config.

7. **Compose orchestration artifacts were absent in repo root at audit time**
   - At audit time, no `docker-compose.yml` was found during exploration; re-validate at planning kickoff.

---

## 3) Goals and Non-Goals

### Goals

1. Reduce runtime risk by driving all scoped P0/P1 findings to closed with verification evidence; risk acceptance is allowed only for P2+ and requires documented rationale with owner sign-off.
2. Define and implement dependency-aware liveness/readiness and recovery behavior for a small Compose deployment.
3. Establish an observability baseline sufficient to detect and triage incidents quickly.

### Non-Goals

1. No large new collaboration features (comments, templates, track changes) in this sub-project.
2. No enterprise/Kubernetes/multi-region rollout in this sub-project.
3. No broad UX redesign unless directly required to meet stability/readiness goals.

---

## 4) Scope Boundary

### In Scope

- App/API reliability hardening
- Realtime connection lifecycle resilience hardening
- Compile pipeline reliability hardening (queue + worker + artifact handling)
- Dependency failure behavior hardening (Mongo/Redis/RabbitMQ)
- Compose-level startup/recovery contracts
- Logging/metrics/alert hook baseline
- Risk register + gate-driven execution

### Out of Scope

- Net-new product capabilities unrelated to hardening
- Full enterprise controls and large-scale infra
- Unrelated refactors not tied to hardening outcomes

---

## 5) Architecture for Hardening Work

Hardening is organized into five surfaces:

1. **Web/API Surface**
   - Auth/session routes, API endpoints, static serving
2. **Realtime Surface**
   - ShareDB init, WS upgrade path, connection lifecycle
3. **Compilation Surface**
   - Job enqueue, worker processing, status tracking, artifact serving
4. **State Dependency Surface**
   - MongoDB, Redis, RabbitMQ connectivity and degraded modes
5. **Runtime Orchestration Surface**
   - Docker Compose service contracts, healthchecks, restart behavior

Each surface gets:
- Health contract
- Failure mode inventory
- Remediation plan
- Verification artifacts

---

## 6) Governance Model: Risk Register + Release Gates

A single **Hardening Risk Register** governs all work.

Each finding stores:
- ID, severity (P0/P1/P2)
- Surface/category (reliability/security/operability/data-integrity)
- Repro condition and expected behavior
- Owner and remediation reference
- Verification evidence links
- Gate impact

Execution rules:
1. No lower-priority work while unresolved P0 exists.
2. P0/P1 closure requires objective verification evidence.
3. “Fixed” without evidence is not “closed”.

---

## 7) Data Flow and Failure Flow

### 7.1 Normal Operational Flow

1. Request/session enters App service.
2. Correlation ID is assigned and propagated.
3. Request routes through API/realtime/compile paths.
4. State changes persist to Mongo; transient/queue interactions use Redis/RabbitMQ.
5. Logs and metrics emit with shared correlation keys.

### 7.2 Hardening Workflow Flow

1. Audit discovers risk.
2. Risk is classified and prioritized.
3. Remediation is implemented with minimal focused change set.
4. Verification checks run and produce artifacts.
5. Risk closure updates release gates.

### 7.3 Failure Flow Behavior

- **Dependency outage:** service transitions to not-ready quickly.
- **Crash/restart loop:** restart policy engages; readiness remains false until dependencies healthy.
- **Queue backlog growth:** backlog threshold emits alert and operator signal.
- **Realtime churn spike:** churn/error-rate alert triggers incident triage.

---

## 8) Error Handling and Recovery Policies

### 8.1 Error Contract

All services should emit:
- Classified error type
- Correlation ID
- Safe client message
- Detailed server-side context
- Metric increment tagged by class

### 8.2 Fail-Fast Cases

Fail fast where safety/correctness would be compromised:
- Auth/session integrity failures
- Invalid compile job contract at boundary
- Realtime consistency/sequence mismatch that risks corruption
- Critical dependency missing for ready state

### 8.3 Graceful Degradation Cases

Degrade safely where behavior can remain correct:
- Non-critical cache misses/failures
- Optional telemetry sink interruption
- Temporary queue pressure with bounded retries/backpressure

### 8.4 Recovery Rules

- Bounded retry policies only
- Explicit terminal failure states (no infinite loops)
- Clear “ready/not-ready” semantics for orchestration
- Deterministic cleanup on failed compile runs

---

## 9) Observability Baseline (Required Gate)

### 9.1 Logging Baseline

- Structured JSON logs for app/realtime/compile paths
- Required fields: timestamp, level, service, component, correlationId, message, errorClass
- Request/job lifecycle events logged consistently

### 9.2 Metrics Baseline

Minimum metrics to expose:
- Service liveness/readiness state
- API request latency + error rate
- WebSocket connect/disconnect/error churn
- Queue depth, compile durations, compile success/failure rates
- Dependency connectivity failures (Mongo/Redis/RabbitMQ)

### 9.3 Alert Hooks Baseline

Minimum alert conditions (initial defaults, tunable during planning):
- Readiness failures: service not-ready for >3 consecutive probe windows (30s each)
- API error-rate spike: 5xx rate >5% for 10 minutes
- Queue backlog breach: backlog >200 jobs for 10 minutes
- Compile failure-rate spike: failed compiles >10% over 15 minutes

---

## 10) Docker Compose Hardening Requirements (Required Gate)

Target outcome: robust local/small-prod deployment shape with predictable startup and recovery.

Required:
1. Compose definitions for core services (app, worker, mongo, redis, rabbitmq).
2. Healthchecks for each core service.
3. Dependency-aware startup behavior (not merely container start order), enforced by a dependency criticality matrix per service (critical dependency => not-ready; non-critical dependency => degraded-ready with explicit feature impact).
4. Restart policy strategy validated in failure simulations.
5. Clear operator runbook notes for unhealthy states.

Out of scope note: `ai-service` is excluded from Sub-project 1 unless a documented P0/P1 dependency requires inclusion.

---

## 11) Testing and Verification Strategy

A P1/P2 risk item is closed only when at least one of the following provides evidence. A P0 risk item is closed only when at least two independent evidence types are attached, including at least one automated check:

1. Automated regression test(s) covering failure mode
2. Fault-injection/resilience check output
3. Health/readiness validation output
4. Observability evidence (log/metric/alert event)
5. Soak validation showing no recurrence during defined window

Verification matrix ties every P0/P1 to explicit checks and artifacts.

---

## 12) Execution Plan (4–6 Weeks, assuming 2 engineers + shared DevOps support)

### Week 1 — Audit + Baseline
- Run hardening audit across five surfaces
- Build risk register with P0/P1/P2
- Define verification matrix
- Define logging/metrics schema and initial instrumentation tasks

### Week 2 — Remediation Wave 1
- Resolve highest P0/P1 in API/auth/realtime interfaces
- Add dependency-aware readiness where missing

### Week 3 — Compose Runtime Hardening
- Implement/normalize Compose healthchecks and restart behavior
- Validate startup/recovery scenarios against dependency outages

### Week 4 — Observability Completion
- Complete structured logs and minimum metric surface
- Wire alert hooks and test trigger conditions
- Close remaining P1 driven by observability blind spots

### Week 5 — Stabilization + Soak
- Run focused fault scenarios
- Run soak window and monitor recurrence
- Resolve residual high-priority findings

### Week 6 — Gate Decision / Buffer
- Final gate review
- Publish hardening report and residual-risk notes
- Release go/no-go decision

---

## 13) Release Gates (Authoritative)

Sub-project is complete only if all are true:

1. **No open P0/P1 in scoped register**
2. **Compose health/startup/recovery behavior validated**
3. **Observability baseline operational (logs + metrics + alert hooks)**

If any gate fails, release is blocked.

---

## 14) Deliverables

1. Hardening risk register (final state)
2. Verification matrix + evidence links
3. Compose hardening checklist + test outcomes
4. Observability baseline checklist + alert test outcomes
5. Final gate report (pass/fail with rationale)

---

## 15) Risks and Mitigations

1. **Scope creep from feature requests**
   - Mitigation: reject non-hardening changes unless gate-critical.

2. **Hidden cross-service coupling causes rework**
   - Mitigation: keep surface-based ownership but validate with end-to-end fault drills.

3. **Insufficient instrumentation delays triage**
   - Mitigation: front-load observability schema in Week 1.

4. **Compose startup appears healthy while dependencies are not**
   - Mitigation: explicit readiness checks tied to dependency probes.

---

## 16) Open Decisions to Confirm in Planning Phase

1. Confirm whether any documented P0/P1 dependency justifies ai-service inclusion; otherwise ai-service remains deferred and out of scope for Sub-project 1.
2. Exact metric export stack/tooling for this repository
3. Alert delivery target (log-only vs webhook integration target)
4. Soak duration definition and pass thresholds (default proposal: minimum 24h soak, zero unbounded retries, zero crash loops, and no recurrence of closed P0/P1 conditions)

---

## 17) Approval Record

- **User approved approach:** Option A
- **User approved design sections:** Architecture, Components, Data/Failure Flow, Error/Recovery, Testing/Timeline
- **User approved full summary:** Yes

This document is ready for implementation planning (task breakdown, sequencing, and acceptance criteria).
