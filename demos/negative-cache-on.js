const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenuRaw,
  parallelNotFoundReads,
  printHeader,
  assertHealthFlags,
} = require('./lib');

const REQUEST_COUNT = 20;
const FAKE_RESTAURANT_ID = 'fake-restaurant';

async function main() {
  printHeader('TRAPS - NEGATIVE CACHE (fix): not-found responses cached in Redis');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    negativeCacheEnabled: true,
  });

  await resetDemo();
  await resetStats();

  const warm = await fetchMenuRaw(FAKE_RESTAURANT_ID);
  console.log(`  1. Warm negative cache: status=${warm.status}, source=${warm.body.source}`);
  await resetStats();

  console.log(`  2. Sending ${REQUEST_COUNT} parallel reads for "${FAKE_RESTAURANT_ID}"...`);
  const run = await parallelNotFoundReads(REQUEST_COUNT, FAKE_RESTAURANT_ID);
  const stats = await getStats();

  console.log(`  Not found responses  : ${run.notFoundCount}`);
  console.log(`  Served from neg-cache: ${run.negativeCacheSources}`);
  console.log(`  DB menu fetches      : ${stats.databaseMenuFetches}`);
  console.log(`  Negative cache hits  : ${stats.negativeCacheHits}`);
  console.log('');

  if (
    stats.databaseMenuFetches !== 0 ||
    stats.negativeCacheHits !== REQUEST_COUNT
  ) {
    throw new Error('Unexpected state: negative caching did not absorb repeated misses.');
  }

  console.log('  RESULT: after one warm-up miss, repeated invalid IDs were served from Redis.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});