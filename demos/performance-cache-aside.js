const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  parallelMenuReads,
  printHeader,
  printStats,
} = require('./lib');

const REQUEST_COUNT = 50;

async function main() {
  printHeader('PERFORMANCE - CACHE-ASIDE: Redis absorbs repeated reads');

  const health = await waitForServer();
  if (!health.cacheEnabled) {
    throw new Error('Restart the API with: npm run api:cache-aside');
  }

  await resetDemo();
  await resetStats();

  console.log('  Warm-up: one intentional miss fetches PostgreSQL and populates Redis.');
  const warmup = await fetchMenu();
  console.log(`    source=${warmup.source}, measured latency=${warmup.latencyMs}ms`);
  console.log('');

  console.log(`  Measured burst: ${REQUEST_COUNT} parallel reads against the warm cache.`);
  const run = await parallelMenuReads(REQUEST_COUNT);
  const stats = await getStats();
  printStats(stats, run);

  console.log('');
  console.log('  RESULT: 1 warm-up database fetch, then 50 measured cache hits.');
  console.log(`  Measured burst average: ${run.avgLatencyMs}ms per request.`);
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
