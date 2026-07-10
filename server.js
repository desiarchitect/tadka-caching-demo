const express = require('express');
const {
  waitForDb,
  getMenuFromDb,
  getSettingsFromDb,
  updateSettingsInDb,
  updateItemPrice,
  getDbStats,
  resetDbStats,
} = require('./db');
const {
  waitForRedis,
  menuKey,
  getDefaultMenuTtl,
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
} = require('./cache');

const PORT = Number(process.env.PORT || 3000);
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';
const NEGATIVE_CACHE_ENABLED = process.env.NEGATIVE_CACHE_ENABLED === 'true';
const COALESCE_MISSES = process.env.COALESCE_MISSES === 'true';
const RESTAURANT_ID = 'biryani-house';

const app = express();
app.use(express.json());

const writeBehindQueue = new Map();

async function loadMenuFromDatabase(restaurantId) {
  if (COALESCE_MISSES) {
    return coalesceMiss(menuKey(restaurantId), () => getMenuFromDb(restaurantId));
  }
  return getMenuFromDb(restaurantId);
}

async function getMenu(restaurantId) {
  const startedAt = Date.now();

  if (CACHE_ENABLED) {
    try {
      if (NEGATIVE_CACHE_ENABLED && (await getCachedNegative(restaurantId))) {
        return {
          menu: null,
          source: 'negative-cache',
          latencyMs: Date.now() - startedAt,
        };
      }

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

  const menu = await loadMenuFromDatabase(restaurantId);
  if (!menu) {
    if (CACHE_ENABLED && NEGATIVE_CACHE_ENABLED) {
      try {
        await setCachedNegative(restaurantId);
      } catch (err) {
        recordCacheError();
        console.warn(`Negative cache write failed: ${err.message}`);
      }
    }

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

function parseDeliveryRadius(req, res) {
  const deliveryRadiusKm = Number(req.body.deliveryRadiusKm);
  if (!Number.isFinite(deliveryRadiusKm) || deliveryRadiusKm <= 0) {
    res.status(400).json({ error: 'deliveryRadiusKm must be a positive number' });
    return null;
  }
  return deliveryRadiusKm;
}

async function writeThroughSettings(restaurantId, deliveryRadiusKm) {
  const startedAt = Date.now();
  const updated = await updateSettingsInDb(restaurantId, deliveryRadiusKm);
  if (!updated) {
    return null;
  }

  if (CACHE_ENABLED) {
    try {
      await setCachedSettings(restaurantId, updated);
    } catch (err) {
      recordCacheError();
      throw new Error('Database updated but cache write failed');
    }
  }

  return {
    settings: updated,
    pattern: 'write-through',
    latencyMs: Date.now() - startedAt,
  };
}

async function writeBehindSettings(restaurantId, deliveryRadiusKm) {
  const startedAt = Date.now();
  const pending = {
    restaurantId,
    deliveryRadiusKm,
    updatedAt: Date.now(),
  };

  if (CACHE_ENABLED) {
    try {
      await setCachedSettings(restaurantId, {
        restaurantId,
        deliveryRadiusKm,
        pendingDbSync: true,
      });
    } catch (err) {
      recordCacheError();
      throw new Error('Cache write failed');
    }
  }

  const previous = writeBehindQueue.get(restaurantId);
  if (previous) {
    clearTimeout(previous.timer);
  }

  const timer = setTimeout(async () => {
    try {
      await updateSettingsInDb(restaurantId, deliveryRadiusKm);
      if (CACHE_ENABLED) {
        await setCachedSettings(restaurantId, {
          restaurantId,
          deliveryRadiusKm,
          pendingDbSync: false,
        });
      }
    } catch (err) {
      console.warn(`Write-behind sync failed for ${restaurantId}: ${err.message}`);
    } finally {
      writeBehindQueue.delete(restaurantId);
    }
  }, Number(process.env.WRITE_BEHIND_DELAY_MS || 300));

  writeBehindQueue.set(restaurantId, { timer, deliveryRadiusKm });

  return {
    settings: {
      restaurantId,
      deliveryRadiusKm,
      pendingDbSync: true,
    },
    pattern: 'write-behind',
    latencyMs: Date.now() - startedAt,
  };
}

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    cacheEnabled: CACHE_ENABLED,
    negativeCacheEnabled: NEGATIVE_CACHE_ENABLED,
    coalesceMisses: COALESCE_MISSES,
    menuTtlSeconds: getDefaultMenuTtl(),
  });
});

