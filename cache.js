const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

const NEGATIVE_SENTINEL = '__NOT_FOUND__';
const inflightMissFetches = new Map();

let cacheHits = 0;
let cacheMisses = 0;
let cacheErrors = 0;
let negativeCacheHits = 0;

function menuKey(restaurantId) {
  return `tadka:restaurant:${restaurantId}:menu:v1`;
}

function menuMissKey(restaurantId) {
  return `tadka:restaurant:${restaurantId}:menu:miss:v1`;
}

function settingsKey(restaurantId) {
  return `tadka:restaurant:${restaurantId}:settings:v1`;
}

function getDefaultMenuTtl() {
  const ttl = Number(process.env.MENU_TTL_SECONDS || 3600);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 3600;
}

function getCacheStats() {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    errors: cacheErrors,
    negativeCacheHits,
  };
}

function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
  cacheErrors = 0;
  negativeCacheHits = 0;
}

function recordCacheError() {
  cacheErrors += 1;
}

async function waitForRedis() {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
      await redis.ping();
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new Error(`Redis not ready after ${maxAttempts} attempts: ${err.message}`);
      }
      await sleep(1000);
    }
  }
}

async function getCachedMenu(restaurantId) {
  const raw = await redis.get(menuKey(restaurantId));
  if (!raw) {
    cacheMisses += 1;
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    cacheHits += 1;
    return parsed;
  } catch {
    cacheMisses += 1;
    await redis.del(menuKey(restaurantId));
    return null;
  }
}

async function setCachedMenu(restaurantId, menu, ttlSeconds = getDefaultMenuTtl()) {
  await redis.set(menuKey(restaurantId), JSON.stringify(menu), 'EX', ttlSeconds);
}

async function getCachedNegative(restaurantId) {
  const raw = await redis.get(menuMissKey(restaurantId));
  if (raw === NEGATIVE_SENTINEL) {
    negativeCacheHits += 1;
    return true;
  }
  return false;
}

async function setCachedNegative(restaurantId, ttlSeconds = 60) {
  await redis.set(menuMissKey(restaurantId), NEGATIVE_SENTINEL, 'EX', ttlSeconds);
}

async function getCachedSettings(restaurantId) {
  const raw = await redis.get(settingsKey(restaurantId));
  if (!raw) {
    cacheMisses += 1;
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    cacheHits += 1;
    return parsed;
  } catch {
    cacheMisses += 1;
    await redis.del(settingsKey(restaurantId));
    return null;
  }
}

async function setCachedSettings(restaurantId, settings, ttlSeconds = 3600) {
  await redis.set(settingsKey(restaurantId), JSON.stringify(settings), 'EX', ttlSeconds);
}

async function coalesceMiss(key, fetchFn) {
  if (inflightMissFetches.has(key)) {
    return inflightMissFetches.get(key);
  }

  const promise = Promise.resolve()
    .then(fetchFn)
    .finally(() => {
      inflightMissFetches.delete(key);
    });

  inflightMissFetches.set(key, promise);
  return promise;
}

async function invalidateMenu(restaurantId) {
  await redis.del(menuKey(restaurantId));
}

async function flushAll() {
  await redis.flushall();
}

async function closeRedis() {
  if (redis.status === 'ready' || redis.status === 'connecting') {
    await redis.quit();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  redis,
  menuKey,
  menuMissKey,
  settingsKey,
  getDefaultMenuTtl,
  waitForRedis,
  getCachedMenu,
  setCachedMenu,
  getCachedNegative,
  setCachedNegative,
  getCachedSettings,
  setCachedSettings,
  coalesceMiss,
  invalidateMenu,
  flushAll,
  getCacheStats,
  resetCacheStats,
  recordCacheError,
  closeRedis,
};
