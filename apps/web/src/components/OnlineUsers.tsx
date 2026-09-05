import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRealtime, type PresenceUser } from '@/hooks/useRealtime';
import { ROLE_LABEL, type Role } from '@/lib/types';
import { cn, initials } from '@/lib/utils';

const PATH_LABEL: Array<[RegExp, string]> = [
  [/^\/pedidos\/novo/, 'criando um pedido'],
  [/^\/pedidos\/[^/]+\/editar/, 'editando um pedido'],
  [/^\/pedidos\/conferencia/, 'conferindo itens'],
  [/^\/pedidos\/importar/, 'importando pedidos'],
  [/^\/pedidos\/[^/]+/, 'vendo um pedido'],
  [/^\/pedidos/, 'em Pedidos'],
  [/^\/estoque/, 'em Estoque'],
  [/^\/producao\/[^/]+/, 'numa ordem de produção'],
  [/^\/producao/, 'em Produção'],
  [/^\/produtos/, 'em Produtos'],
  [/^\/clientes\/[^/]+/, 'vendo um cliente'],
  [/^\/clientes/, 'em Clientes'],
  [/^\/insumos/, 'em Insumos e compras'],
  [/^\/precos/, 'em Preços'],
  [/^\/rotas/, 'em Rotas de entrega'],
  [/^\/relatorios/, 'em Relatórios'],
  [/^\/auditoria/, 'em Auditoria'],
  [/^\/configuracoes/, 'em Configurações'],
  [/^\/$/, 'no Painel'],
];

export function whereIs(u: PresenceUser) {
  const hit = PATH_LABEL.find(([re]) => re.test(u.path));
  return hit ? hit[1] : 'no sistema';
}

const COLORS = ['bg-brand text-brand-ink', 'bg-brand-green text-white', 'bg-brand-yellow text-ink', 'bg-info text-white', 'bg-ink text-bg'];

/** Avatars of everyone online right now; click to open the full list with what each one is doing. */
export function OnlineUsers({ meId }: { meId?: string }) {
  const { online } = useRealtime();
  const others = online.filter((u) => u.id !== meId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!online.length) return null;

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="flex items-center gap-1 rounded-full py-1 pl-1 pr-2 transition hover:bg-surface-2" onClick={() => setOpen((v) => !v)}>
        <div className="flex -space-x-2">
          {online.slice(0, 5).map((u, i) => (
            <Tooltip key={u.id}>
              <TooltipTrigger asChild>
                <Avatar className={cn('size-8 ring-2 ring-surface', u.id === meId && 'order-last')}>
                  <AvatarFallback className={cn('text-[11px] font-bold', COLORS[i % COLORS.length])}>{initials(u.name)}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <b>{u.name}</b>{u.id === meId ? ' (você)' : ''} · {ROLE_LABEL[u.role as Role] ?? u.role}
                <div className="text-xs opacity-80">{u.editing ? 'editando agora' : whereIs(u)}</div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="ml-1 hidden items-center gap-1 text-xs text-muted sm:inline-flex">
          <Users className="size-3.5" /> {others.length ? `${others.length} online` : 'só você'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 max-w-[92vw] card shadow-pop overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {online.length} online agora
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {online.map((u, i) => (
              <li key={u.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className={cn('text-[11px] font-bold', COLORS[i % COLORS.length])}>{initials(u.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name}{u.id === meId ? ' (você)' : ''}</div>
                  <div className="truncate text-xs text-muted">{ROLE_LABEL[u.role as Role] ?? u.role} · {u.editing ? 'editando agora' : whereIs(u)}</div>
                </div>
                <span className="size-2 shrink-0 rounded-full bg-ok" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
