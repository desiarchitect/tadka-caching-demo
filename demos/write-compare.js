const {
  RESTAURANT_ID,
  waitForServer,
  resetDemo,
  writeThroughSettings,
  writeBehindSettings,
  getSettingsFromDb,
  printHeader,
  sleep,
} = require('./lib');

function printRow(label, value) {
  console.log(`  ${label.padEnd(22)}: ${value}`);
}

async function main() {
  printHeader('PATTERNS - WRITE COMPARE: Write-Through vs Write-Behind latency');

  const health = await waitForServer();
  if (!health.cacheEnabled) {
    throw new Error('Restart the API with: npm run api:cache-aside');
  }

  await resetDemo();

  const writeThrough = await writeThroughSettings(RESTAURANT_ID, 8);
  const writeBehind = await writeBehindSettings(RESTAURANT_ID, 12);

  await sleep(500);
  const dbAfterBehind = await getSettingsFromDb(RESTAURANT_ID);

  console.log('  Pattern comparison (delivery radius update):');
  console.log('');
  printRow('Write-Through latency', `${writeThrough.latencyMs} ms`);
  printRow('Write-Behind latency', `${writeBehind.latencyMs} ms`);
  printRow('Write-Through DB sync', 'immediate (same request)');
  printRow('Write-Behind DB sync', `${dbAfterBehind.settings.deliveryRadiusKm} km in DB after background flush`);
  printRow('Stale read risk', 'Write-Through: low | Write-Behind: medium until sync');
  printRow('Data loss risk', 'Write-Through: low | Write-Behind: higher without durable queue');
  console.log('');

  if (writeThrough.latencyMs <= writeBehind.latencyMs) {
    console.log('  NOTE: Write-Through may appear slower because it waits for PostgreSQL + Redis.');
  }

  console.log('  RESULT: same write, different trade-offs - consistency vs write latency.');
  console.log('');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});