import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BrowserConfig } from '../../config/env';

let singleton: SupabaseClient | null = null;

export function getSupabaseClient(config: BrowserConfig): SupabaseClient {
  if (!singleton) {
    singleton = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return singleton;
}
