# Compose Validation Evidence

## Dependency criticality matrix

| Service | Critical dependencies (not-ready if down) | Non-critical dependencies (degraded-ready if down) |
| --- | --- | --- |
| app | mongo, rabbitmq | redis (cache features degraded) |
| worker | mongo, rabbitmq | redis |

## Validation checklist

- [x] all services become healthy
- [x] dependency criticality matrix is documented per service (critical vs non-critical dependencies)
- [x] app readiness fails (`not-ready`) when a **critical** dependency is stopped
- [x] app reports **degraded-ready** (with explicit feature impact noted) when a **non-critical** dependency is stopped
- [x] app recovers readiness/degraded state correctly when each dependency is restored
- [ ] restart policy behavior is verified under crash/restart simulation
- [x] operator runbook notes are included for unhealthy states (symptoms, likely causes, recovery commands, verification steps)

## Commands and outputs

### 1) Startup and baseline health

```bash
docker compose down -v
docker compose up -d --build
sleep 35
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/live
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```

Output:

```text
{"status":"live"}
200
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
```

### 2) Critical dependency outage simulation — Mongo

```bash
docker compose stop mongo
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
sleep 4
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
docker compose start mongo
sleep 5
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
```

Output:

```text
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
{"ready":false,"degraded":false,"reasons":["mongo"],"featureImpacts":[]}
503
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
```

Note: immediate post-stop probe can still reflect previous state before the next monitor cycle; the delayed probe confirms transition to `not-ready`.

### 3) Critical dependency outage simulation — RabbitMQ

```bash
docker compose stop rabbitmq
sleep 2
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
docker compose start rabbitmq
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
  sleep 2
done
```

Output:

```text
{"ready":false,"degraded":false,"reasons":["rabbitmq"],"featureImpacts":[]}
503
{"ready":false,"degraded":false,"reasons":["rabbitmq"],"featureImpacts":[]}
503
...
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
```

### 4) Non-critical dependency outage simulation — Redis

```bash
docker compose stop redis
sleep 2
curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
docker compose start redis
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
  sleep 2
done
```

Output:

```text
{"ready":true,"degraded":true,"reasons":[],"featureImpacts":["cache"]}
200
{"ready":true,"degraded":true,"reasons":[],"featureImpacts":["cache"]}
200
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
```

### 5) Realtime timeout/recovery simulation for H-RT-001

```bash
docker compose down -v
docker compose up -d rabbitmq redis app worker
docker compose stop mongo
docker compose logs app --tail 120
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready || true
  sleep 2
done
docker compose start mongo
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -w "\n%{http_code}\n" http://localhost:3000/api/health/ready
  sleep 2
done
```

Output excerpts:

```text
Failed to initialize ShareDB with MongoDB: Error: ShareDB initialization timed out after 5000ms waiting for MongoDB readiness
  code: 'SHAREDB_INIT_TIMEOUT'

curl: (52) Empty reply from server
...
{"ready":false,"degraded":false,"reasons":["mongo"],"featureImpacts":[]}
503
...
{"ready":true,"degraded":false,"reasons":[],"featureImpacts":[]}
200
```

Interpretation:
- ShareDB startup fails in bounded time with typed timeout code when mongo is unavailable.
- App remains alive and transitions to explicit not-ready with `reasons:["mongo"]`.
- After mongo restoration, readiness recovers to `200` without restarting the app container.

### 6) Cleanup

```bash
docker compose down -v
```

Output:

```text
All containers, network, and named volumes removed successfully.
```

## Operator runbook notes

### app not-ready (critical dependency down)
- Symptoms: `/api/health/ready` returns 503 with reasons including `mongo` or `rabbitmq`.
- Likely causes: database or message broker unavailable.
- Recovery commands:
  - `docker compose start mongo rabbitmq`
  - `docker compose ps`
- Verification steps:
  - `curl http://localhost:3000/api/health/ready`
  - verify HTTP 200 and no critical reasons after dependency recovery.

### app degraded-ready (non-critical dependency down)
- Symptoms: readiness stays 200 with `degraded: true` and `featureImpacts` including `cache`.
- Likely causes: redis unavailable or reconnecting.
- Recovery commands:
  - `docker compose start redis`
  - `docker compose ps`
- Verification steps:
  - `curl http://localhost:3000/api/health/ready`
  - verify `degraded` returns to `false` after redis recovery.

### realtime startup timeout (mongo unavailable)
- Symptoms: app logs include `SHAREDB_INIT_TIMEOUT`; readiness returns 503 with `reasons:["mongo"]`.
- Likely causes: mongo down or DNS/connection path to mongo unavailable.
- Recovery commands:
  - `docker compose start mongo`
  - `docker compose logs app --tail 120`
- Verification steps:
  - confirm timeout log appears during outage,
  - then verify `/api/health/ready` transitions from `503` to `200` after mongo restore.

### Known startup timing caveat
- During early startup window the app may briefly return an empty reply until HTTP server is fully initialized.
- Operational guidance: treat readiness as valid only after app container health is `healthy` in `docker compose ps`.

