const express = require('express');
const {
  waitForDb,
  getMenuFromDb,
  updateItemPrice,
  getDbStats,
  resetDbStats,
} = require('./db');
const {
  waitForRedis,
  getCachedMenu,
  setCachedMenu,
  invalidateMenu,
  flushAll,
  getCacheStats,
  resetCacheStats,
  recordCacheError,
} = require('./cache');

const PORT = Number(process.env.PORT || 3000);
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const RESTAURANT_ID = 'biryani-house';

const app = express();
app.use(express.json());

async function getMenu(restaurantId) {
  const startedAt = Date.now();

  if (CACHE_ENABLED) {
    try {
      const cached = await getCachedMenu(restaurantId);
      if (cached) {
        return {
          menu: cached,
          source: 'cache',
          latencyMs: Date.now() - startedAt,
        };
      }
    } catch (err) {
      recordCacheError();
      console.warn(`Cache read failed (falling back to DB): ${err.message}`);
    }
  }

  const menu = await getMenuFromDb(restaurantId);
  if (!menu) {
    return {
      menu: null,
      source: 'database',
      latencyMs: Date.now() - startedAt,
    };
  }

  if (CACHE_ENABLED) {
    try {
      await setCachedMenu(restaurantId, menu);
    } catch (err) {
      recordCacheError();
      console.warn(`Cache write failed (serving from DB): ${err.message}`);
    }
  }

  return {
    menu,
    source: 'database',
    latencyMs: Date.now() - startedAt,
  };
}

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    cacheEnabled: CACHE_ENABLED,
  });
});

app.get('/api/stats', (_req, res) => {
  const cacheStats = getCacheStats();
  const dbStats = getDbStats();
  res.json({
    cacheEnabled: CACHE_ENABLED,
    ...dbStats,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    cacheErrors: cacheStats.errors,
    hitRatio:
      cacheStats.hits + cacheStats.misses === 0
        ? 0
        : Number(
            (
              cacheStats.hits /
              (cacheStats.hits + cacheStats.misses)
            ).toFixed(2)
          ),
  });
});

app.post('/api/stats/reset', (_req, res) => {
  resetDbStats();
  resetCacheStats();
  res.json({ ok: true });
});

app.get('/api/restaurants/:id/menu', async (req, res) => {
  const result = await getMenu(req.params.id);
  if (!result.menu) {
    return res.status(404).json({ error: 'Restaurant not found' });
  }

  res.json({
    restaurantId: req.params.id,
    source: result.source,
    latencyMs: result.latencyMs,
    menu: result.menu,
  });
});

function parsePrice(req, res) {
  const priceInr = Number(req.body.priceInr);
  if (!Number.isFinite(priceInr) || priceInr <= 0) {
    res.status(400).json({ error: 'priceInr must be a positive number' });
    return null;
  }
  return priceInr;
}

app.put('/api/demo/restaurants/:restaurantId/items/:itemId/price-db-only', async (req, res) => {
  const priceInr = parsePrice(req, res);
  if (priceInr === null) return;

  const updated = await updateItemPrice(
    req.params.restaurantId,
    req.params.itemId,
    priceInr
  );

  if (!updated) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  res.json({
    ok: true,
    item: {
      id: updated.id,
      name: updated.name,
      priceInr: updated.price_inr,
    },
    cacheInvalidated: false,
    warning: 'Demo-only route: intentionally leaves the cache stale',
  });
});

app.put('/api/admin/restaurants/:restaurantId/items/:itemId/price', async (req, res) => {
  const priceInr = parsePrice(req, res);
  if (priceInr === null) return;

  const updated = await updateItemPrice(
    req.params.restaurantId,
    req.params.itemId,
    priceInr
  );

  if (!updated) {
    return res.status(404).json({ error: 'Menu item not found' });
  }

  try {
    await invalidateMenu(req.params.restaurantId);
  } catch (err) {
    recordCacheError();
    return res.status(503).json({
      error: 'Database updated but cache invalidation failed',
      databaseUpdated: true,
      cacheInvalidated: false,
    });
  }

  res.json({
    ok: true,
    item: {
      id: updated.id,
      name: updated.name,
      priceInr: updated.price_inr,
    },
    cacheInvalidated: true,
  });
});

app.post('/api/admin/reset-demo', async (_req, res) => {
  const { seedData } = require('./db');
  await flushAll();
  await seedData();
  resetDbStats();
  resetCacheStats();
  res.json({ ok: true, restaurantId: RESTAURANT_ID, biryaniPriceInr: 300 });
});

async function start() {
  await waitForDb();
  await waitForRedis();

  app.listen(PORT, () => {
    console.log('');
    console.log('  Tadka Caching Demo API');
    console.log(`  http://localhost:${PORT}`);
    console.log(`  CACHE_ENABLED=${CACHE_ENABLED}`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`    GET  /api/restaurants/${RESTAURANT_ID}/menu`);
    console.log('    GET  /api/stats');
    console.log('    POST /api/admin/reset-demo');
    console.log('');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
