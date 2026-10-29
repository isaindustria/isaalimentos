import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Circle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, Table } from '@/components/primitives';
import { itemKg } from '@/domain/planejamento';
import { mudarPcp, type ItemPcp, type ProdutoPcp } from '@/api/pcp';
import { fmtDate } from '@/lib/utils';
import { Chips, qtd } from './comum';

/**
 * Aba Pedido: cada produto do pedido numa linha, pela data de entrega (e depois pelo código sequencial do pedido).
 * Clicar em Aberto passa para Firmado; só o firmado entra no cálculo da aba Produção.
 */
export function AbaPedido({ itens, produtos, pode }: { itens: ItemPcp[]; produtos: Map<string, ProdutoPcp>; pode: boolean }) {
  const qc = useQueryClient();
  const [seq, setSeq] = useState('');
  const [prod, setProd] = useState('');
  const [cod, setCod] = useState('');
  const [status, setStatus] = useState<Set<'aberto' | 'firmado'>>(new Set());
  const lista = useMemo(() => {
    const p = prod.trim().toLowerCase();
    return itens.filter((i) => (!seq.trim() || String(i.orderNumber ?? '') === seq.trim())
      && (!cod.trim() || i.productCode === cod.trim())
      && (!p || (i.productName ?? produtos.get(i.productCode)?.description ?? '').toLowerCase().includes(p))
      && (!status.size || status.has(i.pcpStatus)))
      .sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') || String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), undefined, { numeric: true }));
  }, [itens, seq, prod, cod, status, produtos]);
  const muda = useMutation({
    mutationFn: (v: { ids: string[]; s: 'aberto' | 'firmado' }) => mudarPcp(v.ids, v.s),
    onSuccess: (_r, v) => { toast.success(v.s === 'firmado' ? `${v.ids.length} item(ns) firmado(s): entram na aba Produção.` : 'Voltou para Aberto.'); qc.invalidateQueries({ queryKey: ['pcp'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const abertosFiltrados = lista.filter((i) => i.pcpStatus === 'aberto').map((i) => i.itemId);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Input className="h-9 w-28" placeholder="Cód. seq." inputMode="numeric" value={seq} onChange={(e) => setSeq(e.target.value)} />
        <Input className="h-9 w-28" placeholder="Cód. produto" value={cod} onChange={(e) => setCod(e.target.value)} />
        <Input className="h-9 max-w-xs" placeholder="Produto" value={prod} onChange={(e) => setProd(e.target.value)} />
        <Chips label="Status" opcoes={[{ v: 'aberto' as const, l: 'Aberto' }, { v: 'firmado' as const, l: 'Firmado' }]} valor={status} onChange={setStatus} />
        {pode && abertosFiltrados.length > 0 && <Button className="ml-auto" size="sm" variant="outline" loading={muda.isPending} onClick={() => confirm(`Firmar os ${abertosFiltrados.length} item(ns) em Aberto da lista?`) && muda.mutate({ ids: abertosFiltrados, s: 'firmado' })}>Firmar os da lista ({abertosFiltrados.length})</Button>}
      </div>
      {lista.length ? (
        <Table className="[&>table]:min-w-max">
          <thead><tr><th className="th">Cód. seq.</th><th className="th">Data da entrega</th><th className="th">Cód. prod.</th><th className="th">Produto</th><th className="th text-right">Pedidos</th><th className="th">Troca de embalagem</th><th className="th">Status</th></tr></thead>
          <tbody>{lista.map((i) => {
            const p = produtos.get(i.productCode);
            const k = itemKg(i, p);
            const firmado = i.pcpStatus === 'firmado';
            return (
              <tr key={i.itemId}>
                <td className="td num font-semibold">{i.orderNumber ?? '—'}</td>
                <td className="td whitespace-nowrap">{fmtDate(i.deliveryDate)}</td>
                <td className="td num">{i.productCode}</td>
                <td className="td">{i.productName ?? p?.description ?? i.productCode}<div className="text-[11px] text-muted">{i.customer ?? ''}</div></td>
                <td className="td num text-right">{k != null ? `${qtd(k)} kg` : `${qtd(i.quantity)} ${i.saleUnit ?? ''}`}</td>
                <td className="td">{i.allowSwap === true ? 'SIM' : i.allowSwap === false ? 'NÃO' : '—'}</td>
                <td className="td">
                  {pode ? (
                    <button type="button" disabled={muda.isPending} onClick={() => muda.mutate({ ids: [i.itemId], s: firmado ? 'aberto' : 'firmado' })}
                      title={firmado ? 'Voltar para Aberto' : 'Firmar (entra na aba Produção)'}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${firmado ? 'border-ok/40 bg-ok/10 text-ok' : 'border-brand/40 bg-brand-soft text-brand'}`}>
                      {firmado ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3 fill-current" />}{firmado ? 'Firmado' : 'Aberto'}
                    </button>
                  ) : <Badge tone={firmado ? 'ok' : 'brand'} dot>{firmado ? 'Firmado' : 'Aberto'}</Badge>}
                  {i.stage === 'em_producao' && <Badge tone="warn" className="ml-2">em produção</Badge>}
                </td>
              </tr>
            );
          })}</tbody>
        </Table>
      ) : <EmptyState title={itens.length ? 'Nada com esse filtro' : 'Nenhum pedido para a produção'} description="Os produtos fabricados dos pedidos em aberto aparecem aqui, pela data de entrega." />}
    </Card>
  );
}
