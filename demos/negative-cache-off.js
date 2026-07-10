const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  parallelNotFoundReads,
  printHeader,
  assertHealthFlags,
} = require('./lib');

const REQUEST_COUNT = 20;
const FAKE_RESTAURANT_ID = 'fake-restaurant';

async function main() {
  printHeader('TRAPS - NEGATIVE CACHE (problem): bad IDs hit the database every time');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    negativeCacheEnabled: false,
  });

  await resetDemo();
  await resetStats();

  console.log(`  Sending ${REQUEST_COUNT} parallel reads for "${FAKE_RESTAURANT_ID}"...`);
  const run = await parallelNotFoundReads(REQUEST_COUNT, FAKE_RESTAURANT_ID);
  const stats = await getStats();

  console.log(`  Not found responses : ${run.notFoundCount}`);
  console.log(`  DB menu fetches     : ${stats.databaseMenuFetches}`);
  console.log(`  Negative cache hits : ${stats.negativeCacheHits}`);
  console.log('');

  if (stats.databaseMenuFetches !== REQUEST_COUNT) {
    throw new Error(
      `Unexpected state: expected ${REQUEST_COUNT} DB fetches, got ${stats.databaseMenuFetches}.`
    );
  }

  console.log('  RESULT: repeated invalid IDs kept hammering PostgreSQL.');
  console.log('  Mitigation: cache short-lived "not found" responses (negative caching).');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});