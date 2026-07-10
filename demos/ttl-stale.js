const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  updatePriceDbOnly,
  printHeader,
  assertHealthFlags,
} = require('./lib');

async function main() {
  printHeader('INVALIDATION - TTL (problem): stale data while the entry is still alive');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    menuTtlSeconds: 5,
  });

  await resetDemo();
  await resetStats();

  const warmRead = await fetchMenu();
  console.log(`  1. Warm cache: source=${warmRead.source}, API price=Rs ${warmRead.menu.items[0].priceInr}`);

  const write = await updatePriceDbOnly(350);
  console.log(`  2. DB-only write: DB price=Rs ${write.item.priceInr}, invalidated=${write.cacheInvalidated}`);

  const staleRead = await fetchMenu();
  const stats = await getStats();
  console.log(`  3. Immediate read: source=${staleRead.source}, API price=Rs ${staleRead.menu.items[0].priceInr}`);
  console.log(`     TTL still active (${health.menuTtlSeconds}s) - no manual DEL was sent.`);
  console.log(`     Cache hits=${stats.cacheHits}, misses=${stats.cacheMisses}`);
  console.log('');

  if (staleRead.source !== 'cache' || staleRead.menu.items[0].priceInr !== 300) {
    throw new Error('Unexpected state: TTL stale window was not reproduced.');
  }

  console.log('  RESULT: TTL accepts a short stale window instead of explicit invalidation.');
  console.log('  Next step: run demo:invalidation:ttl-expired after the TTL elapses.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});