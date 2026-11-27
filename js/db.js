import { CONFIG } from '../config.js';

// One Supabase client per kind of visitor. Separate storage keys keep the teacher and student sessions apart.
// "?slot=2" gives an extra, independent student session in the same browser (handy for testing several students).
export function makeClient(kind) {
  const slot = new URLSearchParams(location.search).get('slot') || '';
  return window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: { storageKey: `bem-${kind}${slot}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    // data requests are never taken from the browser's cache: an old error answer (for example from before a database fix) must not be served again
    global: { fetch: (url, opts) => fetch(url, String(url).includes('/rest/v1/') ? { ...opts, cache: 'no-store' } : opts) },
    realtime: { params: { eventsPerSecond: 60 } },
  });
}

export const BUCKET = CONFIG.STORAGE_BUCKET;

export function friendlyError(e) {
  const m = (e && (e.message || e.error_description || e.details)) || String(e || 'Something went wrong');
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No internet connection. Check your Wi-Fi and try again.';
  return m;
}
