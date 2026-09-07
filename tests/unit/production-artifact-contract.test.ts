import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const pkg=readFileSync('package.json','utf8');
const sourcePlaywright=readFileSync('playwright.config.ts','utf8');
const productionPlaywright=readFileSync('playwright.production.config.mjs','utf8');
const wrangler=readFileSync('wrangler.jsonc','utf8');
const workflow=readFileSync('.github/workflows/verify.yml','utf8');

describe('R3.7-02 production artifact E2E',()=>{
  it('preserves source-instrumented E2E and adds a separate production lane',()=>{
    expect(pkg).toContain('"test:e2e":"playwright test"');
    expect(sourcePlaywright).toContain("command:'npm run dev -- --host 127.0.0.1 --port 4173'");
    expect(pkg).toContain('"test:e2e:production":"npm run build && playwright test --config playwright.production.config.mjs"');
  });
  it('serves built dist through preview only in the production lane',()=>{
    expect(productionPlaywright).toContain("testDir:'./tests/e2e-production'");
    expect(productionPlaywright).toContain("command:'npm run preview -- --host 127.0.0.1 --port 4174'");
    expect(productionPlaywright).not.toContain('npm run dev');
  });
  it('keeps Cloudflare on the same dist SPA artifact',()=>{
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
  });
  it('requires both browser lanes in CI after the production build gate',()=>{
    const build=workflow.indexOf('npm run build');
    const sourceE2e=workflow.indexOf('npm run test:e2e\n');
    const productionE2e=workflow.indexOf('npm run test:e2e:production');
    expect(build).toBeGreaterThan(-1);
    expect(sourceE2e).toBeGreaterThan(build);
    expect(productionE2e).toBeGreaterThan(sourceE2e);
  });
});
