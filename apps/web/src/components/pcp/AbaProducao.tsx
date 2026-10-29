import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, CircleCheckBig, Factory } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Table } from '@/components/primitives';
import type { AcabadoItem, LinhaProducao } from '@/domain/pcp';
import { colocarEmProducao, concluirOP, prontoFaturamento, type ItemPcp, type OrdemProducao } from '@/api/pcp';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { kg } from './comum';

/**
 * Aba Produção: só os itens firmados. Acabados que o estoque atende: Pronto: Faturamento (vão para Rotas de entrega).
 * Semiacabados que faltam (necessidade negativa): Em produção (abre a ordem de produção).
 */
export function AbaProducao({ acabados, producao, semFormula, itens, ops, abertos, pode }: {
  acabados: AcabadoItem[]; producao: LinhaProducao[]; semFormula: string[]; itens: ItemPcp[]; ops: OrdemProducao[]; abertos: number; pode: boolean;
}) {
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const quem = { id: session?.user.id, nome: profile?.name ?? null };
  const refresh = () => ['pcp', 'planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const fail = (e: Error) => toast.error(e.message);
  const pronto = useMutation({ mutationFn: (a: AcabadoItem) => prontoFaturamento([a], ops, quem), onSuccess: (_r, a) => { toast.success(`Pedido ${a.item.orderNumber ?? ''}: ${a.item.productCode} foi para o Faturamento (Rotas de entrega).`); refresh(); }, onError: fail });
  const emProd = useMutation({ mutationFn: (l: LinhaProducao) => colocarEmProducao(l, itens, quem), onSuccess: (_r, l) => { toast.success(`Ordem de produção aberta: ${l.description}.`); refresh(); }, onError: fail });
  const concluir = useMutation({ mutationFn: concluirOP, onSuccess: () => { toast.success('Ordem de produção concluída.'); refresh(); }, onError: fail });
  const abertas = ops.filter((o) => o.status === 'em_producao');
  const opDe = (code: string) => abertas.find((o) => o.product_code === code);
  const faltam = producao.filter((l) => l.necessidadeKg < 0);

  return (
    <div className="space-y-4">
      {abertos > 0 && <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm">{abertos} item(ns) ainda em <b>Aberto</b> na aba Pedido não entram neste cálculo. Firme-os para incluir.</p>}
      {semFormula.length > 0 && <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm">Sem fórmula e sem semiacabado no cadastro: {semFormula.join(', ')}. Ligue a fórmula na aba Fórmula ou o semiacabado em Produtos.</p>}

      <Card title="Produção (semiacabados que faltam)" padded={false}>
        {faltam.length ? (
          <Table className="[&>table]:min-w-max">
            <thead><tr><th className="th">Data da entrega</th><th className="th">Cód. form.</th><th className="th">Descrição da fórmula</th><th className="th text-right">Pedido em kilos</th><th className="th text-right">Estoque</th><th className="th text-right">Necessidade</th><th className="th text-right">Prod. mín.</th><th className="th text-right">A produzir</th><th className="th" /></tr></thead>
            <tbody>{faltam.map((l) => {
              const op = opDe(l.code);
              return (
                <tr key={l.code}>
                  <td className="td whitespace-nowrap">{fmtDate(l.earliest)}</td>
                  <td className="td num">{l.formulaCode ?? '—'}</td>
                  <td className="td">{l.description}<div className="text-[11px] text-muted">semiacabado {l.code}</div></td>
                  <td className="td num text-right">{kg(l.pedidoKg)}</td>
                  <td className="td num text-right">{kg(l.estoqueKg)}</td>
                  <td className="td num text-right font-semibold text-danger">{kg(l.necessidadeKg)}</td>
                  <td className="td num text-right">{l.minKg ? kg(l.minKg) : 'pedido'}</td>
                  <td className="td num text-right font-semibold">{kg(l.produzirKg)}</td>
                  <td className="td text-right">
                    {op ? <Badge tone="warn" dot>Em produção · OP {op.numero}</Badge>
                      : pode && <Button size="sm" icon={<Factory className="size-3.5" />} loading={emProd.isPending && emProd.variables?.code === l.code} onClick={() => emProd.mutate(l)}>Em produção</Button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </Table>
        ) : <EmptyState title="Nada para produzir" description="Com os pedidos firmados, o estoque atende tudo." />}
        <p className="px-5 py-3 text-xs text-muted">Pedido em kilos soma o que falta dos acabados e o que outros semiacabados pedem pela fórmula. Necessidade = estoque − pedido; negativa, precisa produzir (o maior entre a falta e a produção mínima). Datas diferentes somam na mais próxima. Semiacabado com estoque suficiente não aparece. Matéria-prima não entra.</p>
      </Card>

      <Card title="Pedidos firmados" padded={false}>
        {acabados.length ? (
          <Table className="[&>table]:min-w-max">
            <thead><tr><th className="th">Data da entrega</th><th className="th">Cód. seq.</th><th className="th">Produto</th><th className="th text-right">Pedido</th><th className="th text-right">Do estoque</th><th className="th text-right">Falta</th><th className="th" /></tr></thead>
            <tbody>{acabados.map((a) => (
              <tr key={a.item.itemId}>
                <td className="td whitespace-nowrap">{fmtDate(a.item.deliveryDate)}</td>
                <td className="td num font-semibold">{a.item.orderNumber ?? '—'}</td>
                <td className="td"><span className="num">{a.item.productCode}</span> · {a.item.productName ?? ''}<div className="text-[11px] text-muted">{a.item.customer ?? ''}</div></td>
                <td className="td num text-right">{kg(a.kg)}</td>
                <td className="td num text-right">{kg(a.atendidoKg)}</td>
                <td className={`td num text-right ${a.faltaKg > 0 ? 'text-danger' : 'text-muted'}`}>{kg(a.faltaKg)}</td>
                <td className="td text-right">
                  {pode && <Button size="sm" variant={a.atendido ? 'primary' : 'outline'} disabled={!a.atendido} title={a.atendido ? 'Enviar para Rotas de entrega' : 'O estoque ainda não atende este pedido'}
                    icon={<CheckCircle2 className="size-3.5" />} loading={pronto.isPending && pronto.variables?.item.itemId === a.item.itemId} onClick={() => pronto.mutate(a)}>Pronto: Faturamento</Button>}
                </td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="Nenhum pedido firmado" description="Firme os pedidos na aba Pedido para calcular a produção." />}
        <p className="px-5 py-3 text-xs text-muted">O estoque do produto acabado atende primeiro a entrega mais próxima e não é usado duas vezes. Pronto: Faturamento só libera quando o estoque atende o pedido inteiro.</p>
      </Card>

      {abertas.length > 0 && (
        <Card title="Ordens em produção" padded={false}>
          <Table>
            <thead><tr><th className="th">OP</th><th className="th">Semiacabado</th><th className="th text-right">Produzir</th><th className="th">Entrega</th><th className="th">Aberta por</th><th className="th" /></tr></thead>
            <tbody>{abertas.map((o) => (
              <tr key={o.id}>
                <td className="td num font-semibold">{o.numero}</td>
                <td className="td">{o.description}<div className="text-[11px] text-muted">fórmula {o.formula_code ?? '—'} · {o.item_ids.length} item(ns) de pedido</div></td>
                <td className="td num text-right">{kg(Number(o.quantity_kg))}</td>
                <td className="td">{fmtDate(o.due_date)}</td>
                <td className="td text-xs">{o.created_by_name ?? '—'} · {fmtDateTime(o.created_at)}</td>
                <td className="td text-right">{pode && <Button size="sm" variant="outline" icon={<CircleCheckBig className="size-3.5" />} onClick={() => confirm(`Concluir a OP ${o.numero}? Importe o estoque atualizado para liberar o faturamento.`) && concluir.mutate(o.id)}>Concluir</Button>}</td>
              </tr>
            ))}</tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
