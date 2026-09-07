const rawOrigin = process.argv[2];
if (!rawOrigin) {
  console.error('Usage: npm run candidate:smoke -- https://<worker-host>');
  process.exit(2);
}

let origin;
try {
  origin = new URL(rawOrigin);
} catch {
  console.error('P4_SMOKE_FAIL invalid candidate URL');
  process.exit(2);
}
if (origin.protocol !== 'https:') {
  console.error('P4_SMOKE_FAIL candidate URL must be https');
  process.exit(2);
}
origin.pathname = '/';
origin.search = '';
origin.hash = '';

async function probe(path) {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Sec-Fetch-Mode': 'navigate',
    },
  });
  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  if (response.status !== 200) throw new Error(`${path} returned ${response.status}`);
  if (!contentType.includes('text/html')) throw new Error(`${path} is not HTML (${contentType || 'no content-type'})`);
  if (!body.includes('id="root"')) throw new Error(`${path} did not serve the Nilai SMP SPA shell`);
  if (body.includes('/src/') || body.includes('/@vite/client')) throw new Error(`${path} exposed Vite dev/source paths`);
  return { path, bytes: Buffer.byteLength(body) };
}

try {
  const root = await probe('/');
  const deep = await probe('/__p4_deep_spa_probe__/reentry');
  console.log(`P4_CLOUDFLARE_SMOKE PASS origin=${origin.origin} root_bytes=${root.bytes} deep_bytes=${deep.bytes}`);
} catch (error) {
  console.error(`P4_SMOKE_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
