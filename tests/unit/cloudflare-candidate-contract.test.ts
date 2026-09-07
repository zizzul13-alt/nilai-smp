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
    expect(builder).toContain('isPrivilegedSupabaseKey');
    expect(builder).toContain('privileged/service-role Supabase key is forbidden');
    expect(builder).toContain('CLOUDFLARE_API_TOKEN');
    expect(builder).toContain('P4_BUNDLE_PRECHECK PASS');
  });

  it('strips source maps from the deployable candidate before bundle scanning', () => {
    expect(builder).toContain('rmSync');
    expect(builder).toContain('stripSourceMaps');
    expect(builder).toContain("else if (/\\.map$/i.test(entry))");
    expect(builder).toContain("const removedSourceMaps = stripSourceMaps('dist')");
    expect(builder).toContain('P4_SOURCEMAPS_STRIPPED');
    expect(builder).not.toContain("|map)$/i.test(entry)");
  });

  it('keeps loopback rejection strict while bounding the known Supabase Auth library default', () => {
    expect(builder).toContain("['localhost http endpoint', 'http://localhost']");
    expect(builder).toContain("['loopback http endpoint', 'http://127.0.0.1']");
    expect(builder).toContain('approvedThirdPartyLoopback');
    expect(builder).toContain("body.startsWith('http://localhost:9999', index)");
    expect(builder).toContain("context.includes('supabase.auth.token')");
    expect(builder).toContain("context.includes('gotrue-js/')");
    expect(builder).toContain('if (!approvedThirdPartyLoopback(body, needle, index))');
  });

  it('fails before build when browser config is missing, expanded, or privileged', () => {
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

    const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    const legacyServiceRoleKey = `eyJhbGciOiJub25lIn0.${serviceRolePayload}.signature`;
    const privileged = spawnSync(process.execPath, ['scripts/build-production-candidate.mjs'], {
      env: {
        ...baseEnv,
        VITE_SUPABASE_URL: 'https://ci-placeholder.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: legacyServiceRoleKey,
      },
      encoding: 'utf8',
    });
    expect(privileged.status).toBe(2);
    expect(privileged.stderr).toContain('privileged/service-role Supabase key is forbidden');
  });

  it('has a deployed root + deep-SPA smoke and explicit rollback guardrails', () => {
    expect(smoke).toContain("/__p4_deep_spa_probe__/reentry");
    expect(smoke).toContain("body.includes('/src/')");
    expect(smoke).toContain('P4_CLOUDFLARE_SMOKE PASS');
    expect(runbook).toContain('wrangler rollback <KNOWN_GOOD_VERSION_ID>');
    expect(runbook).toContain('Rollback changes frontend/static deployment only');
    expect(runbook).toContain('actual cutover remains forbidden');
  });

  it('runs a non-deploying Wrangler packaging proof in normal CI and captures failure evidence', () => {
    expect(workflow).toContain('Cloudflare candidate dry-run');
    expect(workflow).toContain('VITE_SUPABASE_URL: https://ci-placeholder.supabase.co');
    expect(workflow).toContain('npm run candidate:preflight');
    expect(workflow).toContain('Wrangler diagnostic log');
    expect(workflow).toContain("find \"$HOME/.config/.wrangler/logs\"");
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toContain('name: cloudflare-candidate-diagnostic');
    expect(workflow).toContain('path: candidate-preflight.log');
    expect(workflow).toContain('if: failure()');
  });
});
