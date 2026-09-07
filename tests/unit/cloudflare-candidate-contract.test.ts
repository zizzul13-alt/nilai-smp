import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const wrangler = readFileSync('wrangler.jsonc', 'utf8');
const runbook = readFileSync('docs/CLOUDFLARE_CANDIDATE_RUNBOOK.md', 'utf8');
const builder = readFileSync('scripts/build-production-candidate.mjs', 'utf8');
const smoke = readFileSync('scripts/smoke-cloudflare-candidate.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');

describe('P4/P6 Cloudflare candidate operator lane', () => {
  it('keeps Cloudflare as static SPA delivery only', () => {
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
    expect(wrangler).not.toContain('"kv_namespaces"');
    expect(wrangler).not.toContain('"d1_databases"');
    expect(wrangler).not.toContain('"durable_objects"');
  });

  it('deploy rebuilds through the fail-closed candidate builder', () => {
    expect(pkg.scripts['candidate:build']).toBe('node scripts/build-production-candidate.mjs');
    expect(pkg.scripts['candidate:wrangler-dry-run']).toBe('wrangler deploy --dry-run');
    expect(pkg.scripts['candidate:preflight']).toBe('npm run candidate:build && npm run candidate:wrangler-dry-run');
    expect(pkg.scripts.deploy).toBe('npm run candidate:build && wrangler deploy');
    expect(builder).toContain("new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])");
    expect(builder).toContain('unexpected browser env');
    expect(builder).toContain('CLOUDFLARE_API_TOKEN');
    expect(builder).toContain('P4_BUNDLE_PRECHECK PASS');
  });

  it('fails before build when browser config is missing or expanded', () => {
    const baseEnv = { ...process.env } as Record<string, string>;
    for (const key of Object.keys(baseEnv)) if (key.startsWith('VITE_')) delete baseEnv[key];

    const missing = spawnSync(process.execPath, ['scripts/build-production-candidate.mjs'], {
      env: baseEnv,
      encoding: 'utf8',
    });
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('P4_PRECHECK_FAIL missing VITE_SUPABASE_URL');

    const expanded = spawnSync(process.execPath, ['scripts/build-production-candidate.mjs'], {
      env: {
        ...baseEnv,
        VITE_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ci_placeholder_not_real',
        VITE_FORBIDDEN_EXTRA: 'nope',
      },
      encoding: 'utf8',
    });
    expect(expanded.status).toBe(2);
    expect(expanded.stderr).toContain('unexpected browser env: VITE_FORBIDDEN_EXTRA');
  });

  it('has a deployed root + deep-SPA smoke and explicit rollback guardrails', () => {
    expect(smoke).toContain("/__p4_deep_spa_probe__/reentry");
    expect(smoke).toContain("body.includes('/src/')");
    expect(smoke).toContain('P4_CLOUDFLARE_SMOKE PASS');
    expect(runbook).toContain('wrangler rollback <KNOWN_GOOD_VERSION_ID>');
    expect(runbook).toContain('Rollback changes frontend/static deployment only');
    expect(runbook).toContain('actual cutover remains forbidden');
  });

  it('runs a non-deploying Wrangler packaging proof in normal CI', () => {
    expect(workflow).toContain('Cloudflare candidate dry-run');
    expect(workflow).toContain('VITE_SUPABASE_URL: https://ci-placeholder.supabase.co');
    expect(workflow).toContain('npm run candidate:preflight');
    expect(workflow).toContain('Wrangler diagnostic log');
    expect(workflow).toContain("find \"$HOME/.config/.wrangler/logs\"");
  });
});
