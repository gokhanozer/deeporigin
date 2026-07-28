# Shortly — URL Shortener

A full-stack URL shortener built for the DeepOrigin full-stack task.

Paste a long URL, get a short one, share it, and see how it performs.

```
https://some.place.example.com/foo/bar/biz  →  http://localhost:3000/abc123
```

**Stack:** React + Next.js (TypeScript) · NestJS (TypeScript) · Prisma · PostgreSQL · Docker

📖 **[Full implementation notes →](docs/IMPLEMENTATION.md)** — architecture, data model,
API reference, reusable-function catalogue, and the reasoning behind each design decision.

📈 **[Scaling plan →](docs/SCALING.md)** — what changes to run this across multiple nodes,
ordered by when each bottleneck starts to hurt.

---

## Quick start

The only prerequisite is Docker.

```bash
git clone <this-repo>
cd DeepOrigin
cp .env.example .env        # then edit the credentials
docker compose up --build
```

The API scales horizontally — run several replicas behind the bundled nginx load
balancer, with rate-limit counters shared through Redis:

```bash
docker compose up -d --build --scale backend=3
```

| What | Where |
|------|-------|
| App & short links | <http://localhost:3000> |
| API | <http://localhost:4000/api/v1> |
| API docs (Swagger) | <http://localhost:4000/api/v1/docs> |
| Health probe | <http://localhost:4000/api/v1/health/ready> |

Database migrations are applied automatically on start-up. Nothing else to configure.

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
analytics pages, link expiry, reserved-slug protection, SSRF and stored-XSS guards,
privacy-preserving IP hashing, health probes, Swagger docs, and 124 unit tests.

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
npm run db:seed        # optional demo data — demo@example.com / demo12345
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
npm test              # 124 unit tests
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
├── docker-compose.yml          Postgres · Redis · migrate job · backend · nginx · frontend
├── nginx/nginx.conf            Load balancer across backend replicas
├── docs/
│   ├── IMPLEMENTATION.md       Full technical write-up
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
