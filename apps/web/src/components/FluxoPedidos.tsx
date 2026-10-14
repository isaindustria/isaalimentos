import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Factory, Truck, Undo2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/primitives';
import { mudarEtapa, type PedidoNoFluxo } from '@/api/planejamento';
import type { Etapa } from '@/domain/planejamento';
import { STATUS_COLOR } from '@/pages/OrdersPage';
import { fmtDate } from '@/lib/utils';

const ETAPA: Record<Etapa, { label: string; cls: string }> = {
  aberto: { label: 'Aberto', cls: STATUS_COLOR.aberto },
  em_producao: { label: 'Em produção', cls: STATUS_COLOR.em_producao },
  faturado: { label: 'Faturamento', cls: STATUS_COLOR.faturado },
  entregue: { label: 'Entregue', cls: STATUS_COLOR.entregue },
};
const MOTIVO: Record<string, string> = { revenda: 'revenda', estoque: 'estoque atende', alternativo: 'produto alternativo', producao: 'precisa produzir', etapa: '' };
const qtd = (it: PedidoNoFluxo['itens'][number]) => (it.saleUnit === 'kg' ? `${Number(it.quantity ?? 0).toLocaleString('pt-BR')} kg` : it.saleUnit === 'un' ? `${it.quantity ?? 0} un` : `${it.quantityUnits ?? 0} un`);

/**
 * Lista de pedidos de um fluxo (Produção ou Faturamento) com os itens daquele fluxo e os botões de etapa.
 * Produção (PCP): Aberto → Em produção → Faturamento. Faturamento: Aberto → Faturamento → Entregue. Os dois voltam para Aberto.
 */
export function FluxoPedidos({ fluxo, pedidos, podeMudar }: { fluxo: 'producao' | 'faturamento'; pedidos: PedidoNoFluxo[]; podeMudar: boolean }) {
  const qc = useQueryClient();
  const go = useMutation({
    mutationFn: (v: { ids: string[]; etapa: Etapa }) => mudarEtapa(v.ids, v.etapa),
    onSuccess: (_d, v) => { toast.success(`Itens em ${ETAPA[v.etapa].label}.`); ['planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!pedidos.length) return <Card><EmptyState title="Nenhum pedido aqui agora" description={fluxo === 'producao' ? 'Os pedidos que precisam de produção aparecem aqui, pela entrega mais próxima.' : 'Pedidos de revenda, os que o estoque já atende e os que a produção liberou aparecem aqui.'} /></Card>;
  return (
    <div className="space-y-3">
      {pedidos.map((p) => {
        const ids = (e: Etapa[]) => p.itens.filter((i) => e.includes(i.stage)).map((i) => i.itemId);
        const btn = (etapa: Etapa, de: Etapa[], label: string, icon: React.ReactNode, outline = false) => {
          const v = ids(de); if (!podeMudar || !v.length) return null;
          return <Button size="sm" variant={outline ? 'outline' : 'primary'} icon={icon} loading={go.isPending} onClick={() => go.mutate({ ids: v, etapa })}>{label}</Button>;
        };
        return (
          <Card key={p.orderId}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/pedidos/${p.orderId}`} className="font-display font-bold hover:text-brand">Pedido {p.orderNumber ? `#${p.orderNumber}` : 'sem número'}</Link>
                  <span className="text-sm text-muted">{p.customer ?? '—'}</span>
                  <Badge tone="neutral">entrega {fmtDate(p.deliveryDate)}</Badge>
                </div>
                <ul className="mt-2 space-y-1">
                  {p.itens.map((i) => (
                    <li key={i.itemId} className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge className={ETAPA[i.stage].cls} dot>{ETAPA[i.stage].label}</Badge>
                      <span className="font-mono text-xs text-muted">{i.productCode}</span>
                      <span className="min-w-0">{i.productName ?? '—'}</span>
                      <span className="num font-semibold">{qtd(i)}</span>
                      {MOTIVO[i.motivo] && <span className="text-xs text-muted">· {MOTIVO[i.motivo]}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                {fluxo === 'producao' ? <>
                  {btn('em_producao', ['aberto'], 'Em produção', <Factory className="size-4" />)}
                  {btn('faturado', ['em_producao'], 'Pronto: Faturamento', <CheckCircle2 className="size-4" />)}
                </> : <>
                  {btn('faturado', ['aberto', 'em_producao'], 'Faturamento ciente', <CheckCircle2 className="size-4" />)}
                  {btn('entregue', ['faturado'], 'Entregue', <Truck className="size-4" />)}
                </>}
                {btn('aberto', fluxo === 'producao' ? ['em_producao'] : ['faturado'], 'Voltar para aberto', <Undo2 className="size-4" />, true)}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
