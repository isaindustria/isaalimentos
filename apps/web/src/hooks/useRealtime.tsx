import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

/** Who is online and where (Supabase Presence). */
export interface PresenceUser {
  id: string;
  name: string;
  role: string;
  path: string;
  editing: string | null; // resource key, e.g. "order:uuid"
  since: string;
}

interface RealtimeValue {
  online: PresenceUser[];
  /** Users (other than me) currently editing a given resource. */
  editorsOf(resource: string): PresenceUser[];
  setEditing(resource: string | null): void;
}

const Ctx = createContext<RealtimeValue | null>(null);

/** Query keys refreshed when a table changes (so everyone sees everyone's work). */
const TABLE_KEYS: Record<string, string[][]> = {
  orders: [['orders'], ['order'], ['demand'], ['customer-orders'], ['customer-stats']],
  order_items: [['order'], ['pending-items'], ['demand'], ['orders']],
  order_imports: [['order-imports']],
  stock_movements: [['current-stock'], ['movements']],
  stock_imports: [['stock-imports'], ['current-stock']],
  stock_balances: [['current-stock']],
  production_runs: [['runs'], ['run']],
  production_run_items: [['run'], ['runs']],
  customers: [['customers'], ['customer']],
  customer_interactions: [['interactions']],
  products: [['products'], ['current-stock']],
  product_aliases: [['aliases']],
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const editingRef = useRef<string | null>(null);
  const userId = session?.user.id;

  // Presence channel
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel('presence:isa', { config: { presence: { key: userId } } });
    channelRef.current = ch;
    const track = () =>
      ch.track({
        id: userId,
        name: profile?.name ?? session?.user.email ?? 'Usuário',
        role: profile?.role ?? 'operador',
        path: location.pathname,
        editing: editingRef.current,
        since: new Date().toISOString(),
      } satisfies PresenceUser);
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceUser>();
      const users = Object.values(state)
        .map((arr) => arr[arr.length - 1])
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
      setOnline(users);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await track();
    });
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile?.name, profile?.role]);

  // Re-track on navigation
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !userId) return;
    ch.track({
      id: userId,
      name: profile?.name ?? session?.user.email ?? 'Usuário',
      role: profile?.role ?? 'operador',
      path: location.pathname,
      editing: editingRef.current,
      since: new Date().toISOString(),
    } satisfies PresenceUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Postgres changes -> invalidate queries (debounced per table)
  useEffect(() => {
    if (!userId) return;
    const timers = new Map<string, number>();
    const ch = supabase.channel('db:isa').on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      const table = payload.table;
      const keys = TABLE_KEYS[table];
      if (!keys) return;
      window.clearTimeout(timers.get(table));
      timers.set(
        table,
        window.setTimeout(() => keys.forEach((k) => qc.invalidateQueries({ queryKey: k })), 400),
      );
    });
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [userId, qc]);

  const value = useMemo<RealtimeValue>(
    () => ({
      online,
      editorsOf: (resource) => online.filter((u) => u.editing === resource && u.id !== userId),
      setEditing: (resource) => {
        editingRef.current = resource;
        const ch = channelRef.current;
        if (ch && userId) {
          ch.track({
            id: userId,
            name: profile?.name ?? session?.user.email ?? 'Usuário',
            role: profile?.role ?? 'operador',
            path: location.pathname,
            editing: resource,
            since: new Date().toISOString(),
          } satisfies PresenceUser);
        }
      },
    }),
    [online, userId, profile?.name, profile?.role, session?.user.email, location.pathname],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider');
  return ctx;
}

/** Marks a resource as "being edited by me" while the component is mounted. Returns other editors. */
export function useEditLock(resource: string | null) {
  const rt = useRealtime();
  useEffect(() => {
    if (!resource) return;
    rt.setEditing(resource);
    return () => rt.setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource]);
  return resource ? rt.editorsOf(resource) : [];
}
