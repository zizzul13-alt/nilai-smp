import type { SupabaseClient } from '@supabase/supabase-js';

export type SchemaCompatibility =
  | { status: 'compatible'; currentVersion: string }
  | { status: 'incompatible'; currentVersion: string | null; expectedVersion: string; reason: string };

export async function checkSchemaCompatibility(client: SupabaseClient, expectedVersion: string): Promise<SchemaCompatibility> {
  const { data, error } = await client
    .from('app_schema_version')
    .select('version')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    return {
      status: 'incompatible',
      currentVersion: null,
      expectedVersion,
      reason: `Schema compatibility check failed: ${error.message}`,
    };
  }

  const currentVersion = typeof data?.version === 'string' ? data.version : null;
  if (currentVersion !== expectedVersion) {
    return {
      status: 'incompatible',
      currentVersion,
      expectedVersion,
      reason: 'Frontend and database schema versions do not match.',
    };
  }

  return { status: 'compatible', currentVersion };
}
