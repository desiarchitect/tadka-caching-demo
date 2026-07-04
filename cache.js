const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

let cacheHits = 0;
let cacheMisses = 0;
let cacheErrors = 0;

function menuKey(restaurantId) {
  return `tadka:restaurant:${restaurantId}:menu:v1`;
}

function getCacheStats() {
  return { hits: cacheHits, misses: cacheMisses, errors: cacheErrors };
}

function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
  cacheErrors = 0;
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

async function setCachedMenu(restaurantId, menu, ttlSeconds = 3600) {
  await redis.set(menuKey(restaurantId), JSON.stringify(menu), 'EX', ttlSeconds);
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
  waitForRedis,
  getCachedMenu,
  setCachedMenu,
  invalidateMenu,
  flushAll,
  getCacheStats,
  resetCacheStats,
  recordCacheError,
  closeRedis,
};
