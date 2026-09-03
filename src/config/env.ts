export type BrowserConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type ConfigResult =
  | { ok: true; config: BrowserConfig }
  | { ok: false; errors: string[] };

const SERVICE_ROLE_PATTERN = /(service[_-]?role|secret)/i;

export function parseBrowserConfig(env: Record<string, string | undefined>): ConfigResult {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
  const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  const errors: string[] = [];

  if (!supabaseUrl) {
    errors.push('VITE_SUPABASE_URL is required.');
  } else {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== 'https:') errors.push('VITE_SUPABASE_URL must use HTTPS.');
    } catch {
      errors.push('VITE_SUPABASE_URL must be a valid URL.');
    }
  }

  if (!supabasePublishableKey) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is required.');
  } else if (SERVICE_ROLE_PATTERN.test(supabasePublishableKey)) {
    errors.push('Privileged/service-role credentials are forbidden in browser configuration.');
  }

  if (Object.keys(env).some((key) => key.startsWith('VITE_') && SERVICE_ROLE_PATTERN.test(key))) {
    errors.push('VITE_* privileged/secret variable names are forbidden.');
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, config: { supabaseUrl, supabasePublishableKey } };
}

export function readBrowserConfig(): ConfigResult {
  return parseBrowserConfig(import.meta.env as Record<string, string | undefined>);
}