app.get('/api/stats', (_req, res) => {
  const cacheStats = getCacheStats();
  const dbStats = getDbStats();
  res.json({
    cacheEnabled: CACHE_ENABLED,
    negativeCacheEnabled: NEGATIVE_CACHE_ENABLED,
    coalesceMisses: COALESCE_MISSES,
    menuTtlSeconds: getDefaultMenuTtl(),
    ...dbStats,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    cacheErrors: cacheStats.errors,
    negativeCacheHits: cacheStats.negativeCacheHits,
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
    return res.status(404).json({
      error: 'Restaurant not found',
      source: result.source,
      latencyMs: result.latencyMs,
    });
  }

  res.json({
    restaurantId: req.params.id,
    source: result.source,
    latencyMs: result.latencyMs,
    menu: result.menu,
  });
});

app.get('/api/restaurants/:id/settings', async (req, res) => {
  const startedAt = Date.now();
  const restaurantId = req.params.id;

  if (CACHE_ENABLED) {
    try {
      const cached = await getCachedSettings(restaurantId);
      if (cached) {
        return res.json({
          restaurantId,
          source: 'cache',
          latencyMs: Date.now() - startedAt,
          settings: cached,
        });
      }
    } catch (err) {
      recordCacheError();
    }
  }

  const settings = await getSettingsFromDb(restaurantId);
  if (!settings) {
    return res.status(404).json({ error: 'Restaurant settings not found' });
  }

  if (CACHE_ENABLED) {
    try {
      await setCachedSettings(restaurantId, settings);
    } catch (err) {
      recordCacheError();
    }
  }

  res.json({
    restaurantId,
    source: 'database',
    latencyMs: Date.now() - startedAt,
    settings,
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

app.put('/api/labs/restaurants/:restaurantId/settings/write-through', async (req, res) => {
  const deliveryRadiusKm = parseDeliveryRadius(req, res);
  if (deliveryRadiusKm === null) return;

  try {
    const result = await writeThroughSettings(req.params.restaurantId, deliveryRadiusKm);
    if (!result) {
      return res.status(404).json({ error: 'Restaurant settings not found' });
    }
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.put('/api/labs/restaurants/:restaurantId/settings/write-behind', async (req, res) => {
  const deliveryRadiusKm = parseDeliveryRadius(req, res);
  if (deliveryRadiusKm === null) return;

  try {
    const result = await writeBehindSettings(req.params.restaurantId, deliveryRadiusKm);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.get('/api/labs/restaurants/:restaurantId/settings/db', async (req, res) => {
  const settings = await getSettingsFromDb(req.params.restaurantId);
  if (!settings) {
    return res.status(404).json({ error: 'Restaurant settings not found' });
  }
  res.json({ settings });
});

app.post('/api/admin/reset-demo', async (_req, res) => {
  const { seedData } = require('./db');
  for (const entry of writeBehindQueue.values()) {
    clearTimeout(entry.timer);
  }
  writeBehindQueue.clear();
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
    console.log(`  NEGATIVE_CACHE_ENABLED=${NEGATIVE_CACHE_ENABLED}`);
    console.log(`  COALESCE_MISSES=${COALESCE_MISSES}`);
    console.log(`  MENU_TTL_SECONDS=${getDefaultMenuTtl()}`);
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