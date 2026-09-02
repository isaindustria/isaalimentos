import { supabase, unwrap } from '@/lib/supabase';
import type { AppSetting, Profile, Role } from '@/lib/types';

export interface Settings {
  stock_locations: number[];
  match_threshold: number;
  match_margin: number;
  company: { name: string; cnpj?: string; city?: string };
}

const DEFAULTS: Settings = {
  stock_locations: [1, 5],
  match_threshold: 0.8,
  match_margin: 0.1,
  company: { name: 'ISA Ind. de Alimentos e Temperos' },
};

export async function getSettings(): Promise<Settings> {
  const rows = unwrap(await supabase.from('app_settings').select('*')) as AppSetting[];
  const out: Settings = { ...DEFAULTS };
  for (const r of rows) {
    if (r.key in out) (out as unknown as Record<string, unknown>)[r.key] = r.value;
  }
  return out;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  unwrap(await supabase.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }));
}

export async function listProfiles(): Promise<Profile[]> {
  return unwrap(await supabase.from('profiles').select('*').order('created_at'));
}

export async function updateProfile(id: string, patch: { name?: string; role?: Role }) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', id));
}
