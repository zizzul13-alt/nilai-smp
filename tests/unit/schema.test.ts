import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSchemaCompatibility } from '../../src/services/schema/schemaCompatibility';

function fakeClient(version: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: version ? { version } : null, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { client: { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient, maybeSingle };
}

describe('schema compatibility foundation', () => {
  it('accepts an exact version match', async () => {
    const { client } = fakeClient('r3.0-foundation.1');
    expect((await checkSchemaCompatibility(client, 'r3.0-foundation.1')).status).toBe('compatible');
  });

  it('fails closed on mismatch', async () => {
    const { client } = fakeClient('older');
    const result = await checkSchemaCompatibility(client, 'r3.0-foundation.1');
    expect(result.status).toBe('incompatible');
  });
});
