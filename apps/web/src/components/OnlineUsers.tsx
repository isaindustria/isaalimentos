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
  [/^\/configuracoes/, 'em Configurações'],
  [/^\/$/, 'no Painel'],
];

export function whereIs(u: PresenceUser) {
  const hit = PATH_LABEL.find(([re]) => re.test(u.path));
  return hit ? hit[1] : 'no sistema';
}

const COLORS = ['bg-brand text-brand-ink', 'bg-brand-green text-white', 'bg-brand-yellow text-ink', 'bg-info text-white', 'bg-ink text-bg'];

/** Avatars of everyone online right now, with what each one is doing. */
export function OnlineUsers({ meId }: { meId?: string }) {
  const { online } = useRealtime();
  const others = online.filter((u) => u.id !== meId);
  if (!online.length) return null;
  return (
    <div className="flex items-center gap-1">
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
    </div>
  );
}
