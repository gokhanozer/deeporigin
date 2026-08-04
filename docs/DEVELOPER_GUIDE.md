# Developer Guide

Use this after the README when you want to work on the codebase.

| Doc | When you want |
|---|---|
| **This file** | to change code, run tests, or troubleshoot local development |
| [`REFERENCE.md`](REFERENCE.md) | to look something up — env vars, endpoints, schema, Redis keys, metrics, and ports |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | to understand *why* a decision was made |
| [`SCALING.md`](SCALING.md) | to scale it out |

---

## 1. Project Overview

A URL shortener built with Next.js, NestJS, Prisma, PostgreSQL, Redis, and Docker.

The README is the reviewer-facing entry point. This guide is for working on the
codebase: finding modules, running tests, making changes, and troubleshooting.

---

## 2. Getting Started

Start with the README: [How to Run Locally](../README.md#how-to-run-locally).

After the app is running, use this guide for code orientation, tests,
development workflow, and troubleshooting.

---

## 3. Code Map

```
backend/src/
├── common/          Reusable utilities, guards, filters, decorators, DTOs
│   ├── utils/       slug · url · date · pagination · request · user-agent
│   ├── guards/      ThrottlerProxyGuard (rate limiting)
│   ├── filters/     AllExceptionsFilter (one error envelope)
│   ├── rate-limit/  Runtime override service
│   └── redis/       Shared ioredis client
├── config/          Typed configuration + fail-fast env validation
├── prisma/          PrismaService (DB client)
├── metrics/         Prometheus registry, interceptor, /metrics
├── auth/            JWT register / login
├── links/           Create, list, update, delete
├── redirect/        Slug resolution — the hot path
├── visits/          Click tracking
├── analytics/       Dashboard aggregation
└── health/          Liveness + readiness probes

frontend/src/
├── app/             Routes (App Router)
│   ├── [slug]/      Short-link resolver — a SERVER component
│   ├── links/       All links
│   ├── dashboard/   Analytics, + links/[id] per-link detail
│   └── login, register
├── components/
│   ├── ui/          Button · Input · Card · Modal · SegmentedToggle · …
│   ├── links/       ShortenForm · LinkList · LinkRow · EditSlugModal
│   ├── charts/      TrendChart · BreakdownBars · StatTile (hand-built SVG)
│   └── layout/      Header · AuthForm
├── hooks/           useClipboard · useAsync · useDebouncedValue
├── lib/             API client · validators · formatters · types
└── providers/       Auth and toast context
```

### Where new code goes

| Adding… | Put it in |
|---|---|
| A pure helper used in 2+ places | `backend/src/common/utils/` with a `.spec.ts` |
| A new endpoint | the matching feature module; DTO in its `dto/` |
| A cross-cutting concern | `common/` as a guard, filter or interceptor |
| A reusable UI element | `frontend/src/components/ui/` |
| An API call | `frontend/src/lib/api/` — never `fetch` in a component |

### Conventions

- **Strict TypeScript**, no `any`
- **JSDoc on every exported function**, with `@param`/`@returns`
- Comments explain **why**, not what
- Business logic lives in **pure, testable functions** under `common/utils/`
- Components never call `fetch` directly — they go through `lib/api/`

---

## 4. Running Tests

```bash
cd backend
npm test                 # whole backend suite
npm run test:cov         # with coverage
npm test -- slug.util    # one file
npm run typecheck        # tsc --noEmit
```

From the repo root, `npm test` and `npm run typecheck` cover both apps.

**What is tested:** the pure utilities (slug, url, date, pagination,
user-agent), the services (links, redirect, visits, analytics, auth, rate-limit
overrides), DTO and query-string coercion, the auth guards, configuration
parsing, and one e2e spec.

**What is not:** the frontend has **zero tests**. That is the largest known gap.
Start with `useClipboard` (it has a real `execCommand` fallback), `lib/validators.ts`
(it mirrors backend rules, so drift is a real risk), and one Playwright end-to-end
test covering shorten → copy → redirect → dashboard.

> Tests need no database or Redis. Prisma is mocked and the throttler falls back
> to in-memory storage, which is why `npm test` runs in seconds.

---

## 5. Development Workflow

### Backend

```bash
cd backend
# edit, then:
npm run typecheck && npm test
cd .. && docker compose up -d --build backend
```

### Frontend

```bash
cd frontend
# edit, then:
npm run typecheck
cd .. && docker compose up -d --build frontend
```

**Then hard-refresh the browser** — `Cmd+Shift+R`, or DevTools → right-click
reload → *Empty Cache and Hard Reload*. Rebuilding the container does not clear
your tab's cached JavaScript.

### Changing the database schema

```bash
cd backend
# edit prisma/schema.prisma, then:
npx prisma migrate dev --name describe_your_change
```

Commit the generated folder under `prisma/migrations/` — that is what lets
`migrate deploy` reproduce the schema anywhere.

### Recreating Containers After Env Changes

Env vars are fixed at **container creation**, so a restart is not enough:

```bash
docker compose up -d --force-recreate backend
```

For the full environment variable list, see
[`REFERENCE.md` → Environment variables](REFERENCE.md#environment-variables).

### Faster loop, without Docker

```bash
npm run setup     # once
npm run dev       # Postgres in Docker; both dev servers on the host, hot-reload
```

---

## 6. Troubleshooting

### `502` from the API, or "port is already allocated"

A container from another mode is still holding the port.

```bash
docker compose down --remove-orphans
npm run docker:up
```

### Frontend changes do not appear

Rebuild happened, browser is serving cached JS.

```bash
docker compose up -d --build frontend
# then: Cmd+Shift+R, or check the chunk hash in DevTools → Network
```

If the hash in DevTools matches what the server serves, it is **not** cache —
look at the failing request's status instead.

### The dashboard is empty

Expected on a fresh install. There is no seed script; shorten a URL and click it.

### Grafana asks for a password you do not know

`admin` / `admin` on a **fresh volume**. If you changed it, that value persists
in `deeporigin_grafana-data`. To reset:

```bash
docker volume rm deeporigin_grafana-data   # ⚠️ also drops UI-built dashboards
```

Provisioned dashboards survive — they live in git.

### Backend cannot reach the database

Check ordering, not connectivity — the backend waits on `migrate`:

```bash
docker compose ps          # shortener-setup-db should be "Exited (0)"
docker compose logs migrate
```

### Reading the logs

Failures are logged at `WARN` (4xx) and `ERROR` (5xx):

```bash
docker compose logs backend -f | grep -E "WARN|ERROR"
```

> The status in the log is the one the client received. If the logs and the
> observed behaviour ever disagree, check the logs are reporting the real status
> before assuming the client is wrong.

For metric names, Prometheus queries, and alert rules, see
[`REFERENCE.md` → Metrics](REFERENCE.md#metrics).

### Full reset

```bash
npm run docker:reset      # ⚠️ destroys the database AND Grafana's volume
npm run docker:up
```

---

## 7. Related Documentation

| Question | Doc |
|---|---|
| What is the exact shape of `GET /links`? | [`REFERENCE.md`](REFERENCE.md) |
| Which env vars and ports exist? | [`REFERENCE.md`](REFERENCE.md) |
| Why are slugs random rather than hashed? | [`IMPLEMENTATION.md`](IMPLEMENTATION.md) §6 |
| Why is `/redirect` exempt from rate limiting? | [`IMPLEMENTATION.md`](IMPLEMENTATION.md) §10 |
| What breaks first under load? | [`SCALING.md`](SCALING.md) |
| What still needs doing? | [`SCALING.md`](SCALING.md) — phases 3–6, each with its trigger metric |
