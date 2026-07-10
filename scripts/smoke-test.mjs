import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const demos = [
  {
    api: 'api:no-cache',
    health: { cacheEnabled: false },
    scripts: ['demo:performance:no-cache'],
  },
  {
    api: 'api:cache-aside',
    health: { cacheEnabled: true },
    scripts: [
      'demo:performance:cache-aside',
      'demo:invalidation:stale-cache',
      'demo:invalidation:explicit',
      'demo:patterns:write-compare',
    ],
  },
  {
    api: 'api:labs:ttl',
    health: { cacheEnabled: true, menuTtlSeconds: 5 },
    scripts: ['demo:invalidation:ttl-stale', 'demo:invalidation:ttl-expired'],
  },
  {
    api: 'api:labs:negative-off',
    health: { cacheEnabled: true, negativeCacheEnabled: false },
    scripts: ['demo:traps:negative-cache:off'],
  },
  {
    api: 'api:labs:negative-on',
    health: { cacheEnabled: true, negativeCacheEnabled: true },
    scripts: ['demo:traps:negative-cache:on'],
  },
  {
    api: 'api:labs:herd-off',
    health: { cacheEnabled: true, coalesceMisses: false },
    scripts: ['demo:traps:thundering-herd:off'],
  },
  {
    api: 'api:labs:herd-on',
    health: { cacheEnabled: true, coalesceMisses: true },
    scripts: ['demo:traps:thundering-herd:on'],
  },
];

let nextPort = 3010;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function waitForHealth(baseUrl, expected = {}) {
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        await sleep(500);
        continue;
      }
      const health = await response.json();
      const matches = Object.entries(expected).every(([key, value]) => health[key] === value);
      if (matches) return health;
    } catch {}
    await sleep(500);
  }
  throw new Error(`API health check timed out for ${baseUrl} ${JSON.stringify(expected)}`);
}

async function withApi(apiScript, expectedHealth, fn) {
  const port = nextPort++;
  const baseUrl = `http://localhost:${port}`;

  const server = spawn('npm', ['run', apiScript], {
    stdio: 'ignore',
    shell: true,
    env: { ...process.env, PORT: String(port) },
  });

  try {
    await waitForHealth(baseUrl, expectedHealth);
    await fn(baseUrl);
  } finally {
    server.kill('SIGTERM');
    await sleep(300);
  }
}

await run('npm', ['run', 'demo:reset']);

for (const group of demos) {
  console.log(`\n=== API: ${group.api} ===`);
  await withApi(group.api, group.health, async (baseUrl) => {
    for (const script of group.scripts) {
      console.log(`\n--- ${script} ---`);
      await run('npm', ['run', script], {
        env: { ...process.env, API_URL: baseUrl },
      });
    }
  });
}

console.log('\nAll smoke tests passed.');