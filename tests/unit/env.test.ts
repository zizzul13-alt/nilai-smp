import { describe, expect, it } from 'vitest';
import { parseBrowserConfig } from '../../src/config/env';

describe('browser config contract', () => {
  it('accepts the public Supabase browser contract', () => {
    expect(parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    })).toEqual({
      ok: true,
      config: {
        supabaseUrl: 'https://example.supabase.co',
        supabasePublishableKey: 'sb_publishable_example',
      },
    });
  });

  it('rejects privileged-looking browser variables', () => {
    const result = parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_example',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'forbidden',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/forbidden|privileged|service-role/i);
  });
});
