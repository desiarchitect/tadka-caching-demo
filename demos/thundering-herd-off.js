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
  printHeader('TRAPS - THUNDERING HERD (problem): coalescing disabled');

  const health = await waitForServer();
  assertHealthFlags(health, {
    cacheEnabled: true,
    coalesceMisses: false,
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

  if (stats.databaseMenuFetches < 2) {
    throw new Error(
      'Unexpected state: expected multiple DB fetches after expiry (thundering herd).'
    );
  }

  console.log('  RESULT: one expired key caused many parallel requests to hit PostgreSQL.');
  console.log('  Mitigation: request coalescing or a mutex lock on cache miss.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});