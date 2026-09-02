import { supabase, unwrap } from '@/lib/supabase';
import type { Activity, ActivityKind } from '@/lib/types';

export async function listActivities(limit = 50): Promise<Activity[]> {
  return unwrap(await supabase.from('activities').select('*').order('created_at', { ascending: false }).limit(limit));
}

export interface ActivityInput {
  kind: ActivityKind;
  title: string;
  body?: string | null;
  link?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  audience?: string[];
}

/** Registers an event in the shared feed (never throws; feed must not break the main action). */
export async function logActivity(input: ActivityInput) {
  try {
    await supabase.from('activities').insert({
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      actor_id: input.actor_id ?? null,
      actor_name: input.actor_name ?? null,
      audience: input.audience ?? [],
    });
  } catch {
    /* ignore */
  }
}

export async function getLastSeen(userId: string): Promise<string | null> {
  const row = unwrap(await supabase.from('activity_reads').select('last_seen_at').eq('user_id', userId).maybeSingle()) as { last_seen_at: string } | null;
  return row?.last_seen_at ?? null;
}

export async function markSeen(userId: string) {
  unwrap(await supabase.from('activity_reads').upsert({ user_id: userId, last_seen_at: new Date().toISOString() }));
}

/** Realtime subscription to new feed rows. Returns an unsubscribe function. */
export function subscribeActivities(onInsert: (a: Activity) => void) {
  const channel = supabase
    .channel('activities-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, (payload) => onInsert(payload.new as Activity))
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
