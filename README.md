# Naya Overleaf

A self-hosted, reliability-first LaTeX workspace: CodeMirror editing, real-time collaboration, containerized compilation, PDF preview, and bring-your-own-key AI assistance.

## What is implemented

- **Editing** — CodeMirror 6 with LaTeX syntax highlighting, line numbers, bracket matching, and a LaTeX language extension.
- **Real-time collaboration** — ShareDB over WebSocket with operational transformation, MongoDB-backed snapshots and ops, and per-document read/write authorization.
- **Projects and documents** — create, open, rename, and soft-delete projects and files. Supported file types are `.tex`, `.bib`, `.cls`, and `.sty`.
- **Compilation** — RabbitMQ job queue, a worker that runs TeX Live in a throwaway Docker container, bounded retries, Redis result caching, and stored compiler logs.
- **PDF preview** — PDF.js viewer with page navigation, zoom, download, and a "Fix with AI" action on compile failures.
- **AI assistance** — FastAPI service for chat-to-LaTeX insertion, inline ghost-text completion, and compile-error repair. Users supply their own OpenAI, Anthropic, or Gemini key.
- **Encrypted keys** — user API keys are encrypted with AES-256-GCM before storage and decrypted only inside the app for the AI service.
- **Operations** — dependency-aware readiness, structured JSON logs with correlation IDs, in-memory metrics, alert evaluation, Docker Compose healthchecks, and a worker health endpoint.
- **UI platform** — React 18 islands layered over the existing client, design tokens, light/dark theme, accessible primitives, and a toast bridge.

The full React migration, comments, presence cursors, track changes, a template gallery, sharing roles, and the admin status view are still roadmap items. The current UI is a hybrid: the workspace remains vanilla JavaScript and React is mounted incrementally.

## Architecture

```text
Browser
  public/index.html + webpack bundles
  CodeMirror editor, PDF.js preview, AI chat, API-key settings
        │ REST /api                     │ WebSocket /ws + Socket.IO
        ▼                               ▼
  Express app  ◄──────────────────►  MongoDB
  auth, projects, documents,         projects, documents, users,
  compile API, AI proxy,             compilation_jobs, sessions,
  readiness, metrics, alerts         sharedb_* snapshots and ops
        │
        ├── enqueue ──► RabbitMQ ──► worker ──► docker create/start TeX Live
        │                              │        (no host bind mounts)
        │                              ├── Redis compile cache
        │                              └── Redis pub/sub compile events
        │
        └── /api/ai/* proxy ──► FastAPI ai-service
                                  │
                                  ├── GET /internal/user/:id/api-key
                                  └── OpenAI / Anthropic / Gemini
```

### Compilation execution

The worker never bind-mounts host paths. For each job it:

1. Writes the project files into a per-job directory under `COMPILATION_DIR`.
2. Creates a container with networking disabled, all capabilities dropped, and `no-new-privileges`.
3. Copies the job files into `/work` inside the container.
4. Runs `/usr/local/bin/compile.sh`.
5. Copies PDF, log, stdout, and stderr back out.
6. Removes the container and moves the PDF to `<jobId>.pdf`.

This works when the worker runs in a container with only `/var/run/docker.sock` mounted, and avoids host/container path translation problems.

## Quick start

### Prerequisites

- Node.js 18 or newer
- MongoDB
- RabbitMQ
- Redis (optional; enable compilation caching and live events)
- Docker (for the TeX Live image)

### Local development

```bash
npm install
cp .env.example .env
```

Set these values in `.env`:

```bash
SESSION_SECRET=replace-with-a-long-random-string
AI_KEY_ENCRYPTION_SECRET=$(openssl rand -hex 32)
AI_INTERNAL_SECRET=$(openssl rand -base64 32)
SKIP_KEYCLOAK=true
```

Use the same `AI_INTERNAL_SECRET` in `ai-service/.env` (or export it before starting uvicorn).

Build the TeX Live image and the client, then start the services:

```bash
npm run build-docker
npm run build
npm run start          # app on http://localhost:3000
npm run start-worker   # in a second terminal
```

To run the AI service locally:

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

MongoDB, Redis, and RabbitMQ can be started with:

```bash
docker compose up -d mongo redis rabbitmq
```

### Hosted preview (Render)

`Dockerfile` and `render.yaml` define a single-container preview for Render. It is intentionally different from the production stack:

- MongoDB runs in memory inside the container.
- Compilation runs locally with TeX Live, not in a Docker worker.
- AI, Keycloak, Redis, and RabbitMQ are disabled.
- Data and compiled PDFs are lost when the instance restarts.

Build the image locally and run the preview:

```bash
docker build -t naya-overleaf-preview .
docker run --rm -p 10000:10000 naya-overleaf-preview
```

Deploy it from the repository with the Render CLI:

```bash
render services create \
  --name naya-overleaf \
  --type web_service \
  --runtime docker \
  --repo https://github.com/chotamohit69/naya-overleaf \
  --branch main \
  --plan free \
  --region oregon \
  --health-check-path /api/health/live \
  --env-var NODE_ENV=development \
  --env-var PREVIEW_MODE=true \
  --env-var SKIP_KEYCLOAK=true \
  --env-var AI_ENABLED=false \
  --env-var COMPILATION_DIR=/app/compilation \
  --env-var SESSION_SECRET=<random-32-plus-character-secret> \
  --confirm
```

For production, use `docker-compose.yml` instead. The preview is not a substitute for the Docker worker, external MongoDB, or durable storage.

### Docker Compose

Create a `.env` with `AI_INTERNAL_SECRET` and `AI_KEY_ENCRYPTION_SECRET`, then:

```bash
docker compose up --build
```

