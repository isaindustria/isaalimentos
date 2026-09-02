import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Boxes, ClipboardList, Factory, Users, Settings, MessageCircle, Send } from 'lucide-react';
import { getLastSeen, listActivities, logActivity, markSeen, subscribeActivities } from '@/api/activity';
import { useAuth } from '@/hooks/useAuth';
import { cn, fmtAgo } from '@/lib/utils';
import type { Activity, ActivityKind } from '@/lib/types';
import { Button, Input } from './ui';

const ICON: Record<ActivityKind, typeof Bell> = { estoque: Boxes, pedido: ClipboardList, producao: Factory, cliente: Users, sistema: Settings, mensagem: MessageCircle };
const TONE: Record<ActivityKind, string> = { estoque: 'bg-ok/15 text-ok', pedido: 'bg-info/15 text-info', producao: 'bg-brand-soft text-brand', cliente: 'bg-warn/15 text-warn', sistema: 'bg-surface-2 text-muted', mensagem: 'bg-brand-yellow/30 text-ink' };

/** Bell + panel with the shared team feed (realtime). */
export function NotificationsBell() {
  const { session, profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const userId = session?.user.id;

  const feed = useQuery({ queryKey: ['activities'], queryFn: () => listActivities(60), refetchInterval: 120_000 });
  const lastSeen = useQuery({ queryKey: ['activity-seen', userId], queryFn: () => getLastSeen(userId!), enabled: !!userId });

  useEffect(() => {
    const off = subscribeActivities((a) => {
      qc.setQueryData<Activity[]>(['activities'], (old) => [a, ...(old ?? [])].slice(0, 80));
      if (a.actor_id !== userId) toast(a.title, { description: a.body ?? undefined, duration: 6000 });
    });
    return off;
  }, [qc, userId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = useMemo(() => {
    const seen = lastSeen.data ? new Date(lastSeen.data).getTime() : 0;
    return (feed.data ?? []).filter((a) => new Date(a.created_at).getTime() > seen && a.actor_id !== userId).length;
  }, [feed.data, lastSeen.data, userId]);

  const seen = useMutation({ mutationFn: () => markSeen(userId!), onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-seen', userId] }) });
  const send = useMutation({
    mutationFn: () => logActivity({ kind: 'mensagem', title: `${profile?.name ?? 'Alguém'} escreveu`, body: text.trim(), actor_id: userId, actor_name: profile?.name ?? null }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
  });

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && userId) seen.mutate();
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative h-9 w-9 rounded-xl grid place-items-center text-muted hover:bg-surface-2" title="Atividades da equipe" aria-label="Atividades">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-brand-ink text-[10px] font-bold grid place-items-center">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[380px] max-w-[92vw] card shadow-pop overflow-hidden z-40 animate-fade-up">
          <header className="px-4 py-3 border-b border-line flex items-center justify-between">
            <div className="font-display font-bold text-sm">Atividades da equipe</div>
            <span className="text-[11px] text-muted">em tempo real</span>
          </header>
          <div className="max-h-[60vh] overflow-y-auto">
            {(feed.data ?? []).length === 0 && <p className="text-sm text-muted p-5 text-center">Nada por aqui ainda. Importações, pedidos e produção aparecem aqui para todos.</p>}
            {(feed.data ?? []).map((a) => {
              const Icon = ICON[a.kind] ?? Bell;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (a.link) {
                      navigate(a.link);
                      setOpen(false);
                    }
                  }}
                  className={cn('w-full text-left flex gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface-2/70', !a.link && 'cursor-default')}
                >
                  <span className={cn('h-8 w-8 rounded-lg grid place-items-center shrink-0', TONE[a.kind] ?? TONE.sistema)}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{a.title}</span>
                    {a.body && <span className="block text-xs text-muted mt-0.5 line-clamp-2">{a.body}</span>}
                    <span className="block text-[11px] text-muted mt-1">{a.actor_name ? `${a.actor_name} · ` : ''}{fmtAgo(a.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <form
            className="p-3 border-t border-line flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send.mutate();
            }}
          >
            <Input placeholder="Mandar um recado para a equipe" value={text} onChange={(e) => setText(e.target.value)} className="h-9" />
            <Button size="sm" type="submit" loading={send.isPending} disabled={!text.trim()} icon={<Send className="h-3.5 w-3.5" />} aria-label="Enviar" />
          </form>
        </div>
      )}
    </div>
  );
}

/** Compact feed for the dashboard. */
export function ActivityList({ limit = 8 }: { limit?: number }) {
  const feed = useQuery({ queryKey: ['activities'], queryFn: () => listActivities(60) });
  const navigate = useNavigate();
  const items = (feed.data ?? []).slice(0, limit);
  if (!items.length) return <p className="text-sm text-muted py-6 text-center">Nenhuma atividade registrada ainda.</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const Icon = ICON[a.kind] ?? Bell;
        return (
          <li key={a.id} className={cn('flex gap-3 py-2.5', a.link && 'cursor-pointer hover:bg-surface-2/60 -mx-2 px-2 rounded-lg')} onClick={() => a.link && navigate(a.link)}>
            <span className={cn('h-8 w-8 rounded-lg grid place-items-center shrink-0', TONE[a.kind] ?? TONE.sistema)}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight truncate">{a.title}</span>
              <span className="block text-[11px] text-muted">{a.actor_name ? `${a.actor_name} · ` : ''}{fmtAgo(a.created_at)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
