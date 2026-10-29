import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Truck, Undo2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input } from '@/components/primitives';
import type { AcabadoItem } from '@/domain/pcp';
import { faturarPedido, voltarProducao, type ItemPcp } from '@/api/pcp';
import { fmtDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { qtd } from './comum';

const ONDE: Record<string, { l: string; tone: 'brand' | 'info' | 'warn' | 'ok' }> = {
  pedido: { l: 'Aberto (Pedido)', tone: 'brand' }, producao: { l: 'Firmado (Produção)', tone: 'info' }, em_producao: { l: 'Em produção', tone: 'warn' }, faturado: { l: 'Faturamento', tone: 'ok' },
};
const onde = (i: ItemPcp) => (i.stage === 'faturado' ? 'faturado' : i.stage === 'em_producao' ? 'em_producao' : i.pcpStatus === 'firmado' ? 'producao' : 'pedido');

/**
 * Aba Relatório (Produção 4): os pedidos que têm item Em produção ou no Faturamento, com o pedido inteiro.
 * Voltar devolve à Produção para refazer o cálculo. Faturamento só com o pedido completo (sem faturamento parcial).
 */
export function AbaRelatorio({ itens, aloc, completo, todosDoPedido, pode }: {
  itens: ItemPcp[]; aloc: Map<string, AcabadoItem>; completo: (orderId: string) => boolean; todosDoPedido: (orderId: string) => ItemPcp[]; pode: boolean;
}) {
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const [busca, setBusca] = useState('');
  const refresh = () => ['pcp', 'planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const fail = (e: Error) => toast.error(e.message);
  const voltar = useMutation({ mutationFn: voltarProducao, onSuccess: () => { toast.success('Voltou para a Produção: o cálculo é refeito com os pedidos firmados.'); refresh(); }, onError: fail });
  const faturar = useMutation({ mutationFn: (orderId: string) => faturarPedido(todosDoPedido(orderId), completo(orderId), { id: session?.user.id, nome: profile?.name ?? null }), onSuccess: () => { toast.success('Pedido completo enviado para o Faturamento (Rotas de entrega).'); refresh(); }, onError: fail });

  const pedidos = useMemo(() => {
    const ids = [...new Set(itens.filter((i) => i.stage === 'em_producao' || i.stage === 'faturado').map((i) => i.orderId))];
    const b = busca.trim().toLowerCase();
    return ids.map((id) => todosDoPedido(id)).filter((l) => l.length && (!b || String(l[0].orderNumber ?? '') === b || (l[0].customer ?? '').toLowerCase().includes(b) || l.some((i) => i.productCode === b)))
      .sort((a, b2) => (a[0].deliveryDate ?? '9999').localeCompare(b2[0].deliveryDate ?? '9999'));
  }, [itens, busca, todosDoPedido]);

  return (
    <div className="space-y-3">
      <Input className="h-9 max-w-xs" placeholder="Pedido, produto ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {pedidos.length ? pedidos.map((lista) => {
        const o = lista[0];
        const faturado = lista.every((i) => i.stage === 'faturado');
        const ok = completo(o.orderId);
        const prontos = lista.filter((i) => i.stage === 'faturado' || i.revenda || aloc.get(i.itemId)?.atendido).length;
        const emProd = lista.filter((i) => i.stage === 'em_producao').map((i) => i.itemId);
        return (
          <Card key={o.orderId} padded={false}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <b className="num">Pedido {o.orderNumber ?? '—'}</b><span className="text-sm">{o.customer ?? ''}</span><span className="text-xs text-muted">entrega {fmtDate(o.deliveryDate)}</span>
              {faturado ? <Badge tone="ok" dot>Faturamento</Badge> : <Badge tone={ok ? 'ok' : 'warn'}>{prontos}/{lista.length} produto(s) completo(s)</Badge>}
              {pode && !faturado && <div className="ml-auto flex gap-2">
                {emProd.length > 0 && <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => confirm('Voltar os itens Em produção deste pedido para a Produção? Serve para refazer o cálculo; nada é cancelado e o estoque não muda.') && voltar.mutate(emProd)}>Voltar</Button>}
                <Button size="sm" disabled={!ok} title={ok ? 'Enviar o pedido inteiro para Rotas de entrega' : 'Só o pedido completo vai para o Faturamento'} icon={<Truck className="size-3.5" />} loading={faturar.isPending && faturar.variables === o.orderId}
                  onClick={() => confirm(`Enviar o pedido ${o.orderNumber ?? ''} inteiro para o Faturamento?`) && faturar.mutate(o.orderId)}>Faturamento</Button>
              </div>}
            </div>
            <ul className="divide-y divide-line text-sm">
              {lista.map((i) => {
                const a = aloc.get(i.itemId); const w = ONDE[onde(i)];
                const pronto = i.stage === 'faturado' || i.revenda || a?.atendido;
                return (
                  <li key={i.itemId} className="flex flex-wrap items-center gap-2 px-4 py-1.5">
                    <span className="num w-12 text-xs">{i.productCode}</span>
                    <span className="min-w-0 flex-1 text-xs">{i.productName ?? ''}</span>
                    <span className="num text-xs text-muted">{a ? `${qtd(a.pedidoUn)} un · estoque ${qtd(a.estoqueUn)}` : i.revenda ? 'revenda' : ''}</span>
                    <Badge tone={pronto ? 'ok' : 'danger'}>{pronto ? 'completo' : `falta ${qtd(a?.faltaUn ?? 0)} un`}</Badge>
                    <Badge tone={w.tone} dot>{w.l}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      }) : <Card><EmptyState title="Nada no Relatório" description="Os itens chegam aqui pelo Em produção (aba Produção) ou pelo Faturamento." /></Card>}
      <p className="text-xs text-muted">Um pedido só sai para o Faturamento quando todos os produtos e quantidades estão completos (estoque acabado atende). Não há faturamento parcial.</p>
    </div>
  );
}
