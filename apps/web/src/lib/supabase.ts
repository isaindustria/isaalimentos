import { createClient } from '@supabase/supabase-js';

// Projeto Supabase da ISA. A chave "publishable" e publica por natureza (protegida por RLS),
// por isso pode ficar no codigo; variaveis VITE_* sobrescrevem quando definidas.
const DEFAULT_URL = 'https://exbhhwrutvzpwcjxqikp.supabase.co';
const DEFAULT_KEY = 'sb_publishable_vky72zhDlTjITsvk6eVQzg_qVhAXKHn';

function pick(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  if (!v || v.includes('SEU-PROJETO') || v.includes('xxx')) return fallback;
  return v;
}

const url = pick(import.meta.env.VITE_SUPABASE_URL as string | undefined, DEFAULT_URL);
const key = pick(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined, DEFAULT_KEY);

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Throws a readable error when a Supabase call fails. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
