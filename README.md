# Shortener

A full-stack URL shortener built for the DeepOrigin full-stack task.

Paste a long URL, get a short one, share it, and see how it performs.

```
https://some.place.example.com/foo/bar/biz  →  http://localhost:3000/abc123
```

**Stack:** React + Next.js (TypeScript) · NestJS (TypeScript) · Prisma · PostgreSQL · Redis · Docker

The required URL-shortener functionality is implemented, with optional scaling
and observability modes included to show how the system behaves beyond a single
local instance.

## Suggested Review Path

1. Run **Base Mode** from [How to Run Locally](#how-to-run-locally).
2. Exercise the [Quick API Smoke Test](#quick-api-smoke-test).
3. Check the [Requirements checklist](#requirements-checklist).
4. Read [Implementation notes](docs/IMPLEMENTATION.md) and
   [Scaling plan](docs/SCALING.md) for design tradeoffs and growth paths.

---

## How to Run Locally

The only prerequisite is Docker. The compose files are split into one default
application stack plus two optional overlays, which can also be combined:

| Mode | Command shape | What it starts |
|---|---|---|
| **1. Base mode** | `docker compose up --build` | The app: Postgres, PgBouncer, Redis, migrations, backend, frontend |
| **2. Scale mode** | add `-f docker-compose.scale.yml --scale backend=3` | Base stack plus nginx load balancing multiple backend replicas |
| **3. Observability mode** | add `-f docker-compose.observability.yml` | Base stack plus Prometheus, Grafana, Postgres exporter, PgBouncer exporter |
| **4. Compound mode** | add both overlays | Scale mode and Observability mode together |

The overlays compose cleanly, so you can also run scale and observability
together.

### 1. Base Mode

#### 1.1 Start

```bash
git clone <this-repo>
cd DeepOrigin
cp .env.example .env        # then edit the credentials
docker compose up --build
```

#### 1.2 URLs

| What | Mode | Where |
|------|------|-------|
| **App & short links** | Base | <http://localhost:3000> |
| API root — lists every endpoint | Base | <http://localhost:4000/api/v1> |
| API docs (Swagger) | Base | <http://localhost:4000/api/v1/docs> |
| Health probe | Base | <http://localhost:4000/api/v1/health/ready> |

Migrations run automatically. Nothing else to configure.

#### 1.3 Containers

| Container | Mode | Role |
|---|---|---|
| `shortener-postgres` | Base | PostgreSQL data store |
| `shortener-pgbouncer` | Base | Transaction-pooling connection proxy for Prisma |
| `shortener-redis` | Base | Shared rate-limit counters and runtime override flags |
| `shortener-setup-db` | Base | One-shot Prisma migration job |
| backend replica | Base | NestJS API on port 4000 |
| `shortener-frontend` | Base | Next.js frontend and short-link entry point |

**Try it:** shorten a URL on the home page, click the short link, then open
`/dashboard` — the visit count moves. The database starts empty by design, so
everything you see is real traffic.

#### 1.4 What `docker compose up` starts

| Included by default | Why |
|---|---|
| Postgres | Persistent storage for users, links and visits |
| PgBouncer | Protects Postgres from per-replica Prisma connection pools |
| Redis | Shared rate-limit counters and runtime override flags |
| One-shot migration job | Applies Prisma migrations exactly once before the API starts |
| One backend | Publishes API port `4000` directly in base mode |
| Frontend | Serves the app and short-link route on port `3000` |

The default command gives a reviewer the application, not a local platform.
Details for the optional overlays are below.

<details>
<summary><b>2. Scale Mode</b></summary>

Starts nginx as a local load balancer and runs multiple backend replicas.

#### 2.1 Start

```bash
docker compose \
    -f docker-compose.yml \
    -f docker-compose.scale.yml \
    up -d --build --scale backend=3
```

#### 2.2 URLs

| What | Mode | Where |
|------|------|-------|
| **App & short links** | Base | <http://localhost:3000> |
| API root — served through nginx | Scale | <http://localhost:4000/api/v1> |
| API docs (Swagger) | Scale | <http://localhost:4000/api/v1/docs> |
| Load-balancer health probe | Scale | <http://localhost:4000/api/v1/health> |

#### 2.3 Containers

| Container | Mode | Role |
|---|---|---|
| `shortener-postgres` | Base | PostgreSQL data store |
| `shortener-pgbouncer` | Base | Shared database connection pooler for all replicas |
| `shortener-redis` | Base | Shared rate-limit counters and runtime override flags |
| `shortener-setup-db` | Base | One-shot Prisma migration job |
| `shortener-frontend` | Base | Next.js frontend and short-link entry point |
| backend replicas | Scale | Multiple NestJS API instances, no published host port |
| `shortener-lb` | Scale | nginx load balancer that owns port `4000` |

#### 2.4 Scaling Behavior

Everything that makes replicas *correct* — Redis-backed rate limiting, the
one-shot migration job, PgBouncer — is in the base stack already, because those
are right at any replica count. The overlay only adds what scaling itself
requires.

Verified: with 3 replicas a 10-per-minute limit allows exactly 10 requests, not
30; database connections stay flat at 20 whether running 3 replicas or 6. See
[`docs/SCALING.md`](docs/SCALING.md).

*(In a real deployment this nginx would not exist — a managed load balancer fills
the role. It stands in so `--scale` is demonstrable locally.)*

</details>

<details>
<summary><b>3. Observability Mode</b></summary>

Starts Prometheus, Grafana, and database/pool exporters.

#### 3.1 Start

```bash
docker compose \
    -f docker-compose.yml \
    -f docker-compose.observability.yml \
    up -d
```

#### 3.2 URLs

| What | Mode | Where |
|------|------|-------|
| **App & short links** | Base | <http://localhost:3000> |
| API metrics endpoint | Base | <http://localhost:4000/api/v1/metrics> |
| Prometheus | Observability | <http://localhost:9090> — targets, alerts, PromQL |
| Grafana | Observability | <http://localhost:3001> — `admin` / `admin` |

#### 3.3 Containers

| Container | Mode | Role |
|---|---|---|
| `shortener-postgres` | Base | PostgreSQL data store |
| `shortener-pgbouncer` | Base | Transaction-pooling connection proxy for Prisma |
| `shortener-redis` | Base | Shared rate-limit counters and runtime override flags |
| `shortener-setup-db` | Base | One-shot Prisma migration job |
| backend replica | Base | NestJS API on port 4000 |
| `shortener-frontend` | Base | Next.js frontend and short-link entry point |
| `shortener-prometheus` | Observability | Scrapes app, Postgres and PgBouncer metrics |
| `shortener-grafana` | Observability | Dashboard UI, provisioned from files |
| `shortener-postgres-exporter` | Observability | PostgreSQL server metrics |
| `shortener-pgbouncer-exporter` | Observability | PgBouncer pool saturation metrics |

#### 3.4 Metrics Behavior

The backend exposes `GET /api/v1/metrics` in Prometheus format from the **base**
image — instrumentation is part of the application. The stack that *collects* it
is opt-in.

Composable with the scaling overlay to watch several replicas at once. Prometheus
discovers each replica by DNS and scrapes them **individually** — scraping through
nginx would round-robin every scrape to a different replica and make `rate()`
meaningless.

The Grafana datasource and dashboards are provisioned from files under
`observability/grafana/provisioning`. See
[`docs/IMPLEMENTATION.md` §12](docs/IMPLEMENTATION.md#12-observability).

</details>

<details>
<summary><b>4. Compound Mode</b></summary>

Starts Base Mode with Scale Mode as well as Observability Mode together.

#### 4.1 Start

```bash
docker compose \
    -f docker-compose.yml \
    -f docker-compose.scale.yml \
    -f docker-compose.observability.yml \
    up -d --build --scale backend=3
```

#### 4.2 URLs

| What | Mode | Where |
|------|------|-------|
| **App & short links** | Base | <http://localhost:3000> |
| API root — served through nginx | Scale | <http://localhost:4000/api/v1> |
| API metrics endpoint | Base | <http://localhost:4000/api/v1/metrics> |
| Prometheus | Observability | <http://localhost:9090> — targets, alerts, PromQL |
| Grafana | Observability | <http://localhost:3001> — `admin` / `admin` |

#### 4.3 Containers

| Container | Mode | Role |
|---|---|---|
| base infrastructure | Base | Postgres, PgBouncer, Redis and the one-shot migration job |
| `shortener-frontend` | Base | Next.js frontend and short-link entry point |
| backend replicas | Scale | Multiple NestJS API instances, no published host port |
| `shortener-lb` | Scale | nginx load balancer that owns port `4000` |
| observability containers | Observability | Prometheus, Grafana, Postgres exporter and PgBouncer exporter |

#### 4.4 Compound Behavior

This is the best compound mode for validating horizontal scaling and metrics
together. Prometheus scrapes backend replicas individually rather than through
nginx, so per-replica counters and request rates remain meaningful.

</details>

---

## Documentation

🚀 **[Developer guide →](docs/DEVELOPER_GUIDE.md)** — code map, testing, development
workflow, and troubleshooting.

📋 **[Reference →](docs/REFERENCE.md)** — env vars, endpoints, schema, Redis keys, metrics, and ports.

📖 **[Implementation notes →](docs/IMPLEMENTATION.md)** — architecture, data model, and
the reasoning behind key design decisions.

📈 **[Scaling plan →](docs/SCALING.md)** — scaling limits, bottlenecks, and what changes as traffic grows.

---

## Requirements checklist

Every item from the task description, and where it lives:

| Requirement | Status | Implementation |
|---|:--:|---|
| React app to enter a URL | ✅ | `frontend/src/components/links/ShortenForm.tsx` |
| Form returns a shortened URL | ✅ | `POST /links` → `LinksService.create` |
| Record saved to a database | ✅ | Prisma + PostgreSQL, `Link` model |
| Slug is unique | ✅ | Unique DB index + race-free retry on collision |
| Short URL redirects to the target | ✅ | `frontend/src/app/[slug]/page.tsx` (307) |
| Invalid slug shows a 404 page | ✅ | `frontend/src/app/not-found.tsx` |
| List of all URLs in the database | ✅ | `/links` page, `GET /links` |
| Accounts, users see their own URLs | ✅ | JWT auth, `GET /links?mineOnly=true` |
| URL is validated as a real URL | ✅ | `url.util.ts` (WHATWG parser, not a regex) |
| Error message shown when invalid | ✅ | Inline field errors in the form |
| Easy to copy to clipboard | ✅ | `CopyButton` + `useClipboard` (with fallback) |
| Users can modify their slug | ✅ | `EditSlugModal` → `PATCH /links/:id` |
| Visits to short URLs are tracked | ✅ | `Visit` table, written on every redirect |
| Rate limiting against bad actors | ✅ | Per-route throttling, proxy-aware |
| Dashboard showing popularity | ✅ | `/dashboard` — trend, breakdowns, top links |
| Docker images of the application | ✅ | Multi-stage Dockerfiles + compose |
| React **with TypeScript** | ✅ | Strict mode, zero `any` |
| Node.js **with TypeScript** | ✅ | NestJS, strict mode |

**Beyond the brief:** live slug-availability checking, link search and sorting, per-link
analytics pages, All-links / My-links scoping, analytics windows from 24 hours to 90 days,
reserved-slug protection, SSRF and stored-XSS guards, privacy-preserving IP hashing, health
probes, Swagger docs, Prometheus metrics, and a backend test suite covering every service
and pure utility.

---

## Quick API Smoke Test

```bash
# Shorten a URL
curl -X POST http://localhost:4000/api/v1/links \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://some.place.example.com/foo/bar/biz"}'

# Follow the short link (records a visit)
curl -i http://localhost:3000/<slug>

# An unknown slug gives a 404 page
curl -i http://localhost:3000/nope

# Invalid input is rejected with a readable message
curl -X POST http://localhost:4000/api/v1/links \
  -H 'Content-Type: application/json' -d '{"url":"not a url"}'
```

---

## Native Development

Use this when you want to run the backend and frontend directly on your machine
instead of inside Docker. You need Node 20+ and a PostgreSQL instance.

```bash
# 1. Database only
docker compose up -d postgres

# 2. Backend  →  http://localhost:4000
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run start:dev

# 3. Frontend  →  http://localhost:3000
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

### Useful commands

```bash
# Backend
npm test              # backend suite (no database needed)
npm run test:cov      # with coverage
npm run typecheck     # tsc --noEmit
npm run prisma:studio # browse the database

# Frontend
npm run build
npm run typecheck
```
