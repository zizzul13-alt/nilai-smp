import{describe,expect,it}from'vitest';
import{readFileSync}from'node:fs';

const pkg=JSON.parse(readFileSync('package.json','utf8')) as{scripts:Record<string,string>};
const playwright=readFileSync('playwright.config.ts','utf8');
const wrangler=readFileSync('wrangler.jsonc','utf8');
const workflow=readFileSync('.github/workflows/verify.yml','utf8');

describe('R3.7-02 production artifact E2E',()=>{
  it('builds before every standard E2E invocation',()=>{
    expect(pkg.scripts['test:e2e']).toContain('npm run build');
    expect(pkg.scripts['test:e2e']).toContain('playwright test');
  });
  it('serves dist through preview instead of the Vite dev server',()=>{
    expect(playwright).toContain("command:'npm run preview -- --host 127.0.0.1 --port 4173'");
    expect(playwright).not.toContain("command:'npm run dev");
  });
  it('keeps Cloudflare on the same dist SPA artifact',()=>{
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
  });
  it('retains the full CI proof chain before browser acceptance',()=>{
    expect(workflow.indexOf('npm run build')).toBeGreaterThan(-1);
    expect(workflow.indexOf('npm run test:e2e')).toBeGreaterThan(workflow.indexOf('npm run build'));
  });
});
