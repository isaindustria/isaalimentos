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
import { downloadBlob, fmtBRL, fmtDate } from '@/lib/utils';
import { isRevenda } from '@/domain/planejamento';

const ETAPA: Record<Etapa, string> = { aberto: 'Aberto', em_producao: 'Em produção', faturado: 'Faturamento', entregue: 'Entregue' };
const ETAPA_COR: Record<Etapa, string> = { aberto: STATUS_COLOR.aberto, em_producao: STATUS_COLOR.em_producao, faturado: STATUS_COLOR.faturado, entregue: STATUS_COLOR.entregue };
type Item = PedidoNoFluxo['todos'][number];
const qtdNum = (it: Item) => Number(it.saleUnit ? it.quantity ?? 0 : it.quantityUnits ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const equiv = (it: Item) => (it.saleUnit === 'kg' ? 'Kg' : 'UNIDADE');
/** Situação do item (solicitação #16): revenda continua "revenda" mesmo depois do ciente; produção com cadeado; liberado pela produção. */
function situacao(it: Item): { texto: string; travado: boolean } {
  if (isRevenda(it.reference)) return { texto: 'revenda', travado: false };
  if (it.fluxo === 'producao') return { texto: 'Produção', travado: true };
  if (it.motivo === 'estoque') return { texto: 'estoque', travado: false };
  if (it.motivo === 'alternativo') return { texto: 'alternativo', travado: false };
  return { texto: 'liberado', travado: false };
}

/**
 * Aba Faturamento (Rotas de entrega, solicitação #15): cada cartão é o pedido inteiro, com cabeçalho do cliente.
 * O faturamento só muda os itens dele (revenda e os que o estoque atende); os itens da Produção ele só vê, até o PCP liberar.
 * Entregue só quando todos os itens do pedido estão em Faturamento ciente.
 */
export function FaturamentoPedidos({ pedidos, podeMudar, onEnviarMontar }: { pedidos: PedidoNoFluxo[]; podeMudar: boolean; onEnviarMontar?: (orderId: string) => void }) {
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm sm:min-w-[640px]">
                <thead><tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 text-left">Código</th><th className="px-2 py-2 text-left">Produto</th><th className="px-2 py-2 text-right">Quantidade</th><th className="hidden px-2 py-2 text-left sm:table-cell">Equivalênc.</th>
                  <th className="hidden px-2 py-2 text-right sm:table-cell">Valor unitário</th><th className="px-2 py-2 text-right">Valor total</th><th className="px-2 py-2 text-left">Status</th><th className="px-4 py-2 text-left">Situação</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {p.todos.map((i) => { const st = situacao(i); return (
                    <tr key={i.itemId}>
                      <td className="px-4 py-2 font-mono text-xs">{i.productCode}</td>
                      <td className="px-2 py-2">{i.productName ?? '—'}</td>
                      <td className="num px-2 py-2 text-right">{qtdNum(i)}<span className="sm:hidden"> {i.saleUnit === 'kg' ? 'kg' : 'un'}</span></td>
                      <td className="hidden px-2 py-2 text-xs sm:table-cell">{equiv(i)}</td>
                      <td className="num hidden px-2 py-2 text-right sm:table-cell">{i.unitPrice != null ? fmtBRL(i.unitPrice) : '—'}</td>
                      <td className="num px-2 py-2 text-right font-semibold">{i.totalPrice != null ? fmtBRL(i.totalPrice) : '—'}</td>
                      <td className="px-2 py-2"><Badge className={ETAPA_COR[i.stage]} dot>{ETAPA[i.stage]}</Badge></td>
                      <td className="px-4 py-2 text-xs text-muted">{st.travado ? <span className="inline-flex items-center gap-1"><Lock className="size-3" />{st.texto}</span> : st.texto}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-line p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-muted">Observações: <span className="text-fg">{p.notes || '—'}</span></div>
              <dl className="grid w-full max-w-xs gap-1">
                <div className="flex justify-between"><dt className="text-muted">Subtotal dos itens</dt><dd className="num">{fmtBRL(p.subtotal ?? p.total ?? 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Desconto financeiro</dt><dd className="num">− {fmtBRL(p.discount ?? 0)}</dd></div>
                <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="num">{fmtBRL(p.total ?? 0)}</dd></div>
              </dl>
            </div>
            {podeMudar && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                {ciente.length > 0 && <Button size="sm" icon={<CheckCircle2 className="size-4" />} loading={go.isPending} onClick={() => go.mutate({ ids: ciente, etapa: 'faturado' })}>Faturamento ciente</Button>}
                {/* solicitação #17: o Entregue saiu daqui (fica na aba Rotas); com tudo em Faturamento o pedido vai para Montar rota */}
                {todosCiente && onEnviarMontar && <Button size="sm" variant="outline" icon={<Truck className="size-4" />} onClick={() => onEnviarMontar(p.orderId)}>Enviar para Montar rota</Button>}
                {voltar.length > 0 && <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => go.mutate({ ids: voltar, etapa: 'aberto' })}>Voltar para aberto</Button>}
                {!todosCiente && <span className="text-xs text-muted">Com todos os itens em Faturamento, o pedido vai para Montar rota.</span>}
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
    const h = 30 + p.todos.length * 5;
    if (y + h > 285) { doc.addPage(); y = 14; }
    doc.setDrawColor(200); doc.roundedRect(L, y, R - L, h, 2, 2);
    const cols: Array<[string, string, number]> = [['Código', p.customerCode ?? '-', L + 2], ['Cliente', (p.customer ?? '-').slice(0, 42), L + 20], ['CNPJ', fmtCnpj(p.cnpj), L + 95], ['Pedido', p.orderNumber ?? '-', L + 130], ['Vendedor', (p.seller ?? '-').slice(0, 14), L + 148], ['Entrega', fmtDate(p.deliveryDate), L + 170]];
    doc.setFontSize(6.5); doc.setTextColor(120); cols.forEach(([l, , x]) => doc.text(l.toUpperCase(), x, y + 4));
    doc.setFontSize(8.5); doc.setTextColor(0); cols.forEach(([, v, x]) => doc.text(String(v), x, y + 8.5));
    doc.setDrawColor(230); doc.line(L, y + 11, R, y + 11);
    doc.setFontSize(6.5); doc.setTextColor(120);
    [['CÓDIGO', 2], ['PRODUTO', 14], ['QTD', 84], ['EQUIV.', 96], ['VL. UNIT.', 112], ['VL. TOTAL', 132], ['STATUS', 150], ['SITUAÇÃO', 168]].forEach(([t, x]) => doc.text(String(t), L + Number(x), y + 14.5));
    doc.setTextColor(0);
    let yy = y + 19;
    doc.setFontSize(7.5);
    for (const i of p.todos) {
      doc.text(i.productCode, L + 2, yy);
      doc.text((i.productName ?? '-').slice(0, 38), L + 14, yy);
      doc.text(qtdNum(i), L + 92, yy, { align: 'right' });
      doc.text(equiv(i), L + 96, yy);
      doc.text((i.unitPrice != null ? fmtBRL(i.unitPrice) : '-').replace(/ /g, ' '), L + 128, yy, { align: 'right' });
      doc.text((i.totalPrice != null ? fmtBRL(i.totalPrice) : '-').replace(/ /g, ' '), L + 148, yy, { align: 'right' });
      doc.text(ETAPA[i.stage], L + 150, yy);
      doc.setTextColor(120); doc.text(situacao(i).texto, L + 168, yy); doc.setTextColor(0);
      yy += 5;
    }
    doc.setDrawColor(230); doc.line(L, yy - 2, R, yy - 2);
    doc.setFontSize(7.5);
    doc.text(`Observações: ${(p.notes ?? '-').slice(0, 70)}`, L + 2, yy + 3);
    doc.text(`Subtotal ${fmtBRL(p.subtotal ?? p.total ?? 0)}   Desconto - ${fmtBRL(p.discount ?? 0)}   Total ${fmtBRL(p.total ?? 0)}`.replace(/ /g, ' '), R - 2, yy + 3, { align: 'right' });
    y += h + 4;
  }
  downloadBlob(doc.output('blob'), `faturamento-${new Date().toISOString().slice(0, 10)}.pdf`);
}
