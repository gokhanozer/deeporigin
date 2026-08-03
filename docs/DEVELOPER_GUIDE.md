# Developer Guide

Get running, find your way around, make a change. **Read this first.**

| Doc | When you want |
|---|---|
| **This file** | to get productive |
| [`REFERENCE.md`](REFERENCE.md) | to look something up — env vars, endpoints, schema, Redis keys, metrics |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | to understand *why* a decision was made |
| [`SCALING.md`](SCALING.md) | to scale it out |

---

## 1. What this is

A URL shortener. Paste a long URL, get a short one, share it, see how it performs.

```
https://some.place.example.com/foo/bar/biz   →   http://localhost:3000/abc123
```

Shorten (anonymously or signed in) · redirect and count every click · custom
editable slugs · analytics · accounts.

Anonymous use is a first-class path — shortening never requires an account.
Signing in adds ownership, editing and per-user analytics.

**Stack:** Next.js + React (TypeScript) · NestJS (TypeScript) · Prisma ·
PostgreSQL · Redis · Docker.

---

## 2. Quickstart

Docker is the only prerequisite.

```bash
git clone <repo>
cd DeepOrigin
cp .env.example .env      # then edit the credentials
docker compose up -d
```

Migrations run automatically. You should now have:

| | |
|---|---|
| App | <http://localhost:3000> |
| API root — lists every endpoint | <http://localhost:4000/api/v1> |
| Swagger | <http://localhost:4000/api/v1/docs> |
| Health | <http://localhost:4000/api/v1/health/ready> |

**Smoke test:** shorten a URL on the home page, click the short link, then open
`/dashboard` — the visit count should have moved.

> The database starts **empty**. There is no seed script, by design: the
> dashboard only ever shows real traffic.

---

## 3. Modes

The stack composes from **three files**. The base is the application; overlays
add infrastructure you opt into.

| Mode | Command | Adds |
|---|---|---|
| **Default** | `npm run docker:up` | — 6 services |
| **Scaled** | `npm run docker:scale -- --scale backend=3` | nginx load balancer |
| **Observability** | `npm run docker:metrics` | Prometheus, Grafana, 2 exporters |
| **Everything** | `npm run docker:full -- --scale backend=3` | both |

Raw equivalents if you prefer:

```bash
docker compose up -d --remove-orphans

docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  up -d --remove-orphans --scale backend=3

docker compose -f docker-compose.yml -f docker-compose.observability.yml \
  up -d --remove-orphans
```

> **⚠️ Always pass `--remove-orphans` when switching modes.** Compose only
> manages services in the files you give it, so the previous mode's containers
> keep running as orphans — and a leftover `lb` holding port 4000 stops the
> backend binding it, producing a confusing `502`. The npm scripts include the
> flag already.

### Scaled mode is for local stress testing

`--scale backend=N` proves three things that are otherwise assertions:

- rate limits stay **shared** (10/min stays 10/min at 3 replicas, not 30)
- database connections stay **flat** (20 at 3 replicas, 20 at 6)
- migrations run **exactly once**, not once per replica

It needs nginx for one narrow reason: a published host port can be claimed by
exactly one container, so N replicas cannot all bind 4000.

> **`shortener-lb` would not exist in a cloud deployment.** A managed load
> balancer — ALB, Cloud Load Balancer, a Kubernetes ingress — fills that role
> with redundancy, TLS termination and health checks you do not maintain. A
> single self-managed nginx container is itself a single point of failure and
> buys no availability. It is a **local stand-in for platform infrastructure**,
> which is why it lives in an overlay rather than the base stack.

---

## 4. Containers

**Not every container runs in every mode.**

