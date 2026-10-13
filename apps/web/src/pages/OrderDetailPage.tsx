import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Printer, Pencil, PackageMinus } from 'lucide-react';
import { deleteOrder, getOrder, postOrderStock, setOrderStatus } from '@/api/orders';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, PageHeader, Select, Spinner, Table } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtDec, fmtInt, formatCnpj } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL } from './OrdersPage';
import { MatchBadge } from './OrderImportPage';
import { useAuth } from '@/hooks/useAuth';
import { useRealtime } from '@/hooks/useRealtime';
import { EmitirNfeButton } from '@/components/EmitirNfeButton';

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
  const boxes = o.items.reduce((s, i) => s + Number(i.quantity_boxes), 0);
  const units = o.items.reduce((s, i) => s + Number(i.quantity_units), 0);
  const unresolved = o.items.filter((i) => !i.product_code).length;
  const sales = o.items.length > 0 && o.items.every((i) => i.sale_unit);
  const kg = o.items.filter((i) => i.sale_unit === 'kg').reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const custName = o.customer?.name ?? o.customer_name;

  return (
    <>
      <PageHeader
        eyebrow="Pedido"
        title={`Pedido #${o.order_number ?? '—'}`}
        description={<span>{o.customer && !isSeller ? <Link className="text-brand font-medium" to={`/clientes/${o.customer.id}`}>{o.customer.name}</Link> : custName ?? 'Sem cliente'} · {formatCnpj(o.customer?.cnpj ?? o.customer_cnpj)}{o.seller_name ? ` · vendedor ${o.seller_name}` : ''} · emitido em {fmtDate(o.order_date)}</span>}
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Voltar</Button>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/pedidos/${id}/editar`)}>Editar</Button>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>
            {!isSeller && <EmitirNfeButton orderId={o.id} />}
            {!o.stock_posted && !isSeller && <Button variant="outline" icon={<PackageMinus className="h-4 w-4" />} loading={post.isPending} onClick={() => confirm('Baixar do estoque (local 1) todas as unidades deste pedido?') && post.mutate()}>Baixar estoque</Button>}
            <Select className="w-44" value={o.status} onChange={(e) => status.mutate(e.target.value as OrderStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            {isAdmin && <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => confirm('Excluir este pedido?') && remove.mutate()} />}
          </>
        }
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Status</div><div className="mt-1"><Badge tone={STATUS_LABEL[o.status].tone} dot>{STATUS_LABEL[o.status].label}</Badge></div></div>
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Valor</div><div className="font-display text-xl font-bold num">{fmtBRL(o.total_value)}</div></div>
        {sales ? (
          <>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Quilos</div><div className="font-display text-xl font-bold num">{kg.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Unidades</div><div className="font-display text-xl font-bold num">{fmtInt(units)}</div></div>
          </>
        ) : (
          <>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Caixas</div><div className="font-display text-xl font-bold num">{fmtInt(boxes)}</div></div>
            <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Unidades</div><div className="font-display text-xl font-bold num">{fmtInt(units)}</div></div>
          </>
        )}
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Entrega</div><div className="font-display text-xl font-bold">{fmtDate(o.delivery_date)}</div><div className="text-xs text-muted">{o.payment_terms ? `pgto ${o.payment_terms} dias` : ''} {o.buyer ? `· ${o.buyer}` : ''}</div></div>
      </div>
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
          <Table>
            <thead><tr><th className="th">Referência</th><th className="th">Código</th><th className="th">Produto</th><th className="th text-right">Quantidade</th><th className="th">Unidade de venda</th><th className="th text-right">Valor unitário</th><th className="th text-right">Valor total</th></tr></thead>
            <tbody>
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td className="td text-xs">{it.product_reference ?? '—'}</td>
                  <td className="td font-mono text-xs">{it.product_code}</td>
                  <td className="td">{it.product_name ?? it.raw_description}</td>
                  <td className="td text-right num">{Number(it.quantity ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                  <td className="td">{it.sale_unit === 'kg' ? 'kg' : 'unidade'}</td>
                  <td className="td text-right num">{fmtBRL(it.unit_price)}</td>
                  <td className="td text-right num font-semibold">{fmtBRL(it.total_price)}</td>
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
