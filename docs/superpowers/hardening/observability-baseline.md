# Observability Baseline Evidence

## Scope

This artifact documents the baseline observability implementation and verification evidence for:
- structured logs with required schema
- correlation ID middleware + propagation
- baseline metrics snapshot + endpoint
- default alert threshold evaluator behavior

## Automated test evidence

### Correlation and logger schema

```bash
npm test -- tests/server/observability/correlation.test.js tests/server/observability/logger.test.js
```

Result: PASS (2 suites, 5 tests)

### Metrics and alert thresholds

```bash
npm test -- tests/server/observability/metrics.test.js
```

Result: PASS (1 suite, 5 tests)

### Regression set including reliability + health routes

```bash
npm test -- tests/server/observability/correlation.test.js tests/server/observability/logger.test.js tests/server/observability/metrics.test.js tests/server/controllers/compilation.reliability.test.js tests/server/compiler/worker.reliability.test.js tests/server/routes/health.test.js tests/server/routes/internal-health.test.js
```

Result: PASS (7 suites, 33 tests)

## Implemented observability components

- `src/server/observability/correlation.js`
  - request middleware reads/generates `x-correlation-id`
  - response header propagation
  - correlation payload helper for queue messages
- `src/server/observability/logger.js`
  - structured JSON log wrapper with required fields:
    - `timestamp`
    - `level`
    - `service`
    - `component`
    - `correlationId`
    - `message`
    - `errorClass`
- `src/server/observability/metrics.js`
  - baseline in-memory metrics domains:
    - liveness
    - readiness
    - api
    - websocket
    - queue
    - compilation
    - dependencies
- `src/server/observability/alerts.js`
  - threshold evaluator with default conditions:
    1. readiness failures for 3 consecutive 30s windows
    2. API 5xx rate > 5% for 10 minutes
    3. queue backlog > 200 for 10 minutes
    4. compile failure rate > 10% for 15 minutes

## Runtime exposure and wiring

- `src/server/index.js`
  - correlation middleware registered globally
- `src/server/api/controllers/compilation.js`
  - correlation included in enqueue payload and AMQP headers
  - structured logs on enqueue success/failure paths
- `src/server/compiler/worker.js`
  - correlation resolved from payload/headers
  - structured logs for job receipt and error handling
- `src/server/api/routes.js`
  - request metrics capture middleware
  - readiness metrics updates
  - metrics endpoint: `GET /api/observability/metrics`

## Notes

- Current metrics store is in-process memory; no external TSDB export yet.
- Alert evaluator is deterministic and test-covered, but not yet connected to an external notification channel.
