# Reference

Lookup tables. Nothing here explains *why* — see
[`IMPLEMENTATION.md`](IMPLEMENTATION.md) for reasoning and
[`DEVELOPER_GUIDE.md`](DEVELOPER_GUIDE.md) to get running.

1. [Environment variables](#environment-variables)
2. [API endpoints](#api-endpoints)
3. [Database schema](#database-schema)
4. [Rate limiting](#rate-limiting)
5. [Redis keys](#redis-keys)
6. [Metrics](#metrics)
7. [Ports](#ports)

---

## Environment variables

### Root `.env` — read by `docker-compose.yml`

Gitignored; copy from `.env.example`. Compose interpolates these into service
definitions, so no credential is committed. Secrets use `${VAR:?message}`, so a
missing one aborts startup with a clear error instead of silently starting a
database with an empty password.

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` | — | **Required.** Database user |
| `POSTGRES_PASSWORD` | — | **Required.** Database password |
| `POSTGRES_DB` | — | **Required.** Database name — keep lower-case |
| `POSTGRES_PORT` | `5433` | Port Postgres listens on, inside *and* outside the container |
| `JWT_SECRET` | — | **Required.** Token signing secret |
| `IP_HASH_SALT` | — | **Required.** Salt for hashing visitor IPs |

### Backend

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | **Required.** Runtime connection, via PgBouncer. Needs `?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | falls back to `DATABASE_URL` | Migrations — direct to Postgres, bypassing the pooler |
| `NODE_ENV` | `development` | `production` enables extra hardening |
| `PORT` | `4000` | HTTP port |
| `API_PREFIX` | `api/v1` | Route prefix |
| `SWAGGER_ENABLED` | off when `NODE_ENV=production`, else on | Mounts the Swagger UI at `{API_PREFIX}/docs`. The compose stack sets it `true` so the demo serves docs despite running in production mode |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed browser origins |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Base used to build short URLs |
| `JWT_SECRET` | dev value | **Required in production**, ≥16 chars |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |
| `SLUG_LENGTH` | `7` | Generated slug length |
| `MAX_SLUG_ATTEMPTS` | `5` | Collision retries before failing |
| `IP_HASH_SALT` | dev value | **Required in production**. Changing it resets unique-visitor counts |
| `REDIS_URL` | *(unset)* | Shared counters + overrides. Unset ⇒ per-process in-memory |
| `PRISMA_LOG_QUERIES` | `false` | Log every SQL statement |
| `RATE_LIMIT_*` | see [below](#rate-limiting) | Rate-limit defaults |

### Frontend

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | API base for **browser** code |
| `API_INTERNAL_URL` | falls back to the above | API base for **server** code |
| `NEXT_PUBLIC_SHORT_DOMAIN` | `localhost:3000` | Cosmetic prefix in the custom-slug field |

> **`NEXT_PUBLIC_*` is inlined at build time**, not read at runtime. In Docker it
> must be passed as a **build arg**; setting it only under `environment:` leaves
> the browser calling the default URL.
>
> **Two API URLs exist** because `NEXT_PUBLIC_API_URL` is resolved by the
> visitor's *browser* (`localhost:4000`) while `API_INTERNAL_URL` is used by
> server-side code over the compose network (`backend:4000`).

---

## API endpoints

Base path `/api/v1`. Swagger at `/api/v1/docs`, controlled by `SWAGGER_ENABLED`
— on by default outside production, and switched on explicitly in the compose
stack so the demo serves it.

### Auth

| Method | Path | Auth | Description |
|---|---|:--:|---|
| `POST` | `/auth/register` | — | Create account → `{ accessToken, user }` |
| `POST` | `/auth/login` | — | Sign in → `{ accessToken, user }` |
| `GET` | `/auth/me` | ✅ | Current user — restores a session on page load |

### Links

| Method | Path | Auth | Description |
|---|---|:--:|---|
| `POST` | `/links` | optional | Create. Signed in ⇒ owned. A URL that already has a matching link returns that link with `alreadyExisted: true` |
| `GET` | `/links` | optional | List. `?mineOnly=true` scopes to caller |
| `GET` | `/links/:id` | optional | Single link |
| `PATCH` | `/links/:id` | ✅ owner | Update slug, URL, title, active flag, expiry. Anonymous callers get `401` explaining to create a new link instead |
| `DELETE` | `/links/:id` | ✅ owner | Delete link and its visits |
| `GET` | `/links/slug-available/:slug` | — | Live availability check |

`GET /links` query: `page`, `pageSize` (max 100), `search`, `sortBy`
(`createdAt` \| `visitCount` \| `lastVisitedAt` \| `slug`), `sortOrder`
(`asc` \| `desc`), `mineOnly`.

### Redirect

| Method | Path | Description |
|---|---|---|
| `POST` | `/redirect/:slug/resolve` | Resolve **and record a visit** → `{ targetUrl }` |
| `GET` | `/redirect/:slug` | Real 302, for curl and tests |
| `GET` | `/redirect/:slug/peek` | Resolve **without** counting a visit |

### Analytics

| Method | Path | Auth | Description |
|---|---|:--:|---|
| `GET` | `/analytics/overview` | optional | Dashboard. `?days=` (1–365), `?mineOnly=` |
| `GET` | `/analytics/links/:id` | owner | Per-link analytics |

### Ops

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/health/ready` | Readiness — includes a database round-trip |
| `GET` | `/metrics` | Prometheus exposition |

### Error envelope

Every failure returns the same shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Only http and https URLs are supported",
  "details": ["optional field-level messages"],
  "path": "/api/v1/links",
  "timestamp": "2026-08-01T00:00:00.000Z"
}
```

---

## Database schema

```
User  ──1:N──▶  Link  ──1:N──▶  Visit
```

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | UUID |
| `email` | `text` **UNIQUE** | Lower-cased, trimmed |
| `passwordHash` | `text` | bcrypt; plaintext never stored |
| `displayName` | `text?` | Optional |
| `createdAt` / `updatedAt` | `timestamp` | |

### `links`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | UUID |
| `slug` | `text` **UNIQUE** | Uniqueness enforced by the index, not the app |
| `targetUrl` | `text` | Normalised absolute http(s) URL |
| `title` | `text?` | Optional label |
| `isCustomSlug` | `boolean` | Whether the user chose it |
| `visitCount` | `integer` | Denormalised counter, written in the same transaction as the visit |
| `lastVisitedAt` | `timestamp?` | |
| `isActive` | `boolean` | Soft disable |
| `expiresAt` | `timestamp?` | Optional expiry |
| `ownerId` | `text?` | **NULL for anonymous links** |
| `createdAt` / `updatedAt` | `timestamp` | |

### `visits`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | |
| `linkId` | `text` FK | `ON DELETE CASCADE` |
| `occurredAt` | `timestamp` | |
| `ipHash` | `text?` | Salted SHA-256 — **never the raw IP** |
| `userAgent` | `text?` | Raw header, retained for future parsing |
| `browser` / `os` / `deviceType` | `text?` | Derived at write time |
| `referrer` | `text?` | Referring **host** only |

### Indexes

| Table | Index | Serves |
|---|---|---|
| `links` | `links_slug_key` **UNIQUE** | The redirect lookup; enforces slug uniqueness |
| `links` | `links_ownerId_createdAt_idx` | "My links, newest first" |
| `links` | `links_visitCount_idx` | Most-popular ranking (dashboard top-N) |
| `links` | `links_createdAt_id_idx` | List sorted newest/oldest first — the default view |
| `links` | `links_visitCount_id_idx` | List sorted by most visited |
| `links` | `links_lastVisitedAt_id_idx` | List sorted by recently visited |

> The three `*_id_idx` indexes lead **descending** and end in `id`. Both matter:
> `buildOrderBy` emits `ORDER BY <col> DESC, id ASC`, and an index missing
> either property is not used. See [`SCALING.md` §2.5](SCALING.md) for the
> measurements.
| `users` | `users_email_key` **UNIQUE** | Login |
| `visits` | `visits_linkId_occurredAt_idx` | Per-link analytics windows |
| `visits` | `visits_occurredAt_idx` | Global visits-over-time |

---

## Rate limiting

### Defaults — environment variables

Set on the **backend service only**. Changing them requires
`docker compose up -d --force-recreate backend`.

| Variable | Default | Applies to |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window length (1 minute) |
| `RATE_LIMIT_MAX` | `100` | General API allowance |
| `RATE_LIMIT_CREATE_MAX` | `10` | `POST /links` — the abusable write path |
| `RATE_LIMIT_AUTH_MAX` | `5` | `/auth/register`, `/auth/login` — brute-force protection |

### Buckets

| Bucket | Covers | Default |
|---|---|---|
| `auth` | `POST /auth/register`, `POST /auth/login` — **not** `GET /auth/me` | 5/min |
| `create` | `POST /links` | 10/min |
| `default` | everything else | 100/min |

**Exempt:** `/redirect/*`, `/health*`, `/metrics`.

### Response headers

| Header | Meaning |
|---|---|
| `X-RateLimit-Limit` | Requests allowed per window |
| `X-RateLimit-Remaining` | Left in this window |
| `X-RateLimit-Reset` | Seconds until it refills |
| `Retry-After` | Sent only on `429` |

---

## Redis keys

### Rate-limit counters — written by the app

The *tracker* identifies the caller: `user:<id>` when signed in, otherwise
`ip:<client-ip>` (read from `X-Forwarded-For` first, since behind a proxy
`req.ip` is the proxy's address).

| Key | Meaning | TTL |
|---|---|---|
| `{<hashed-tracker>:default}:hits` | Requests counted in the current window | window length |
| `{<hashed-tracker>:default}:blocked` | Set once the limit is exceeded | block duration |

### Override flags — set by operators

| Key | Applies to |
|---|---|
| `ratelimit:override:auth` | `/auth/register`, `/auth/login` |
| `ratelimit:override:create` | `POST /links` |
| `ratelimit:override:default` | every other endpoint |

Value is JSON; all fields optional and combinable:

| Field | Effect |
|---|---|
| `limit` | Replacement request allowance for the window |
| `ttl` | Replacement window length, in **milliseconds** |
| `disabled` | `true` switches enforcement off for that bucket |

```bash
# tighten link creation to 2/min for 15 minutes
docker compose exec redis redis-cli SET ratelimit:override:create '{"limit":2}' EX 900

# widen the general bucket: 500 requests per 30s window, for an hour
docker compose exec redis redis-cli SET ratelimit:override:default '{"limit":500,"ttl":30000}' EX 3600

# switch auth limiting off for a 10-minute load test
docker compose exec redis redis-cli SET ratelimit:override:auth '{"disabled":true}' EX 600

# revert · inspect
docker compose exec redis redis-cli DEL ratelimit:override:create
docker compose exec redis redis-cli GET ratelimit:override:create
docker compose exec redis redis-cli TTL ratelimit:override:create
```

**Always set `EX`** so an emergency change cannot be forgotten. Changes reach
every replica within ~5 seconds (each backend caches the lookup for 5 s).

> **Loosening a limit does not un-block an already-blocked client** — the
> `:blocked` key has its own TTL, checked independently of the current limit. To
> restore service immediately, clear the counters too:
> ```bash
> docker compose exec redis redis-cli --scan --pattern '*default*' \
>   | xargs docker compose exec -T redis redis-cli DEL
> ```

---

## Metrics

`GET /api/v1/metrics`, Prometheus text format.

### Custom

| Metric | Type | Labels | Answers |
|---|---|---|---|
| `shortener_redirect_total` | counter | `result` | Traffic volume, and what share 404s |
| `shortener_redirect_duration_seconds` | histogram | `result` | Is the hot path fast? |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status` | Which endpoint is slow or erroring |
| `shortener_link_created_total` | counter | `slug_type` | Growth; custom vs generated |
| `shortener_slug_collision_total` | counter | — | When to raise `SLUG_LENGTH` |
| `shortener_rate_limit_rejected_total` | counter | `bucket` | How much traffic is shed, and from where |
| `shortener_visit_record_failed_total` | counter | — | Whether fire-and-forget visit writes are failing |

`route` is always the **route template** (`/links/:id`), never the resolved path
— see the cardinality note in
[`IMPLEMENTATION.md` §12](IMPLEMENTATION.md#12-observability).

### Free, via libraries

| Source | Provides |
|---|---|
| `prom-client` defaults | CPU, memory, GC, **event-loop lag** |
| Prisma `$metrics` | Client-side pool stats |
| `postgres-exporter` | `max_connections`, backends, commits/rollbacks, cache hit ratio |
| `pgbouncer-exporter` | Pool saturation, clients waiting, max wait |

### Useful queries

```promql
# redirect throughput by outcome
sum by (result) (rate(shortener_redirect_total[5m]))

# p99 redirect latency — the alert threshold is 0.25
histogram_quantile(0.99, sum by (le) (rate(shortener_redirect_duration_seconds_bucket[5m])))

# slowest endpoints
topk(5, histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m]))))

# traffic being shed, by bucket
sum by (bucket) (rate(shortener_rate_limit_rejected_total[5m]))

# pool saturation
sum(pgbouncer_pools_client_waiting_connections)
```

### Alert rules

`observability/alerts.yml`:

| Alert | Fires when | Action |
|---|---|---|
| `BackendReplicaDown` | replica unscrapeable 1 min | investigate the instance |
| `RedirectLatencyHigh` | p99 > 250 ms for 10 min | enable the slug cache — Phase 3 |
| `VisitWritesFailing` | any failure rate for 5 min | analytics being lost silently |
| `RateLimitRejectionSpike` | sustained 429s per bucket | abuse, or a limit set too low |
| `SlugKeyspaceFilling` | collisions rising for 30 min | raise `SLUG_LENGTH` |

---

## Ports

| Port | Service | Mode |
|---|---|---|
| `3000` | Frontend + short links | all |
| `4000` | API (or nginx in scaled mode) | all |
| `5433` | PostgreSQL | all |
| `6432` | PgBouncer | internal only |
| `6379` | Redis | internal only |
| `3001` | Grafana | observability |
| `9090` | Prometheus | observability |
