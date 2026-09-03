export type BrowserConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export type ConfigResult =
  | { ok: true; config: BrowserConfig }
  | { ok: false; errors: string[] };

const PRIVILEGED_NAME_PATTERN = /(service[_-]?role|secret)/i;

function decodeLegacyJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as { role?: unknown };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function isPrivilegedSupabaseKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true;
  if (PRIVILEGED_NAME_PATTERN.test(key)) return true;
  return decodeLegacyJwtRole(key) === 'service_role';
}

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
  } else if (isPrivilegedSupabaseKey(supabasePublishableKey)) {
    errors.push('Privileged/service-role credentials are forbidden in browser configuration.');
  }

  if (Object.keys(env).some((key) => key.startsWith('VITE_') && PRIVILEGED_NAME_PATTERN.test(key))) {
    errors.push('VITE_* privileged/secret variable names are forbidden.');
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, config: { supabaseUrl, supabasePublishableKey } };
}

export function readBrowserConfig(): ConfigResult {
  return parseBrowserConfig(import.meta.env as Record<string, string | undefined>);
}