| Container | Service | Modes | Responsibility |
|---|---|---|---|
| `shortener-postgres` | `postgres` | **all** | The database. Owns all persistent state |
| `shortener-pgbouncer` | `pgbouncer` | **all** | Connection pooler between API and Postgres |
| `shortener-redis` | `redis` | **all** | Shared rate-limit counters and override flags |
| `shortener-setup-db` | `migrate` | **all** | One-shot schema migration, then exits 0 |
| `deeporigin-backend-N` | `backend` | **all** | NestJS API. Replicated in scaled mode |
| `shortener-frontend` | `frontend` | **all** | Next.js UI + short-link resolution |
| `shortener-lb` | `lb` | **scaled** | nginx across replicas. Local stand-in only |
| `shortener-prometheus` | `prometheus` | **observability** | Scrapes and stores metrics |
| `shortener-grafana` | `grafana` | **observability** | Dashboards over Prometheus |
| `shortener-postgres-exporter` | `postgres-exporter` | **observability** | Postgres server metrics |
| `shortener-pgbouncer-exporter` | `pgbouncer-exporter` | **observability** | Pool saturation metrics |

> `shortener-setup-db` showing **`Exited (0)` is success**, not a crash. It is a
> job, not a service.

### The three that need explaining

**`shortener-setup-db`** runs `prisma migrate deploy` once, then exits; the
backend waits on `service_completed_successfully`. It is separate because
migrations used to run inside the backend's own startup — fine with one
instance, but with N replicas that is N processes racing the same database on
every deploy. It connects **directly to Postgres**, bypassing PgBouncer, because
`migrate deploy` takes a session-level advisory lock that transaction pooling
breaks.

**PgBouncer** exists because Prisma opens a pool *per process* (~25 connections).
Six unpooled replicas would need 150 against a 100-connection budget — and pools
are lazy, so that failure is invisible at idle and arrives under load. Through
the pooler: **20 connections at 3 replicas, 20 at 6**.

**Redis** holds rate-limit counters. With the default in-memory store each
replica keeps its own, so a 10/min limit silently becomes 10 × N. It also holds
runtime override flags. Unset `REDIS_URL` and the app falls back to in-memory —
correct for one instance, and what keeps tests dependency-free.

Detail and measurements: [`IMPLEMENTATION.md`](IMPLEMENTATION.md),
[`SCALING.md`](SCALING.md).

---

## 5. Code map

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

## 6. Running tests

```bash
cd backend
npm test                 # 246 tests, ~4s
npm run test:cov         # with coverage
npm test -- slug.util    # one file
npm run typecheck        # tsc --noEmit
```

From the repo root, `npm test` and `npm run typecheck` cover both apps.

**What is tested:** 18 backend suites — the pure utilities (slug, url, date,
pagination, user-agent), the services (links, redirect, visits, analytics, auth,
rate-limit overrides), DTO transformation, and one e2e spec.

**What is not:** the frontend has **zero tests**. That is the largest known gap.
Start with `useClipboard` (it has a real `execCommand` fallback), `lib/validators.ts`
(it mirrors backend rules, so drift is a real risk), and one Playwright end-to-end
test covering shorten → copy → redirect → dashboard.

> Tests need no database or Redis. Prisma is mocked and the throttler falls back
> to in-memory storage, which is why `npm test` runs in seconds.

---

## 7. Making a change

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

### Changing environment variables

Env vars are fixed at **container creation**, so a restart is not enough:

```bash
docker compose up -d --force-recreate backend
```

### Faster loop, without Docker

```bash
npm run setup     # once
npm run dev       # Postgres in Docker; both dev servers on the host, hot-reload
```

---

## 8. Troubleshooting

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

### Full reset

```bash
npm run docker:reset      # ⚠️ destroys the database AND Grafana's volume
npm run docker:up
```

---

## 9. Where to go next

| Question | Doc |
|---|---|
| What is the exact shape of `GET /links`? | [`REFERENCE.md`](REFERENCE.md) |
| Why are slugs random rather than hashed? | [`IMPLEMENTATION.md`](IMPLEMENTATION.md) §6 |
| Why is `/redirect` exempt from rate limiting? | [`IMPLEMENTATION.md`](IMPLEMENTATION.md) §10 |
| What breaks first under load? | [`SCALING.md`](SCALING.md) |
| What still needs doing? | [`SCALING.md`](SCALING.md) — phases 3–6, each with its trigger metric |
