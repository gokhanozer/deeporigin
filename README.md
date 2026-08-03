# Shortly — URL Shortener

A full-stack URL shortener built for the DeepOrigin full-stack task.

Paste a long URL, get a short one, share it, and see how it performs.

```
https://some.place.example.com/foo/bar/biz  →  http://localhost:3000/abc123
```

**Stack:** React + Next.js (TypeScript) · NestJS (TypeScript) · Prisma · PostgreSQL · Docker

---

## Run it

The only prerequisite is Docker.

```bash
git clone <this-repo>
cd DeepOrigin
cp .env.example .env        # then edit the credentials
docker compose up --build
```

| What | Where |
|------|-------|
| **App & short links** | <http://localhost:3000> |
| API root — lists every endpoint | <http://localhost:4000/api/v1> |
| API docs (Swagger) | <http://localhost:4000/api/v1/docs> |
| Health probe | <http://localhost:4000/api/v1/health/ready> |

Migrations run automatically. Nothing else to configure.

**Try it:** shorten a URL on the home page, click the short link, then open
`/dashboard` — the visit count moves. The database starts empty by design, so
everything you see is real traffic.

### What `docker compose up` starts

**Six services — the application.** Postgres, PgBouncer, Redis, a one-shot
migration job, one backend and the frontend. No load balancer; the backend
publishes port 4000 itself.

**Scaling and monitoring are optional add-ons, not the default.** They live in
separate compose overlays you opt into, because someone running this for the
first time should get an application, not a platform. Details in the two
sections below.

<details>
<summary><b>Optional: run several API replicas</b></summary>

The API is built to scale horizontally. Layering on `docker-compose.scale.yml`
drops the backend's port mapping and puts nginx in front, so replicas can share
the host port:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml \
  up -d --build --scale backend=3
```

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
<summary><b>Optional: Prometheus + Grafana</b></summary>

The backend exposes `GET /api/v1/metrics` in Prometheus format from the **base**
image — instrumentation is part of the application. The stack that *collects* it
is opt-in:

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.observability.yml up -d
```

| | |
|---|---|
| Prometheus | <http://localhost:9090> — targets, alerts, PromQL |
| Grafana | <http://localhost:3001> — `admin` / `admin` |

Composable with the scaling overlay to watch several replicas at once. Prometheus
discovers each replica by DNS and scrapes them **individually** — scraping through
nginx would round-robin every scrape to a different replica and make `rate()`
meaningless.

The Grafana datasource is provisioned; dashboards are deliberately not. See
[`docs/IMPLEMENTATION.md` §12](docs/IMPLEMENTATION.md#12-observability).

</details>

---

## Documentation

🚀 **[Developer guide →](docs/DEVELOPER_GUIDE.md)** — **start here.** Quickstart, the
four run modes, code map, testing, troubleshooting.

📋 **[Reference →](docs/REFERENCE.md)** — env vars, endpoints, schema, Redis keys, metrics.

📖 **[Implementation notes →](docs/IMPLEMENTATION.md)** — architecture, data model, and
the reasoning behind each design decision.

📈 **[Scaling plan →](docs/SCALING.md)** — what changes to run this across multiple
nodes, ordered by when each bottleneck starts to hurt.

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
| Docker image of the application | ✅ | Multi-stage Dockerfiles + compose |
| React **with TypeScript** | ✅ | Strict mode, zero `any` |
| Node.js **with TypeScript** | ✅ | NestJS, strict mode |

**Beyond the brief:** live slug-availability checking, link search and sorting, per-link
analytics pages, All-links / My-links scoping, analytics windows from 24 hours to 90 days,
link expiry, reserved-slug protection, SSRF and stored-XSS guards, privacy-preserving IP
hashing, health probes, Swagger docs, Prometheus metrics, and 246 unit tests.

---

## Try it

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

## Local development (without Docker)

You need Node 20+ and a PostgreSQL instance.

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
npm test              # 246 unit tests
npm run test:cov      # with coverage
npm run typecheck     # tsc --noEmit
npm run prisma:studio # browse the database

# Frontend
npm run build
npm run typecheck
```

---

## Project layout

```
.
├── docker-compose.yml              Base: Postgres · PgBouncer · Redis · migrate · backend · frontend
├── docker-compose.scale.yml        Overlay: nginx load balancer, for --scale backend=N
├── docker-compose.observability.yml Overlay: Prometheus · Grafana · 2 exporters
├── nginx/nginx.conf                Load balancer config (scaled mode only)
├── observability/                  Prometheus scrape config, alert rules, Grafana provisioning
├── docs/
│   ├── DEVELOPER_GUIDE.md      Start here — quickstart, run modes, code map, testing
│   ├── REFERENCE.md            Env vars, endpoints, schema, Redis keys, metrics
│   ├── IMPLEMENTATION.md       Full technical write-up
│   ├── SCALING.md              Scaling plan, phase by phase
│   └── DeepOriginTaskDescription.pdf
├── backend/                    NestJS API
│   ├── prisma/schema.prisma    Data model (User, Link, Visit)
│   └── src/
│       ├── common/             Reusable utilities, guards, filters, decorators
│       ├── config/             Typed configuration + env validation
│       ├── auth/               JWT registration and login
│       ├── links/              Create, list, update, delete
│       ├── redirect/           Slug resolution (the hot path)
│       ├── visits/             Click tracking
│       └── analytics/          Dashboard aggregation
└── frontend/                   Next.js App Router
    └── src/
        ├── app/                Routes, including [slug] and not-found
        ├── components/         UI primitives, link views, charts
        ├── hooks/              useClipboard, useAsync, useDebouncedValue
        ├── lib/                API client, validators, formatters, types
        └── providers/          Auth and toast context
```

---

## Notes

- **Short links resolve on the frontend domain** (`localhost:3000/abc123`), matching the
  `https://{domain}/abc123` shape in the brief. The Next.js catch-all route resolves the
  slug server-side, so there is no intermediate page and JavaScript is not required.
- **Redirects are 307, not 301.** Browsers cache permanent redirects indefinitely, which
  would break slug editing and silently under-count visits.
- **Anonymous use is a first-class path.** Shortening a URL never requires an account;
  signing in adds ownership, editing and analytics on top.
- The demo `JWT_SECRET` and `IP_HASH_SALT` in `docker-compose.yml` are for local use only.
  The backend refuses to start in production with weak secrets.
