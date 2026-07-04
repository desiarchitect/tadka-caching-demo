const {
  waitForServer,
  resetDemo,
  resetStats,
  getStats,
  parallelMenuReads,
  printHeader,
  printStats,
} = require('./lib');

const REQUEST_COUNT = 50;

async function main() {
  printHeader('PERFORMANCE - NO CACHE: every read reaches PostgreSQL');

  const health = await waitForServer();
  if (health.cacheEnabled) {
    throw new Error('Restart the API with: npm run api:no-cache');
  }

  await resetDemo();
  await resetStats();

  console.log(`  Sending ${REQUEST_COUNT} parallel menu reads...`);
  console.log('  Each fetch holds a DB pool connection for about 200ms.');
  console.log('');

  const run = await parallelMenuReads(REQUEST_COUNT);
  const stats = await getStats();
  printStats(stats, run);

  console.log('');
  console.log('  RESULT: 50 requests caused 50 database menu fetches.');
  console.log('  The pool capped concurrency; the remaining requests waited in waves.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
