const { waitForDb, seedData, closeDb } = require('./db');
const { waitForRedis, flushAll, closeRedis } = require('./cache');

async function main() {
  console.log('  Seeding Tadka demo data...');
  await waitForDb();
  await waitForRedis();
  await flushAll();
  await seedData();
  console.log('  Done. Restaurant: biryani-house, Biryani price: Rs 300');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
    await closeRedis();
  });