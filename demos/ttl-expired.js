const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  updatePriceDbOnly,
  printHeader,
  assertHealthFlags,
  sleep,
} = require('./lib');

async function main() {
  printHeader('INVALIDATION - TTL (fix): cache refreshes automatically after expiry');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    menuTtlSeconds: 5,
  });

  await resetDemo();
  await resetStats();

  await fetchMenu();
  await updatePriceDbOnly(350);
  console.log('  1. Cache warmed, then DB updated to Rs 350 without invalidation.');
  console.log(`  2. Waiting ${health.menuTtlSeconds + 1}s for TTL expiry...`);
  await sleep((health.menuTtlSeconds + 1) * 1000);
  await resetStats();

  const freshRead = await fetchMenu();
  const stats = await getStats();
  console.log(`  3. Post-expiry read: source=${freshRead.source}, API price=Rs ${freshRead.menu.items[0].priceInr}`);
  console.log(`     DB menu fetches=${stats.databaseMenuFetches}, misses=${stats.cacheMisses}`);
  console.log('');

  if (freshRead.source !== 'database' || freshRead.menu.items[0].priceInr !== 350) {
    throw new Error('Unexpected state: TTL expiry did not refresh the cached menu.');
  }

  console.log('  RESULT: after TTL expired, the next read fetched fresh data from PostgreSQL.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});