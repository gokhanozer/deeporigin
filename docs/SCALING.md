# Scaling Plan — from one node to many

What must change to run this app as several backend replicas behind a load
balancer, ordered by when it starts to hurt.

Each item names **what breaks**, **why**, and **the change**, so the work can be
picked up in priority order rather than as a rewrite.

> ## Status: Phase 1 is implemented ✅
>
> The backend now scales horizontally:
>
> ```bash
> docker compose up -d --scale backend=3
> ```
>
> **Verified:** with 3 replicas and a 10-per-minute limit, exactly 10 requests
> were allowed and the rest returned `429` — not 30. Requests were confirmed
> spread across all three replicas, and the migration job ran exactly once.
>
> Tier 2 and Tier 3 remain open, and are deliberately traffic-driven rather than
> speculative — see [Suggested order](#suggested-order).

---

## What already scales — leave it alone

Worth stating first, so effort goes where it is needed:

| Component | Why it is fine |
|---|---|
| **Authentication** | JWTs are stateless and signature-verified. Any replica can serve any request; no shared session store, no sticky sessions |
| **Slug uniqueness** | Enforced by a Postgres unique index, with optimistic insert + retry. Race-free across *any* number of writers by construction |
| **Frontend** | Next.js standalone output is stateless; replicate freely |
| **Images** | Both already build to small, non-root, health-checked containers |
| **Config** | Injected via environment; nothing is read from local disk at runtime |

---

## Tier 1 — breaks correctness the moment you add a second node ✅ DONE

These are not performance concerns. They produce **wrong behaviour** at N > 1.

**All three shipped.** What follows describes the problem and the fix as built;
[Phase 1 as delivered](#phase-1-as-delivered) summarises the resulting files.

### 1.1 Rate limiting is per-process ✅

**Breaks:** `@nestjs/throttler` stores counters in an in-memory `Map`. With 3
replicas a "10 requests/min" limit becomes an effective 30/min, and an attacker
who rotates connections gets the full allowance from each node. The protection
silently degrades in proportion to how much you scale.

**Built:** `ThrottlerModule` now selects its storage at boot, in
`backend/src/app.module.ts`:

| `REDIS_URL` | Storage | Use |
|---|---|---|
| set | `ThrottlerStorageRedisService` over `ioredis` | Any deployment with >1 replica |
| unset / empty | default in-memory | Local dev, tests, single instance |

The fallback is what keeps `npm test` and `npm run dev` free of a Redis
dependency. Verified: the config factory returns `null` for both unset and
empty, and `ThrottlerModule` then omits `storage` entirely.

**Failure policy — fail open, loudly.** If Redis becomes unreachable the guard
lets requests through rather than rejecting them. For a URL shortener that is
the right trade: losing rate limiting is bad, but refusing *all* traffic because
a limiter is down is worse. `ioredis` is configured with
`maxRetriesPerRequest: 1` and a 2 s connect timeout so a dead Redis cannot add
seconds of latency to every request, and its `error` events are logged at
`error` level so the condition is alertable rather than silent.

Each replica logs on boot:

```
[ThrottlerStorage] Connected to Redis — rate limits are shared across replicas
```

---

### 1.2 Every replica runs database migrations on startup ✅

**Breaks:** the backend's entrypoint is

```yaml
command: sh -c "npx prisma migrate deploy && node dist/main.js"
```

Start 5 replicas simultaneously and all 5 race to migrate the same database.
Prisma takes an advisory lock, so you are unlikely to get a corrupted schema —
but you *will* get slow, noisy, failure-prone rollouts, and any replica whose
migration errors will crash-loop.

**Built:** a dedicated one-shot `migrate` service. The backend waits on it with
`condition: service_completed_successfully`, so no replica can query a schema
that does not exist yet, and its own command is now simply
`['node', 'dist/main.js']`.

Verified with 3 replicas: `shortener-migrate  Exited (0)` — the job ran **once**,
logging `No pending migrations to apply`, rather than three racing processes.

This maps directly onto the production equivalents: a Kubernetes `initContainer`
or Helm `pre-upgrade` hook, or an ECS one-off task run before the service
update. It also makes rollbacks cleaner, since schema changes become an explicit
deploy step you can gate on.

---

### 1.3 `container_name` and a published port make scaling impossible ✅

**Breaks:** `docker compose up --scale backend=3` fails outright. Both a
container name and a published host port are unique resources that exactly one
container can own.

**Built:** `container_name` and `ports` were removed from the `backend` service.
Compose now auto-names replicas `deeporigin-backend-1/-2/-3`, and a new
**nginx `lb` service** owns host port 4000 and fans requests across them.

One nginx detail matters. The upstream host is held in a *variable*:

```nginx
resolver 127.0.0.11 valid=5s ipv6=off;
set $backend_upstream backend:4000;
proxy_pass http://$backend_upstream;
```

With a literal `proxy_pass http://backend:4000`, nginx resolves the name **once
at startup and pins that IP forever** — new replicas would never receive
traffic, and a replaced container would black-hole requests. The variable forces
re-resolution through Docker's embedded DNS on the `valid=5s` interval, which is
what makes scale-up and scale-down take effect without restarting nginx.

nginx also forwards `X-Real-IP` and `X-Forwarded-For`, without which every
request would appear to originate from the proxy — breaking both rate-limit
bucketing and visit analytics. The chain is exactly one hop, matching
`app.set('trust proxy', 1)` in `main.ts`.

**Still single-instance: the frontend.** It keeps its `container_name` and
`3000:3000` mapping, so it cannot yet scale. This was a deliberate scope call —
Phase 1 targeted the backend, where the correctness bugs were. The frontend
follows the identical pattern when needed: drop those two fields and add a
second nginx upstream.

---

## Tier 2 — breaks under load, regardless of node count

### 2.1 The redirect hot path hits Postgres on every click

**Breaks:** `RedirectService.resolve()` issues a `findUnique` per redirect. This
is the single most-called query in the system and the one users feel directly as
latency. Every replica adds its own read load to one database.

**Change:** cache `slug → { id, targetUrl, isActive, expiresAt }` in Redis.

This is an ideal caching workload: tiny values, overwhelmingly read-heavy, and
changed only by an explicit user action.

```
GET slug → Redis hit  → redirect                    (~0.2 ms)
         → Redis miss → Postgres → populate → redirect
```

**Invalidation is the part to get right.** Delete the key on slug edit, target
change, deactivation and deletion — all of which already funnel through
`LinksService.update()` / `remove()`, so there is exactly one place to hook.
Set a TTL (say 1 hour) as a backstop against a missed invalidation.

Expect a very high hit rate: link popularity is heavily skewed, so a small cache
absorbs most traffic.

**Effort:** medium. The win is large — it removes the dominant query from the
database entirely.

---

### 2.2 `visitCount` serialises on hot links

**Breaks:** every click runs

```ts
this.prisma.link.update({
  where: { id: linkId },
  data: { visitCount: { increment: 1 }, lastVisitedAt: occurredAt },
})
```

inside a transaction with the `visit` insert. `UPDATE` takes a **row lock**.
Concurrent clicks on the *same* link therefore serialise — and a viral link is
precisely the case where traffic is highest. Adding replicas increases
contention on that one row rather than relieving it.

The transaction makes it worse: the lock is held for the duration of the insert
too.

**Change:** move visit recording off the request path and aggregate it.

```
redirect → enqueue visit event (Redis Stream / BullMQ / SQS)
              ↓
           worker: batch every ~5s
              ↓
           bulk-insert visits
           ONE update per link: visitCount += <batch count>
```

A link taking 10,000 clicks/sec goes from 10,000 row-lock acquisitions per
second to one every five seconds. This also fixes the durability gap in the
current fire-and-forget `void this.visits.recordVisit(...)`, where an in-flight
write is lost if the container is killed mid-request.

If you would rather not introduce a queue yet, the interim fix is **counter
sharding**: write to one of N rows per link and sum them on read. Cheaper to
build, but it complicates every read.

**Effort:** medium-large. This is the main architectural change on the list.

---

### 2.3 Analytics loads raw rows into application memory

**Breaks:**

```ts
this.prisma.visit.findMany({ where: visitWhere, select: VISIT_SELECTION })
```

Every dashboard view pulls **every visit row in the window** into Node and
aggregates in TypeScript. This was a deliberate, documented trade — one query
serving five breakdowns — and it is correct at current volumes. At a million
visits per window it is an out-of-memory crash.

**Change:** two steps, in order.

1. **Push aggregation into SQL.** `GROUP BY` for the time series and each
   breakdown. More round-trips, but constant memory and far less data on the
   wire.
2. **Pre-aggregate.** A `link_daily_stats` rollup table
   (`link_id, day, visits, unique_visitors`) written by the same worker that
   drains the visit queue. The dashboard then reads a handful of small rows
   instead of scanning the visits table. Keep raw visits for drill-down and
   expire them on a retention policy (say 90 days).

**Effort:** medium. Step 1 alone buys a lot of headroom.

---

## Tier 3 — infrastructure

### 3.1 Connection pool exhaustion

**Breaks:** Prisma opens a pool per process. 10 replicas × default pool can
exceed Postgres's `max_connections` (typically 100), and new connections start
being refused — which looks like a total outage.

**Change:** put **PgBouncer** in transaction-pooling mode in front of Postgres
and set an explicit, small `connection_limit` in the Prisma URL. Note that
transaction pooling disallows prepared statements, so add `pgbouncer=true` to
the connection string for Prisma.

### 3.2 Postgres is a single node

**Change:** managed Postgres with a **read replica**; route analytics reads
there. Redirects should be served from cache anyway, and writes stay on the
primary. Revisit only if a single primary genuinely saturates.

### 3.3 Graceful shutdown must drain in-flight work

`enableShutdownHooks()` is already wired, but the fire-and-forget visit write is
not tracked by it. Once visits go through a queue (2.2) this resolves itself —
the enqueue is synchronous and fast, and the worker drains independently.

### 3.4 Proxy trust depth

`app.set('trust proxy', 1)` trusts exactly one hop. Behind a cloud LB *plus* an
ingress controller there are two, and `extractClientIp` would read the wrong
address — breaking both rate-limit bucketing and visit geography. Set this to
the real number of trusted hops per environment; never to `true`, which lets a
client forge `X-Forwarded-For` and evade limits entirely.

### 3.5 Move rate limiting to the edge

At serious scale, the cheapest request is one that never reaches your origin. A
CDN or WAF (CloudFront + AWS WAF, Cloudflare) can absorb floods before they cost
you anything. Keep the application-level limiter as defence in depth.

---

## Phase 1 as delivered

| File | Change |
|---|---|
| `docker-compose.yml` | Added `redis` and one-shot `migrate` services; added the nginx `lb`; removed `container_name` + `ports` from `backend`; added `REDIS_URL` |
| `nginx/nginx.conf` | **New** — load balancer with dynamic DNS re-resolution and forwarded client IP |
| `backend/src/app.module.ts` | Throttler storage selected at boot; `createRedisThrottlerStorage()` with the fail-open policy |
| `backend/src/config/configuration.ts` | New `redis.url` key; `null` when unset **or** empty |
| `backend/package.json` | `@nest-lab/throttler-storage-redis`, `ioredis` |

**Verification performed**

| Check | Result |
|---|---|
| `--scale backend=3` starts cleanly | 3 healthy replicas |
| Requests spread across replicas | 3 / 6 / 2 across `backend-1/2/3` |
| **Rate limit shared, not multiplied** | **10 allowed, 5 blocked — not 30** |
| Migration job runs once | `shortener-migrate Exited (0)` |
| Counters stored in Redis | `{…:default}:hits`, `:blocked` |
| Scale back down to 1 | API stays reachable |
| In-memory fallback intact | `redis.url === null` when unset/empty; 166 tests pass without Redis |
| End to end through the LB | `/abc123` → 307; dashboard reads correctly |

---

## Suggested order

| Phase | Items | Outcome |
|---|---|---|
| **1** ✅ | 1.3 remove `container_name` · 1.2 migrations as a deploy step · 1.1 Redis throttler | **Done** — correct behaviour at N replicas |
| **2** | 3.1 PgBouncer · 3.4 proxy depth | Survives the connection math |
| **3** | 2.1 Redis cache on redirects | Removes the dominant query |
| **4** | 2.2 visit queue + worker | Removes write contention; makes tracking durable |
| **5** | 2.3 SQL aggregation, then rollups | Dashboard stops scaling with table size |
| **6** | 3.2 read replica · 3.5 edge limiting | Headroom |

Phase 1 is a day's work and is the only part strictly required to *deploy*
multiple nodes. Phases 3–5 are driven by measured traffic, not by anticipation —
each should be justified by a metric (p99 redirect latency, lock wait time,
dashboard query duration) rather than built speculatively.

---

## New infrastructure this implies

| Service | Used for | Phase | Status |
|---|---|---|---|
| **Redis** | shared rate-limit counters — later the slug cache and visit queue | 1 | ✅ running |
| **Load balancer** (nginx) | distributes across replicas | 1 | ✅ running |
| **Migration job** | applies schema changes once per deploy | 1 | ✅ running |
| **PgBouncer** | connection pooling | 2 | not started |
| **Worker process** | drains the visit queue, writes rollups | 4 | not started |

Redis earns its place three times over, which is the argument for adding it —
not rate limiting alone. Today it carries only the counters; phases 3 and 4 add
the slug cache and the visit queue to the same instance.
