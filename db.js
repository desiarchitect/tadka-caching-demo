const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: Number(process.env.PG_PORT || 5433),
  user: process.env.PG_USER || 'tadka',
  password: process.env.PG_PASSWORD || 'tadka',
  database: process.env.PG_DATABASE || 'tadka',
  max: Number(process.env.PG_POOL_MAX || 10),
});

const DB_DELAY_MS = Number(process.env.DB_DELAY_MS || 200);

let databaseMenuFetches = 0;
let activeMenuFetches = 0;
let peakConcurrentMenuFetches = 0;

function getDbStats() {
  return {
    databaseMenuFetches,
    activeMenuFetches,
    peakConcurrentMenuFetches,
    poolMax: pool.options.max,
  };
}

function resetDbStats() {
  databaseMenuFetches = 0;
  activeMenuFetches = 0;
  peakConcurrentMenuFetches = 0;
}

async function waitForDb() {
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new Error(`Postgres not ready after ${maxAttempts} attempts: ${err.message}`);
      }
      await sleep(1000);
    }
  }
}

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
      name TEXT NOT NULL,
      price_inr INTEGER NOT NULL,
      PRIMARY KEY (restaurant_id, id)
    );

    CREATE TABLE IF NOT EXISTS restaurant_settings (
      restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id),
      delivery_radius_km INTEGER NOT NULL DEFAULT 5
    );
  `);
}

async function seedData() {
  await initSchema();
  await pool.query('DELETE FROM menu_items');
  await pool.query('DELETE FROM restaurant_settings');
  await pool.query('DELETE FROM restaurants');

  await pool.query(
    'INSERT INTO restaurants (id, name) VALUES ($1, $2)',
    ['biryani-house', 'Biryani House']
  );

  await pool.query(
    `INSERT INTO menu_items (id, restaurant_id, name, price_inr)
     VALUES ($1, $2, $3, $4)`,
    ['biryani', 'biryani-house', 'Hyderabadi Biryani', 300]
  );

  await pool.query(
    `INSERT INTO restaurant_settings (restaurant_id, delivery_radius_km)
     VALUES ($1, $2)`,
    ['biryani-house', 5]
  );
}

async function getMenuFromDb(restaurantId) {
  databaseMenuFetches += 1;
  const client = await pool.connect();
  activeMenuFetches += 1;
  peakConcurrentMenuFetches = Math.max(
    peakConcurrentMenuFetches,
    activeMenuFetches
  );

  try {
    // Hold a real pool connection so the demo shows queueing under DB pressure.
    await client.query('SELECT pg_sleep($1)', [DB_DELAY_MS / 1000]);

    const restaurantResult = await client.query(
      'SELECT id, name FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantResult.rowCount === 0) {
      return null;
    }

    const itemsResult = await client.query(
      `SELECT id, name, price_inr
       FROM menu_items
       WHERE restaurant_id = $1
       ORDER BY name`,
      [restaurantId]
    );

    return {
      restaurant: restaurantResult.rows[0],
      items: itemsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        priceInr: row.price_inr,
      })),
    };
  } finally {
    activeMenuFetches -= 1;
    client.release();
  }
}

async function getSettingsFromDb(restaurantId) {
  const result = await pool.query(
    'SELECT restaurant_id, delivery_radius_km FROM restaurant_settings WHERE restaurant_id = $1',
    [restaurantId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    restaurantId: row.restaurant_id,
    deliveryRadiusKm: row.delivery_radius_km,
  };
}

async function updateSettingsInDb(restaurantId, deliveryRadiusKm) {
  const result = await pool.query(
    `UPDATE restaurant_settings
     SET delivery_radius_km = $2
     WHERE restaurant_id = $1
     RETURNING restaurant_id, delivery_radius_km`,
    [restaurantId, deliveryRadiusKm]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    restaurantId: row.restaurant_id,
    deliveryRadiusKm: row.delivery_radius_km,
  };
}

async function updateItemPrice(restaurantId, itemId, priceInr) {
  const result = await pool.query(
    `UPDATE menu_items
     SET price_inr = $3
     WHERE restaurant_id = $1 AND id = $2
     RETURNING id, name, price_inr`,
    [restaurantId, itemId, priceInr]
  );

  return result.rows[0] || null;
}

async function closeDb() {
  await pool.end();
}

module.exports = {
  pool,
  waitForDb,
  initSchema,
  seedData,
  getMenuFromDb,
  getSettingsFromDb,
  updateSettingsInDb,
  updateItemPrice,
  getDbStats,
  resetDbStats,
  closeDb,
  DB_DELAY_MS,
};
