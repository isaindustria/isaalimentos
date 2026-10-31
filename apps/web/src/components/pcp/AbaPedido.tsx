import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Truck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, Table } from '@/components/primitives';
import type { AcabadoItem } from '@/domain/pcp';
import { faturarPedido, mudarPcp, type ItemPcp } from '@/api/pcp';
import { fmtDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { qtd, COMPACTA } from './comum';

/**
 * Aba Pedido (Produção 5, solicitação #23): cada produto do pedido numa linha, em UNIDADES, com o estoque acabado
 * que atende o item, pela data de entrega. Firmado leva para a aba Produção. Faturamento (só o pedido completo)
 * leva para Rotas de entrega e deixa uma cópia no Relatório com o status Faturamento.
 */
export function AbaPedido({ itens, aloc, completo, todosDoPedido, pode }: {
  itens: ItemPcp[]; aloc: Map<string, AcabadoItem>; completo: (orderId: string) => boolean; todosDoPedido: (orderId: string) => ItemPcp[]; pode: boolean;
}) {
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const [seq, setSeq] = useState('');
  const [prod, setProd] = useState('');
  const [cod, setCod] = useState('');
  const lista = useMemo(() => {
    const p = prod.trim().toLowerCase();
    return itens.filter((i) => (!seq.trim() || String(i.orderNumber ?? '') === seq.trim())
      && (!cod.trim() || i.productCode === cod.trim())
      && (!p || (i.productName ?? '').toLowerCase().includes(p)))
      .sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') || String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), undefined, { numeric: true }));
  }, [itens, seq, prod, cod]);
  const refresh = () => ['pcp', 'planejamento', 'orders', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const firmar = useMutation({
    mutationFn: (ids: string[]) => mudarPcp(ids, 'firmado'),
    onSuccess: (_r, ids) => { toast.success(`${ids.length} item(ns) firmado(s): foram para a aba Produção.`); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const faturar = useMutation({
    mutationFn: (orderId: string) => faturarPedido(todosDoPedido(orderId), completo(orderId), { id: session?.user.id, nome: profile?.name ?? null }),
    onSuccess: () => { toast.success('Pedido completo enviado para o Faturamento (Rotas de entrega). A cópia ficou no Relatório.'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ids = lista.filter((i) => !i.revenda).map((i) => i.itemId);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Input className="h-9 w-28" placeholder="Cód. seq." inputMode="numeric" value={seq} onChange={(e) => setSeq(e.target.value)} />
        <Input className="h-9 w-28" placeholder="Cód. produto" value={cod} onChange={(e) => setCod(e.target.value)} />
        <Input className="h-9 max-w-xs" placeholder="Produto" value={prod} onChange={(e) => setProd(e.target.value)} />
        {pode && ids.length > 0 && <Button className="ml-auto" size="sm" variant="outline" loading={firmar.isPending} onClick={() => confirm(`Firmar os ${ids.length} item(ns) da lista? Eles vão para a aba Produção.`) && firmar.mutate(ids)}>Firmar os da lista ({ids.length})</Button>}
      </div>
      {lista.length ? (
        <Table dense className={COMPACTA}>
          <thead><tr>
            <th className="th w-14">Cód. seq.</th><th className="th w-20">Data da entrega</th><th className="th w-14">Cód. prod.</th><th className="th">Produto</th>
            <th className="th w-16 text-right">Pedidos (un)</th><th className="th w-16 text-right">Estoque (un)</th><th className="th w-16">Troca de embalagem</th>
            <th className="th w-24 text-center">Firmado</th><th className="th w-28 text-center">Faturamento</th>
          </tr></thead>
          <tbody>{lista.map((i) => {
            const a = aloc.get(i.itemId);
            const ok = completo(i.orderId);
            return (
              <tr key={i.itemId}>
                <td className="td num font-semibold">{i.orderNumber ?? '—'}</td>
                <td className="td whitespace-nowrap text-xs">{fmtDate(i.deliveryDate)}</td>
                <td className="td num text-xs">{i.productCode}</td>
                <td className="td text-xs leading-snug">{i.productName ?? i.productCode}<span className="block text-[10px] text-muted">{i.customer ?? ''}</span></td>
                <td className="td num text-right">{a ? qtd(a.pedidoUn) : qtd(i.quantity)}</td>
                <td className={`td num text-right ${a && !a.atendido ? 'text-danger' : 'text-ok'}`} title={a ? (a.atendido ? 'O estoque acabado atende' : `Faltam ${qtd(a.faltaUn)} un`) : ''}>{i.revenda ? 'revenda' : a ? qtd(a.estoqueUn) : '—'}</td>
                <td className="td text-xs">{i.allowSwap === true ? 'sim' : i.allowSwap === false ? 'não' : '—'}</td>
                <td className="td text-center">
                  {i.revenda ? <Badge>revenda</Badge> : pode
                    ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" icon={<CheckCircle2 className="size-3.5" />} loading={firmar.isPending && firmar.variables?.includes(i.itemId)} onClick={() => firmar.mutate([i.itemId])}>Firmado</Button>
                    : <Badge tone="brand" dot>Aberto</Badge>}
                </td>
                <td className="td text-center">
                  {pode && <Button size="sm" variant={ok ? 'primary' : 'ghost'} className="h-7 px-2 text-xs" disabled={!ok} title={ok ? 'Pedido completo: enviar para Rotas de entrega' : 'Só o pedido completo vai para o Faturamento'}
                    icon={<Truck className="size-3.5" />} loading={faturar.isPending && faturar.variables === i.orderId}
                    onClick={() => confirm(`Enviar o pedido ${i.orderNumber ?? ''} inteiro para o Faturamento (Rotas de entrega)?`) && faturar.mutate(i.orderId)}>Faturamento</Button>}
                </td>
              </tr>
            );
          })}</tbody>
        </Table>
      ) : <EmptyState title={itens.length ? 'Nada com esse filtro' : 'Nenhum pedido em Aberto'} description="Os pedidos novos (lançados ou importados) chegam aqui em Aberto. Firmado leva para a aba Produção." />}
      <p className="px-4 py-2 text-xs text-muted">Pedidos e estoque em unidades. O estoque acabado atende a entrega mais próxima primeiro e não é contado duas vezes (vermelho: não atende tudo). Faturamento só libera o pedido completo, com todos os produtos atendidos.</p>
    </Card>
  );
}
