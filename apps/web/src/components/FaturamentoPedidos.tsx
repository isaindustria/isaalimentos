import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, FileDown, Lock, Truck, Undo2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Badge, Button, Card, EmptyState } from '@/components/primitives';
import { mudarEtapa, type PedidoNoFluxo } from '@/api/planejamento';
import type { Etapa } from '@/domain/planejamento';
import { STATUS_COLOR } from '@/pages/OrdersPage';
import { fmtCnpj } from '@/domain/sales';
import { downloadBlob, fmtDate } from '@/lib/utils';

const ETAPA: Record<Etapa, string> = { aberto: 'Aberto', em_producao: 'Em produção', faturado: 'Faturamento', entregue: 'Entregue' };
const ETAPA_COR: Record<Etapa, string> = { aberto: STATUS_COLOR.aberto, em_producao: STATUS_COLOR.em_producao, faturado: STATUS_COLOR.faturado, entregue: STATUS_COLOR.entregue };
type Item = PedidoNoFluxo['todos'][number];
const qtd = (it: Item) => (it.saleUnit === 'kg' ? `${Number(it.quantity ?? 0).toLocaleString('pt-BR')} kg` : it.saleUnit === 'un' ? `${it.quantity ?? 0} un` : `${it.quantityUnits ?? 0} un`);

/**
 * Aba Faturamento (Rotas de entrega, solicitação #15): cada cartão é o pedido inteiro, com cabeçalho do cliente.
 * O faturamento só muda os itens dele (revenda e os que o estoque atende); os itens da Produção ele só vê, até o PCP liberar.
 * Entregue só quando todos os itens do pedido estão em Faturamento ciente.
 */
export function FaturamentoPedidos({ pedidos, podeMudar }: { pedidos: PedidoNoFluxo[]; podeMudar: boolean }) {
  const qc = useQueryClient();
  const go = useMutation({
    mutationFn: (v: { ids: string[]; etapa: Etapa }) => mudarEtapa(v.ids, v.etapa),
    onSuccess: (_d, v) => { toast.success(`Itens em ${ETAPA[v.etapa]}.`); ['planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ordenados = [...pedidos].sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999'));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" icon={<FileDown className="size-4" />} disabled={!ordenados.length} onClick={() => exportarPdf(ordenados)}>Exportar PDF</Button>
      </div>
      {!ordenados.length && <Card><EmptyState title="Nenhum pedido no faturamento agora" description="Pedidos de revenda, os que o estoque já atende e os que a Produção liberou aparecem aqui, pela entrega mais próxima." /></Card>}
      {ordenados.map((p) => {
        const meus = p.todos.filter((i) => i.fluxo === 'faturamento');
        const ciente = meus.filter((i) => i.stage === 'aberto' || i.stage === 'em_producao').map((i) => i.itemId);
        const voltar = meus.filter((i) => i.stage === 'faturado').map((i) => i.itemId);
        const todosCiente = p.todos.length > 0 && p.todos.every((i) => i.stage === 'faturado');
        return (
          <Card key={p.orderId} padded={false}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line p-4 text-sm sm:grid-cols-[90px_minmax(0,2fr)_150px_90px_minmax(0,1fr)_100px]">
              {([['Código', p.customerCode ?? '—'], ['Cliente', p.customer ?? '—'], ['CNPJ', fmtCnpj(p.cnpj)], ['Pedido', p.orderNumber ?? '—'], ['Vendedor', p.seller ?? '—'], ['Entrega', fmtDate(p.deliveryDate)]] as const).map(([l, v]) => (
                <div key={l} className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{l}</div><div className={`truncate ${l === 'Cliente' ? 'font-semibold' : ''}`} title={String(v)}>{l === 'Pedido' && p.orderNumber ? <Link to={`/pedidos/${p.orderId}`} className="text-brand">{v}</Link> : v}</div></div>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {p.todos.map((i) => (
                <li key={i.itemId} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <Badge className={ETAPA_COR[i.stage]} dot>{ETAPA[i.stage]}</Badge>
                  <span className="font-mono text-xs text-muted">{i.productCode}</span>
                  <span className="min-w-0 flex-1">{i.productName ?? '—'}</span>
                  <span className="num font-semibold">{qtd(i)}</span>
                  {i.fluxo === 'producao'
                    ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Lock className="size-3" />Produção · só visualizar</span>
                    : <span className="text-xs text-muted">{i.motivo === 'revenda' ? 'revenda' : i.motivo === 'estoque' ? 'estoque atende' : i.motivo === 'alternativo' ? 'produto alternativo' : 'liberado pela produção'}</span>}
                </li>
              ))}
            </ul>
            {podeMudar && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                {ciente.length > 0 && <Button size="sm" icon={<CheckCircle2 className="size-4" />} loading={go.isPending} onClick={() => go.mutate({ ids: ciente, etapa: 'faturado' })}>Faturamento ciente</Button>}
                <Button size="sm" variant={todosCiente ? 'primary' : 'outline'} icon={<Truck className="size-4" />} disabled={!todosCiente || go.isPending} onClick={() => go.mutate({ ids: p.todos.map((i) => i.itemId), etapa: 'entregue' })}>Entregue</Button>
                {voltar.length > 0 && <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => go.mutate({ ids: voltar, etapa: 'aberto' })}>Voltar para aberto</Button>}
                {!todosCiente && <span className="text-xs text-muted">Entregue fica liberado quando todos os itens estiverem em Faturamento.</span>}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** PDF com todos os cartões do faturamento (cabeçalho do cliente e itens com a etapa). */
function exportarPdf(pedidos: PedidoNoFluxo[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 12, R = 198; let y = 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Faturamento - pedidos', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${pedidos.length} pedido(s), pela entrega mais próxima`, L, y + 5);
  y += 12;
  for (const p of pedidos) {
    const h = 16 + p.todos.length * 5;
    if (y + h > 285) { doc.addPage(); y = 14; }
    doc.setDrawColor(200); doc.roundedRect(L, y, R - L, h, 2, 2);
    const cols: Array<[string, string, number]> = [['Código', p.customerCode ?? '-', L + 2], ['Cliente', (p.customer ?? '-').slice(0, 42), L + 20], ['CNPJ', fmtCnpj(p.cnpj), L + 95], ['Pedido', p.orderNumber ?? '-', L + 130], ['Vendedor', (p.seller ?? '-').slice(0, 14), L + 148], ['Entrega', fmtDate(p.deliveryDate), L + 170]];
    doc.setFontSize(6.5); doc.setTextColor(120); cols.forEach(([l, , x]) => doc.text(l.toUpperCase(), x, y + 4));
    doc.setFontSize(8.5); doc.setTextColor(0); cols.forEach(([, v, x]) => doc.text(String(v), x, y + 8.5));
    doc.setDrawColor(230); doc.line(L, y + 11, R, y + 11);
    let yy = y + 15.5;
    doc.setFontSize(8);
    for (const i of p.todos) {
      doc.text(`[${ETAPA[i.stage]}]`, L + 2, yy);
      doc.text(i.productCode, L + 25, yy);
      doc.text((i.productName ?? '-').slice(0, 60), L + 38, yy);
      doc.text(qtd(i), L + 140, yy);
      doc.setTextColor(120); doc.text(i.fluxo === 'producao' ? 'Produção' : 'Faturamento', L + 160, yy); doc.setTextColor(0);
      yy += 5;
    }
    y += h + 4;
  }
  downloadBlob(doc.output('blob'), `faturamento-${new Date().toISOString().slice(0, 10)}.pdf`);
}
