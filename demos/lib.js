const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const RESTAURANT_ID = 'biryani-house';
const ITEM_ID = 'biryani';

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return body;
}

async function waitForServer(maxAttempts = 20) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const health = await request('/health');
      return health;
    } catch (_err) {
      if (attempt === maxAttempts) {
        throw new Error(
          `API not reachable at ${BASE_URL}. Start the server first (npm run api:cache-aside or api:no-cache).`
        );
      }
      await sleep(500);
    }
  }
}

async function resetDemo() {
  return request('/api/admin/reset-demo', { method: 'POST' });
}

async function resetStats() {
  return request('/api/stats/reset', { method: 'POST' });
}

async function getStats() {
  return request('/api/stats');
}

async function fetchMenu(restaurantId = RESTAURANT_ID) {
  return request(`/api/restaurants/${restaurantId}/menu`);
}

async function fetchMenuRaw(restaurantId) {
  const response = await fetch(`${BASE_URL}/api/restaurants/${restaurantId}/menu`);
  const body = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function updatePriceDbOnly(priceInr) {
  return request(
    `/api/demo/restaurants/${RESTAURANT_ID}/items/${ITEM_ID}/price-db-only`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceInr }),
    }
  );
}

async function updatePriceWithInvalidation(priceInr) {
  return request(
    `/api/admin/restaurants/${RESTAURANT_ID}/items/${ITEM_ID}/price`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceInr }),
    }
  );
}

async function parallelNotFoundReads(count, restaurantId) {
  const startedAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: count }, () => fetchMenuRaw(restaurantId))
  );
  const elapsedMs = Date.now() - startedAt;

  return {
    results,
    elapsedMs,
    notFoundCount: results.filter((result) => result.status === 404).length,
    negativeCacheSources: results.filter(
      (result) => result.body && result.body.source === 'negative-cache'
    ).length,
    databaseSources: results.filter(
      (result) => result.body && result.body.source === 'database'
    ).length,
  };
}

async function parallelMenuReads(count, restaurantId = RESTAURANT_ID) {
  const startedAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: count }, () => fetchMenu(restaurantId))
  );
  const elapsedMs = Date.now() - startedAt;
  const latencies = results.map((result) => result.latencyMs);
  const avgLatencyMs = Math.round(
    latencies.reduce((sum, value) => sum + value, 0) / latencies.length
  );

  return {
    results,
    elapsedMs,
    avgLatencyMs,
    cacheSources: results.filter((result) => result.source === 'cache').length,
    dbSources: results.filter((result) => result.source === 'database').length,
  };
}

async function writeThroughSettings(restaurantId, deliveryRadiusKm) {
  return request(`/api/labs/restaurants/${restaurantId}/settings/write-through`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveryRadiusKm }),
  });
}

async function writeBehindSettings(restaurantId, deliveryRadiusKm) {
  return request(`/api/labs/restaurants/${restaurantId}/settings/write-behind`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveryRadiusKm }),
  });
}

async function getSettingsFromDb(restaurantId) {
  return request(`/api/labs/restaurants/${restaurantId}/settings/db`);
}

function printHeader(title) {
  console.log('');
  console.log('-----------------------------------------------------------');
  console.log(`  ${title}`);
  console.log('-----------------------------------------------------------');
  console.log('');
}

function printStats(stats, run) {
  console.log(`  Parallel requests : ${run.results.length}`);
  console.log(`  Wall clock time   : ${run.elapsedMs} ms`);
  console.log(`  Avg latency       : ${run.avgLatencyMs} ms per request`);
  console.log(`  Served from cache : ${run.cacheSources}`);
  console.log(`  Served from DB    : ${run.dbSources}`);
  console.log(`  DB menu fetches   : ${stats.databaseMenuFetches}`);
  console.log(`  DB pool max       : ${stats.poolMax}`);
  console.log(`  Peak DB fetches   : ${stats.peakConcurrentMenuFetches}`);
  console.log(`  Cache hits        : ${stats.cacheHits}`);
  console.log(`  Cache misses      : ${stats.cacheMisses}`);
  console.log(`  Cache errors      : ${stats.cacheErrors}`);
  if (typeof stats.negativeCacheHits === 'number') {
    console.log(`  Negative cache hits: ${stats.negativeCacheHits}`);
  }
  if (stats.cacheEnabled) {
    console.log(`  Hit ratio         : ${(stats.hitRatio * 100).toFixed(0)}%`);
  }
}

function assertHealthFlags(health, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (health[key] !== value) {
      throw new Error(
        `Restart the API with the correct lab mode. Expected ${key}=${value}, got ${health[key]}.`
      );
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  BASE_URL,
  RESTAURANT_ID,
  ITEM_ID,
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  fetchMenuRaw,
  updatePriceDbOnly,
  updatePriceWithInvalidation,
  parallelMenuReads,
  parallelNotFoundReads,
  writeThroughSettings,
  writeBehindSettings,
  getSettingsFromDb,
  printHeader,
  printStats,
  assertHealthFlags,
  sleep,
};
