import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Printer, Pencil, Plus } from 'lucide-react';
import { deleteOrder, getOrder, postOrderStock, setOrderStatus } from '@/api/orders';
import { logActivity } from '@/api/activity';
import { Button, Card, PageHeader, Spinner, Table } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtDec, fmtInt, formatCnpj } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL, StatusBadge } from './OrdersPage';
import { MatchBadge } from './OrderImportPage';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isSeller, session, profile } = useAuth();
  const rt = useRealtime();
  const editors = rt.editorsOf(`order:${id}`);
  const order = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id) });
  const post = useMutation({
    mutationFn: () => postOrderStock(id, session?.user.id),
    onSuccess: async (n) => {
      toast.success(n ? `Estoque baixado: ${n} produto(s) do pedido.` : 'Este pedido já tinha sido baixado do estoque.');
      if (n) await logActivity({ kind: 'estoque', title: `Baixa de estoque do pedido #${order.data?.order_number ?? ''}`, body: `${n} produto(s) · ${order.data?.customer?.name ?? ''}`, link: '/estoque', actor_id: session?.user.id, actor_name: profile?.name ?? null });
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['current-stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
    },
    onError: (e: Error) => toast.error(`Não foi possível baixar o estoque: ${e.message}`),
  });

  const status = useMutation({
    mutationFn: (s: OrderStatus) => setOrderStatus(id, s),
    onSuccess: async (_r, s) => {
      toast.success(`Status alterado para ${STATUS_LABEL[s].label}.`);
      await logActivity({ kind: 'pedido', title: `Pedido #${order.data?.order_number ?? ''} · ${STATUS_LABEL[s].label}`, body: order.data?.customer?.name ?? null, link: `/pedidos/${id}`, actor_id: session?.user.id, actor_name: profile?.name ?? null });
      if ((s === 'faturado' || s === 'entregue') && !order.data?.stock_posted) {
        toast('Baixar o estoque deste pedido agora?', { action: { label: 'Baixar estoque', onClick: () => post.mutate() }, duration: 12000 });
      }
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['demand'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteOrder(id),
    onSuccess: () => {
      toast.success('Pedido excluído.');
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate('/pedidos');
    },
  });

  if (order.isLoading) return <div className="grid place-items-center py-20"><Spinner /></div>;
  if (!order.data) return <p className="text-muted">Pedido não encontrado.</p>;
  const o = order.data;
  const unresolved = o.items.filter((i) => !i.product_code).length;
  const sales = o.items.length > 0 && o.items.every((i) => i.sale_unit);
  const custName = o.customer?.name ?? o.customer_name;

  return (
    <>
      <PageHeader
        title="Revisar pedido"
        description={<span>{o.order_number ? <b className="text-fg">Nº {o.order_number} · </b> : null}{o.customer && !isSeller ? <Link className="text-brand font-medium" to={`/clientes/${o.customer.id}`}>{o.customer.name}</Link> : custName ?? 'Sem cliente'} · {formatCnpj(o.customer?.cnpj ?? o.customer_cnpj)}{o.seller_name ? ` · vendedor ${o.seller_name}` : ''} · emitido em {fmtDate(o.order_date)}</span>}
        actions={
          <>
            <div className="flex w-full flex-nowrap items-center gap-1.5 sm:w-auto sm:gap-2">
              <Button size="sm" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Voltar</Button>
              {(!isSeller || o.status === 'aberto') && <Button size="sm" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/pedidos/${id}/editar`)}>Editar</Button>}
              <Button size="sm" variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>
              {/* Vendas parte 4: Novo pedido logo depois de Imprimir; Baixar estoque e Emitir NF-e saíram desta tela
                  (a baixa continua oferecida ao mudar o status para Faturado/Entregue; a NF-e é emitida em Notas fiscais). */}
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/pedidos/novo')}>Novo pedido</Button>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={o.status} />
              {/* Vendas parte 6: a tela do pedido é só consulta. O status muda na Produção (PCP) e em Rotas de entrega (faturamento).
                  O vendedor só cancela, e só enquanto nada saiu de Aberto. */}
              {isSeller && o.status === 'aberto' && o.items.every((i) => (i.stage ?? 'aberto') === 'aberto') && (
                <Button size="sm" variant="outline" className="text-danger" onClick={() => confirm('Cancelar este pedido?') && status.mutate('cancelado')}>Cancelar pedido</Button>
              )}
            </div>
            {isAdmin && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Excluir este pedido?') && remove.mutate()} />}
          </>
        }
      />
      {/* Vendas parte 5: saíram os cartões Status, Valor, Quilos e Unidades (o status fica na linha dos botões; os valores, na tabela) */}
      <p className="mb-4 text-sm text-muted">Entrega: <b className="text-fg">{fmtDate(o.delivery_date)}</b>{o.payment_terms ? ` · pgto ${o.payment_terms} dias` : ''}{o.buyer ? ` · ${o.buyer}` : ''}</p>
      {o.allow_other_packaging != null && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${o.allow_other_packaging ? 'border-ok/30 bg-ok/5' : 'border-warn/30 bg-warn/5'}`}>
          <b>Se precisar, pode trocar a embalagem?</b> {o.allow_other_packaging ? 'SIM' : 'NÃO'}
        </div>
      )}
      {editors.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm"><span className="size-2 animate-pulse rounded-full bg-warn" /> {editors.map((e) => e.name).join(', ')} está editando este pedido agora.</div>
      )}
      {unresolved > 0 && (
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm flex items-center gap-3">
          <span className="flex-1">{unresolved} item(ns) deste pedido ainda não foram associados a um produto.</span>
          <Link to="/pedidos/conferencia"><Button size="sm" variant="outline">Conferir</Button></Link>
        </div>
      )}
      {sales && (
        <Card title="Itens do pedido" padded={false}>
          <Table className="[&>table]:min-w-0">
            <thead><tr><th className="th hidden sm:table-cell">Referência</th><th className="th">Código</th><th className="th">Produto</th><th className="th text-right">Quantidade</th><th className="th hidden sm:table-cell">Unidade de venda</th><th className="th hidden text-right sm:table-cell">Valor unitário</th><th className="th text-right">Valor total</th><th className="th">Etapa</th></tr></thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td className="td hidden text-xs sm:table-cell">{it.product_reference ?? '—'}</td>
                  <td className="td font-mono text-xs">{it.product_code}</td>
                  <td className="td">{it.product_name ?? it.raw_description}</td>
                  <td className="td text-right num">{Number(it.quantity ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}<span className="sm:hidden"> {it.sale_unit === 'kg' ? 'kg' : 'un'}</span></td>
                  <td className="td hidden sm:table-cell">{it.sale_unit === 'kg' ? 'kg' : 'unidade'}</td>
                  <td className="td hidden text-right num sm:table-cell">{fmtBRL(it.unit_price)}</td>
                  <td className="td text-right num font-semibold">{fmtBRL(it.total_price)}</td>
                  <td className="td"><StatusBadge status={(it.stage ?? 'aberto') as OrderStatus} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="ml-auto grid max-w-sm gap-1 p-5 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Subtotal dos itens</dt><dd className="num">{fmtBRL(o.subtotal_value ?? o.total_value)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Desconto financeiro{o.discount_pct ? ` (${String(o.discount_pct).replace('.', ',')}%)` : ''}</dt><dd className="num">− {fmtBRL(o.discount_value ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="num">{fmtBRL(o.total_value)}</dd></div>
          </dl>
          {o.notes && <p className="px-5 pb-5 text-sm text-muted">Observações: {o.notes}</p>}
        </Card>
      )}
      {!sales && <Card title="Itens" padded={false}>
        <Table>
          <thead>
            <tr>
              <th className="th">#</th>
              <th className="th">Cód. cliente</th>
              <th className="th">Descrição no pedido</th>
              <th className="th">Produto ISA</th>
              <th className="th">Embalagem</th>
              <th className="th text-right">Caixas</th>
              <th className="th text-right">Unidades</th>
              <th className="th text-right">Vlr. caixa</th>
              <th className="th text-right">Total</th>
              <th className="th">Correspondência</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((it) => (
              <tr key={it.id} className={!it.product_code ? 'bg-warn/5' : ''}>
                <td className="td text-muted">{it.seq}</td>
                <td className="td font-mono text-xs">{it.client_code}</td>
                <td className="td">{it.raw_description}</td>
                <td className="td">{it.product ? <span><b className="font-mono text-xs mr-1">{it.product.code}</b>{it.product.description}</span> : <span className="text-muted">—</span>}</td>
                <td className="td text-xs text-muted">{it.packaging}</td>
                <td className="td text-right num">{fmtInt(it.quantity_boxes)}</td>
                <td className="td text-right num font-semibold">{fmtInt(it.quantity_units)}</td>
                <td className="td text-right num text-muted">{it.unit_price !== null ? fmtDec(it.unit_price) : '—'}</td>
                <td className="td text-right num">{it.total_price !== null ? fmtBRL(it.total_price) : '—'}</td>
                <td className="td"><MatchBadge status={it.match_status} score={it.match_score} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>}
    </>
  );
}