The stack builds the TeX Live image, then starts `mongo`, `redis`, `rabbitmq`, `app`, `worker`, and `ai-service`. The app is exposed on port 3000. The worker receives the Docker socket so it can launch TeX Live containers. The app image builds the client bundles during its Docker build, so the container does not depend on host build output.

The Compose defaults are development settings (`SKIP_KEYCLOAK=true`). For production, set `NODE_ENV=production`, `SKIP_KEYCLOAK=false`, configure Keycloak, and provide all secrets. Production startup rejects missing or weak secrets, and rejects `SKIP_KEYCLOAK=true`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | App HTTP port (default `3000`) |
| `MONGODB_URI`, `DB_NAME` | MongoDB connection and database |
| `REDIS_URL`, `RABBITMQ_URL` | Cache and job queue |
| `REDIS_CONNECT_TIMEOUT_MS` | Startup cap for the optional Redis connection (default `3000`) |
| `RABBITMQ_CONNECT_TIMEOUT_MS`, `RABBITMQ_RECONNECT_DELAY_MS` | Queue connection timing |
| `SESSION_SECRET` | Session signing secret; at least 32 characters in production |
| `SKIP_KEYCLOAK` | Development auth bypass; rejected in production |
| `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID` | Keycloak configuration |
| `COMPILATION_DIR` | Shared directory for job files and PDFs |
| `DOCKER_IMAGE` | TeX Live image name (default `naya-overleaf-texlive`) |
| `COMPILATION_TIMEOUT_MS` | Maximum compiler run time per job |
| `DOCKER_COMMAND_TIMEOUT_MS` | Maximum time for a Docker CLI command |
| `AI_ENABLED` | Set to `false` to disable AI routes and UI |
| `AI_SERVICE_URL` | Internal AI service URL |
| `AI_INTERNAL_SECRET` | Shared secret between app and AI service |
| `AI_KEY_ENCRYPTION_SECRET` | 64 hex characters; encrypts stored provider keys |
| `CORS_ORIGINS` | Comma-separated browser origins allowed by the AI service and app request-origin checks |
| `APP_INTERNAL_URL` | URL the AI service uses to read user keys |
| `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `GEMINI_MODEL` | Optional model overrides |
| `LLM_TIMEOUT_SECONDS` | Per-provider LLM request timeout (default `30`) |

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/config` | Public runtime flags such as AI availability |
| `GET` | `/api/health` | Basic liveness |
| `GET` | `/api/health/live` | Liveness probe |
| `GET` | `/api/health/ready` | Dependency-aware readiness |
| `GET` | `/api/observability/metrics` | In-memory metrics snapshot (admin only) |
| `GET` | `/api/observability/alerts` | Currently active alert codes (admin only) |
| `GET/POST` | `/api/projects` | List or create projects |
| `GET/PUT/DELETE` | `/api/projects/:id` | Read, update, or soft-delete a project |
| `GET/POST` | `/api/documents` | Read or create documents |
| `GET/PUT/DELETE` | `/api/documents/:id` | Read, rename, or soft-delete a document |
| `GET` | `/api/documents/:id/pdf` | Serve the latest compiled PDF |
| `GET` | `/api/documents/download` | Download a PDF by `jobId` or `documentId` |
| `POST` | `/api/compile/:documentId` | Enqueue a compilation |
| `GET` | `/api/compile/status/:jobId` | Read job status and compiler log |
| `GET` | `/api/compile/status/:documentId/latest` | Latest job for a document |
| `GET/POST/DELETE` | `/api/user/api-keys` | Manage encrypted provider keys |
| `POST` | `/api/ai/chat` | Generate LaTeX from a request |
| `POST` | `/api/ai/complete` | Inline completion |
| `POST` | `/api/ai/fix-error` | Explain and patch a compile error |

Internal routes under `/internal` require `X-Internal-Secret` and are intended only for service-to-service calls.

## Testing

```bash
npm test
npm test -- tests/server/routes/health.test.js --runInBand
npm test -- tests/server/compiler/docker.security.test.js --runInBand
```

The suite covers controllers, readiness policy, ShareDB timeouts and authorization, Docker compilation safeguards, worker retries, session storage, structured logging, metrics, alerts, React primitives, theming, and island mounting.

## Project structure

```text
src/
  client/
    editor/       CodeMirror editor, LaTeX language, AI chat, autocomplete
    pdf/          PDF.js preview
    react/        React islands, theme, primitives, overlays, a11y helpers
    settings/     Encrypted API-key settings UI
    styles/       Tokens, themes, and legacy styles
  server/
    api/          REST controllers
    auth/         Keycloak, dev auth, Mongo session store
    compiler/     Docker execution and RabbitMQ worker
    health/       Dependency state, readiness policy, bootstrap
    observability Logging, correlation, metrics, alerts
    realtime/     ShareDB, Socket.IO compile events, access control
    routes/       AI proxy, internal routes, key management
ai-service/       FastAPI AI microservice
docker/
  node/           Node app/worker image with Docker CLI
  texlive/        TeX Live image and compile script
tests/            Jest client and server tests
docs/             Design specs, hardening plans, and gate evidence
```

## Security notes

- Compilation containers run without networking, with all capabilities dropped, and with `no-new-privileges`.
- Document names are validated and resolved inside the job directory; path traversal is rejected.
- Realtime reads and writes are checked against project ownership or collaborator membership.
- Internal routes compare secrets with a constant-time comparison.
- Helmet security headers, rate limits, and Origin/Referer checks on state-changing browser requests are enabled.
- Sessions use a MongoDB store in production and cookies are `HttpOnly`, `SameSite=Lax`, and secure outside development.
- AI provider keys are encrypted with AES-256-GCM and never returned in plaintext.
- The AI service refuses to start without `AI_INTERNAL_SECRET`.

## License

MIT
