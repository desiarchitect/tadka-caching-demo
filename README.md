# Tadka Caching Demo

**Learn production caching by building a food delivery menu API.**

Companion code for [DesiArchitect](https://youtube.com/@DesiArchitect) caching masterclass. Two filmed acts: performance (Cache-Aside) and invalidation (stale price fix). Clone it, run it, break it, learn it.

No prior Redis experience needed. Just Docker and Node.js.

---

## What You'll Learn

| # | Demo | Caching Concept |
|---|------|-----------------|
| 1 | Act 1 Problem | Read-heavy load without cache - every request hits Postgres |
| 2 | Act 1 Fix | Cache-Aside pattern with Redis - repeated reads absorbed |
| 3 | Act 2 Problem | Stale cache after DB write - the 40-minute pricing bug |
| 4 | Act 2 Fix | Explicit cache invalidation on write |
| 5 | Bonus: TTL | Stale window vs auto-refresh after expiry |
| 6 | Bonus: Negative cache | Bad IDs hammering DB vs cached 404 |
| 7 | Bonus: Thundering herd | Expiry stampede vs request coalescing |
| 8 | Bonus: Write patterns | Write-Through vs Write-Behind latency |

All demos use a fictional **Tadka** food delivery app. Restaurant `biryani-house` serves Hyderabadi Biryani at Rs 300 (until the price update demo).

---

## Prerequisites

### 1. Docker Desktop

Postgres and Redis run inside Docker.

```bash
docker --version
docker compose version
```

### 2. Node.js (v18+)

```bash
node --version
npm --version
```

### 3. Ports

| Port | Used By |
|------|---------|
| `3000` | Tadka API server |
| `5433` | Postgres (host mapping) |
| `6379` | Redis |

---

## Quick Start

```bash
cd tadka-caching-demo

# Start Postgres + Redis
docker compose up -d

# Install dependencies
npm install

# Seed demo data (Biryani at Rs 300)
npm run demo:reset
```

Wait ~10 seconds after `docker compose up -d` for health checks to pass.

### Interactive Runner (Windows)

```powershell
.\run-demo.ps1
```

This starts infra, seeds data, and gives you a menu to pick any demo.

---

## Demo-by-Demo Guide

Each act has a **problem** step and a **fix** step. Run the API server in a separate terminal before running demo scripts.

### Act 1: Performance (Cache-Aside)

**Terminal 1 - Start API without cache:**
```bash
npm run api:no-cache
```

**Terminal 2 - Show the problem:**
```bash
npm run demo:performance:no-cache
```

You should see ~50 DB queries for 50 parallel reads (~200ms avg latency each).

Stop the server (`Ctrl+C`). **Terminal 1 - Start API with cache:**
```bash
npm run api:cache-aside
```

**Terminal 2 - Show the fix:**
```bash
npm run demo:performance:cache-aside
```

You should see 1 warm-up DB query, then 50 parallel cache hits, and much lower avg latency.

### Act 2: Invalidation (Stale Price)

Keep the cache-enabled server running (`npm run api:cache-aside`).

**Stale price problem:**
```bash
npm run demo:invalidation:stale-cache
```

Cache still serves Rs 300 after DB was updated to Rs 350.

**Explicit invalidation fix:**
```bash
npm run demo:invalidation:explicit
```

Cache key deleted, next read fetches Rs 350 from DB and repopulates cache.

---

## Bonus Labs (repo only - not filmed in the video)

Each lab follows the same **problem then fix** shape as Act 1 and Act 2.

**Two-terminal workflow:** start the matching API mode in **Terminal 1**, run the demo script in **Terminal 2**. When a lab switches from problem to fix, stop the server (`Ctrl+C`) and restart Terminal 1 with the new `api:labs:*` command.

**Run all labs automatically (after `docker compose up -d`):**
```bash
npm run test:smoke
```

### All commands quick reference

| Lab | Terminal 1 (API) | Terminal 2 - Problem | Terminal 2 - Fix |
|-----|------------------|----------------------|------------------|
| TTL | `api:labs:ttl` | `demo:invalidation:ttl-stale` | `demo:invalidation:ttl-expired` |
| Negative cache | `api:labs:negative-off` then `api:labs:negative-on` | `demo:traps:negative-cache:off` | `demo:traps:negative-cache:on` |
| Thundering herd | `api:labs:herd-off` then `api:labs:herd-on` | `demo:traps:thundering-herd:off` | `demo:traps:thundering-herd:on` |
| Write patterns | `api:cache-aside` | — | `demo:patterns:write-compare` |

### TTL Invalidation (deck slides 32)

**Terminal 1:**
```bash
npm run api:labs:ttl
```

**Problem:**
```bash
npm run demo:invalidation:ttl-stale
```
DB updated to Rs 350, but API still serves Rs 300 while the 5s TTL is alive.

**Fix:**
```bash
npm run demo:invalidation:ttl-expired
```
After TTL expires, the next read fetches Rs 350 from PostgreSQL without a manual `DEL`.

### Negative Caching (deck slide 20)

**Terminal 1:**
```bash
npm run api:labs:negative-off
```

**Terminal 2 - Problem:**
```bash
npm run demo:traps:negative-cache:off
```
20 parallel reads for `fake-restaurant` cause 20 DB lookups.

Stop the server (`Ctrl+C`). **Terminal 1 - Fix mode:**
```bash
npm run api:labs:negative-on
```

**Terminal 2 - Fix:**
```bash
npm run demo:traps:negative-cache:on
```
After one warm-up miss populates the negative cache, 20 parallel reads hit Redis only.

### Thundering Herd (deck slides 38-39)

**Terminal 1:**
```bash
npm run api:labs:herd-off
```

**Terminal 2 - Problem:**
```bash
npm run demo:traps:thundering-herd:off
```
After a 2s TTL expires, 50 parallel reads cause multiple DB hits.

Stop the server (`Ctrl+C`). **Terminal 1 - Fix mode:**
```bash
npm run api:labs:herd-on
```

**Terminal 2 - Fix:**
```bash
npm run demo:traps:thundering-herd:on
```
Same load causes exactly 1 DB hit via in-process request coalescing.

### Write Patterns (deck slides 21-25)

Keep `npm run api:cache-aside` running.

```bash
npm run demo:patterns:write-compare
```

Prints a side-by-side comparison of Write-Through vs Write-Behind write latency and trade-offs.

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Server status (`cacheEnabled`, `negativeCacheEnabled`, `coalesceMisses`, `menuTtlSeconds`) |
| GET | `/api/restaurants/:id/menu` | Menu read (Cache-Aside when enabled) |
| GET | `/api/stats` | DB query count, cache hits/misses |
| PUT | `/api/admin/.../price` | Update item price in DB + invalidate cache |
| PUT | `/api/demo/.../price-db-only` | Update price in DB only (intentionally leaves cache stale, for demo) |
| GET | `/api/restaurants/:id/settings` | Restaurant settings read (cached when enabled) |
| PUT | `/api/labs/.../settings/write-through` | Sync DB + Redis write (Write-Through lab) |
| PUT | `/api/labs/.../settings/write-behind` | Fast Redis write, async DB sync (Write-Behind lab) |
| GET | `/api/labs/.../settings/db` | Read settings directly from PostgreSQL |
| POST | `/api/admin/reset-demo` | Reset DB + flush Redis |

Toggle caching via environment variable:

```bash
CACHE_ENABLED=false npm run server   # every read hits DB
CACHE_ENABLED=true npm run server    # Redis Cache-Aside
```

---

## Inspect Redis

```bash
docker exec -it tadka-cache-redis redis-cli
KEYS tadka:*
GET tadka:restaurant:biryani-house:menu:v1
```

---

> [!NOTE]
> **No Dockerfile** — Node.js runs directly on your host (not containerised). Only Postgres and Redis run in Docker.
> **Redis persistence is intentionally disabled** (`--save ""`) so the cache is fully disposable between demo runs.

### Masterclass Slide Mapping & Terminal Workflow

For the masterclass recording, here is exactly how the scripts map to the slides and what they do under the hood:

#### Terminal 1: The Server Commands (Run in the background)
* **`npm run api:no-cache`**
  * **What it does:** Starts the Node.js API with caching disabled. Every `/menu` request goes straight to Postgres.
* **`npm run api:cache-aside`**
  * **What it does:** Starts the Node.js API with Cache-Aside enabled. Checks Redis first; fetches from Postgres and saves to Redis on a miss.
* **`npm run api:labs:ttl`**
  * **What it does:** Cache-Aside with a 5-second menu TTL (for TTL invalidation labs).
* **`npm run api:labs:negative-off` / `api:labs:negative-on`**
  * **What it does:** Toggles negative caching for invalid restaurant IDs.
* **`npm run api:labs:herd-off` / `api:labs:herd-on`**
  * **What it does:** 2-second menu TTL; coalescing off (problem) or on (fix) for thundering herd labs.

**Bonus lab commands (Terminal 2):** see [Bonus Labs](#bonus-labs-repo-only---not-filmed-in-the-video) above.

---

#### Terminal 2: The Action Commands (Run live on screen)

**ACT 1: Performance Demo (Slide 19)**
* **Scenario Context:** The API is running without caching. The database contains the Tadka menu with Biryani at Rs 300. We simulate 50 users requesting the menu at the exact same time.
* **Problem Command:** `npm run demo:performance:no-cache`
  * **What it does:** Fires 50 parallel user requests. Since `api:no-cache` is running, this causes 50 separate database queries.
* **How we solve it:** We restart the server with Cache-Aside enabled (`npm run api:cache-aside`) so the first request warms the cache, and all subsequent requests are absorbed by Redis.
* **Fix Command:** `npm run demo:performance:cache-aside`
  * **What it does:** Fires 50 parallel user requests. This results in exactly 50 cache hits (after one manual warm-up miss).

**ACT 2: Invalidation Demo (Slide 30)**
* **Scenario Context:** The API is running with Cache-Aside. The cache is already warmed up, currently holding the Biryani price at Rs 300. The restaurant owner changes the price to Rs 350.
* **Problem Command:** `npm run demo:invalidation:stale-cache`
  * **What it does:** Updates the database price to Rs 350 but intentionally **skips** deleting the cache key. The API still incorrectly returns the stale Rs 300 from Redis.
* **How we solve it:** We introduce an Explicit Invalidation step in the write path. When the database updates, we actively delete the cache key so the next read is forced to fetch fresh data.
* **Fix Command:** `npm run demo:invalidation:explicit`
  * **What it does:** Runs `DEL tadka:restaurant:biryani-house:menu:v1` to clear the cache. The next read goes to the database and fetches the fresh Rs 350.

---

## Cleanup

```bash
docker compose down -v
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `API not reachable` | Start the server first (`npm run api:cache-aside` or `api:no-cache`). |
| `Postgres not ready` | Wait 10s after `docker compose up -d`, then retry `npm run demo:reset`. |
| Act 1 problem shows cache hits | Restart server with `npm run api:no-cache`. |
| Act 2 shows fresh price on problem demo | Server may have cache off, or Redis was flushed. Run `npm run demo:reset` and retry. |
| Port 3000 in use | Set `PORT=3001` before starting the server. |

---

## File Structure

```
.
├── docker-compose.yml       # Postgres 16 + Redis 7
├── package.json
├── server.js                # Express API (Cache-Aside)
├── db.js                    # Postgres + artificial 200ms delay
├── cache.js                 # Redis helpers + hit/miss counters
├── seed.js                  # Reset demo data
├── demos/
│   ├── performance-no-cache.js
│   ├── performance-cache-aside.js
│   ├── invalidation-stale-cache.js
│   ├── invalidation-explicit.js
│   ├── ttl-stale.js
│   ├── ttl-expired.js
│   ├── negative-cache-off.js
│   ├── negative-cache-on.js
│   ├── thundering-herd-off.js
│   ├── thundering-herd-on.js
│   ├── write-compare.js
│   └── lib.js
├── scripts/smoke-test.mjs   # Runs all filmed + bonus demos
├── run-demo.ps1             # Interactive runner (Windows, items 9-20 = bonus labs)
└── README.md
```

---

## License

MIT. Built by [DesiArchitect](https://youtube.com/@DesiArchitect).