const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  updatePriceDbOnly,
  printHeader,
} = require('./lib');

async function main() {
  printHeader('INVALIDATION - STALE CACHE: intentional DB-only write');

  const health = await waitForServer();
  if (!health.cacheEnabled) {
    throw new Error('Restart the API with: npm run api:cache-aside');
  }

  await resetDemo();
  await resetStats();

  const warmRead = await fetchMenu();
  console.log(`  1. Warm cache: source=${warmRead.source}, API price=Rs ${warmRead.menu.items[0].priceInr}`);

  const write = await updatePriceDbOnly(350);
  console.log(`  2. Demo-only DB write: DB price=Rs ${write.item.priceInr}, invalidated=${write.cacheInvalidated}`);

  const staleRead = await fetchMenu();
  const stats = await getStats();
  console.log(`  3. Customer read: source=${staleRead.source}, API price=Rs ${staleRead.menu.items[0].priceInr}`);
  console.log('     Database price=Rs 350');
  console.log(`     Cache hits=${stats.cacheHits}, cache misses=${stats.cacheMisses}`);
  console.log('');

  if (staleRead.source !== 'cache' || staleRead.menu.items[0].priceInr !== 300) {
    throw new Error('Unexpected state: the stale-cache scenario was not reproduced.');
  }

  console.log('  RESULT: the database is current, but the API serves stale cached data.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
