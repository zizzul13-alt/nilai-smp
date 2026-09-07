import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const allowedViteVars = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']);
for (const name of allowedViteVars) {
  if (!process.env[name]?.trim()) {
    console.error(`P4_PRECHECK_FAIL missing ${name}`);
    process.exit(2);
  }
}

const unexpectedViteVars = Object.keys(process.env)
  .filter(name => name.startsWith('VITE_') && !allowedViteVars.has(name));
if (unexpectedViteVars.length) {
  console.error(`P4_PRECHECK_FAIL unexpected browser env: ${unexpectedViteVars.sort().join(', ')}`);
  process.exit(2);
}

let supabaseUrl;
try {
  supabaseUrl = new URL(process.env.VITE_SUPABASE_URL);
} catch {
  console.error('P4_PRECHECK_FAIL VITE_SUPABASE_URL is not a valid URL');
  process.exit(2);
}
if (supabaseUrl.protocol !== 'https:' || !supabaseUrl.hostname.endsWith('.supabase.co')) {
  console.error('P4_PRECHECK_FAIL VITE_SUPABASE_URL must be an https://<project-ref>.supabase.co URL');
  process.exit(2);
}

function decodeLegacyJwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isPrivilegedSupabaseKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  if (/(service[_-]?role|secret)/i.test(key)) return true;
  return decodeLegacyJwtRole(key) === 'service_role';
}

const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
if (!(publishableKey.startsWith('sb_publishable_') || publishableKey.split('.').length === 3)) {
  console.error('P4_PRECHECK_FAIL publishable key is not a recognized browser-safe Supabase key');
  process.exit(2);
}
if (isPrivilegedSupabaseKey(publishableKey)) {
  console.error('P4_PRECHECK_FAIL privileged/service-role Supabase key is forbidden in browser config');
  process.exit(2);
}

const build = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) process.exit(build.status ?? 1);

if (!existsSync('dist/index.html')) {
  console.error('P4_PRECHECK_FAIL dist/index.html missing after build');
  process.exit(3);
}

function textFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...textFiles(path));
    else if (/\.(html|js|mjs|css|json|txt|map)$/i.test(entry)) out.push(path);
  }
  return out;
}

const forbiddenLiterals = [
  ['Vite source path', '/src/'],
  ['service role env', 'SUPABASE_SERVICE_ROLE'],
  ['database URL env', 'DATABASE_URL'],
  ['Cloudflare token env', 'CLOUDFLARE_API_TOKEN'],
];

const loopbackLiterals = [
  ['localhost http endpoint', 'http://localhost'],
  ['localhost https endpoint', 'https://localhost'],
  ['localhost websocket endpoint', 'ws://localhost'],
  ['localhost secure websocket endpoint', 'wss://localhost'],
  ['loopback http endpoint', 'http://127.0.0.1'],
  ['loopback https endpoint', 'https://127.0.0.1'],
  ['loopback websocket endpoint', 'ws://127.0.0.1'],
  ['loopback secure websocket endpoint', 'wss://127.0.0.1'],
];

function sanitizedContext(body, needle, index = body.indexOf(needle)) {
  const start = Math.max(0, index - 180);
  const end = Math.min(body.length, index + needle.length + 220);
  return body
    .slice(start, end)
    .replaceAll(process.env.VITE_SUPABASE_URL, '<SUPABASE_URL>')
    .replaceAll(publishableKey, '<PUBLISHABLE_KEY>')
    .replace(/[\r\n\t]+/g, ' ');
}

function approvedThirdPartyLoopback(body, needle, index) {
  if (needle !== 'http://localhost') return false;
  if (!body.startsWith('http://localhost:9999', index)) return false;

  const context = body.slice(
    Math.max(0, index - 320),
    Math.min(body.length, index + 520),
  );
  return context.includes('supabase.auth.token') && context.includes('gotrue-js/');
}

let sawSupabaseUrl = false;
let sawPublishableKey = false;
for (const file of textFiles('dist')) {
  const body = readFileSync(file, 'utf8');
  if (body.includes(process.env.VITE_SUPABASE_URL)) sawSupabaseUrl = true;
  if (body.includes(publishableKey)) sawPublishableKey = true;

  for (const [label, needle] of forbiddenLiterals) {
    if (body.includes(needle)) {
      console.error(`P4_PRECHECK_FAIL ${label} leaked into ${file}`);
      console.error(`P4_PRECHECK_CONTEXT ${sanitizedContext(body, needle)}`);
      process.exit(4);
    }
  }

  for (const [label, needle] of loopbackLiterals) {
    let from = 0;
    while (from < body.length) {
      const index = body.indexOf(needle, from);
      if (index === -1) break;
      if (!approvedThirdPartyLoopback(body, needle, index)) {
        console.error(`P4_PRECHECK_FAIL ${label} leaked into ${file}`);
        console.error(`P4_PRECHECK_CONTEXT ${sanitizedContext(body, needle, index)}`);
        process.exit(4);
      }
      from = index + needle.length;
    }
  }
}

if (!sawSupabaseUrl || !sawPublishableKey) {
  console.error('P4_PRECHECK_FAIL production Supabase browser config was not embedded in dist');
  process.exit(4);
}

console.log(`P4_BUNDLE_PRECHECK PASS project_ref=${supabaseUrl.hostname.split('.')[0]} dist=./dist browser_env=2`);
