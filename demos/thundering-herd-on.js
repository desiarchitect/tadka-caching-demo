const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  fetchMenu,
  parallelMenuReads,
  printHeader,
  printStats,
  assertHealthFlags,
  sleep,
} = require('./lib');

const REQUEST_COUNT = 50;
const TTL_WAIT_MS = 2500;

async function main() {
  printHeader('TRAPS - THUNDERING HERD (fix): request coalescing enabled');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    coalesceMisses: true,
  });

  await resetDemo();
  await fetchMenu();
  console.log('  1. Cache warmed with a short TTL.');
  console.log(`  2. Waiting ${TTL_WAIT_MS} ms for the cache entry to expire...`);
  await sleep(TTL_WAIT_MS);
  await resetStats();

  console.log(`  3. Sending ${REQUEST_COUNT} parallel reads after expiry...`);
  const run = await parallelMenuReads(REQUEST_COUNT);
  const stats = await getStats();
  printStats(stats, run);
  console.log('');

  if (stats.databaseMenuFetches !== 1) {
    throw new Error(
      `Unexpected state: expected exactly 1 DB fetch with coalescing, got ${stats.databaseMenuFetches}.`
    );
  }

  console.log('  RESULT: only one request reached PostgreSQL; the rest waited on the in-flight fetch.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});