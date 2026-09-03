import { describe, expect, it } from 'vitest';
import { parseBrowserConfig } from '../../src/config/env';

function legacyJwt(role: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature`;
}

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

  it('allows a legacy anon JWT while migration to publishable keys remains possible', () => {
    expect(parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: legacyJwt('anon'),
    }).ok).toBe(true);
  });

  it('rejects current secret keys, legacy service-role JWTs, and privileged browser variable names', () => {
    const currentSecret = parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden',
    });
    const legacyServiceRole = parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: legacyJwt('service_role'),
    });
    const privilegedName = parseBrowserConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'forbidden',
    });

    expect(currentSecret.ok).toBe(false);
    expect(legacyServiceRole.ok).toBe(false);
    expect(privilegedName.ok).toBe(false);
  });
});
