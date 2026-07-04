const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  updatePriceWithInvalidation,
  printHeader,
} = require('./lib');

async function main() {
  printHeader('INVALIDATION - EXPLICIT: write path deletes the cache key');

  const health = await waitForServer();
  if (!health.cacheEnabled) {
    throw new Error('Restart the API with: npm run api:cache-aside');
  }

  await resetDemo();
  await resetStats();

  await fetchMenu();
  console.log('  1. Cache warmed at Rs 300.');

  const write = await updatePriceWithInvalidation(350);
  console.log(`  2. Write path: DB price=Rs ${write.item.priceInr}, invalidated=${write.cacheInvalidated}`);

  const freshRead = await fetchMenu();
  console.log(`  3. First read: source=${freshRead.source}, API price=Rs ${freshRead.menu.items[0].priceInr}`);

  const cachedRead = await fetchMenu();
  const stats = await getStats();
  console.log(`  4. Second read: source=${cachedRead.source}, API price=Rs ${cachedRead.menu.items[0].priceInr}`);
  console.log(`     DB menu fetches=${stats.databaseMenuFetches}, hits=${stats.cacheHits}, misses=${stats.cacheMisses}`);
  console.log('');

  if (
    !write.cacheInvalidated ||
    freshRead.source !== 'database' ||
    cachedRead.source !== 'cache' ||
    cachedRead.menu.items[0].priceInr !== 350
  ) {
    throw new Error('Unexpected state: explicit invalidation did not produce fresh reads.');
  }

  console.log('  RESULT: DB update and cache deletion share the write handler.');
  console.log('  Note: PostgreSQL and Redis are still not one atomic transaction.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
