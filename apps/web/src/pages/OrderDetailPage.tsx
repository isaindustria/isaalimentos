import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Printer, Pencil, PackageMinus } from 'lucide-react';
import { deleteOrder, getOrder, postOrderStock, setOrderStatus } from '@/api/orders';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, PageHeader, Select, Spinner, Table } from '@/components/ui';
import { fmtBRL, fmtDate, fmtDec, fmtInt, formatCnpj } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL } from './OrdersPage';
import { MatchBadge } from './OrderImportPage';
import { useAuth } from '@/hooks/useAuth';

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, session, profile } = useAuth();
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

  return (
    <>
      <PageHeader
        eyebrow="Pedido"
        title={`Pedido #${o.order_number ?? '—'}`}
        description={<span>{o.customer ? <Link className="text-brand font-medium" to={`/clientes/${o.customer.id}`}>{o.customer.name}</Link> : 'Sem cliente'} · {formatCnpj(o.customer?.cnpj)} · emitido em {fmtDate(o.order_date)}</span>}
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Voltar</Button>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/pedidos/${id}/editar`)}>Editar</Button>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>
            {!o.stock_posted && <Button variant="outline" icon={<PackageMinus className="h-4 w-4" />} loading={post.isPending} onClick={() => confirm('Baixar do estoque (local 1) todas as unidades deste pedido?') && post.mutate()}>Baixar estoque</Button>}
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
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Caixas</div><div className="font-display text-xl font-bold num">{fmtInt(boxes)}</div></div>
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Unidades</div><div className="font-display text-xl font-bold num">{fmtInt(units)}</div></div>
        <div className="card p-4"><div className="text-xs text-muted uppercase font-semibold">Entrega</div><div className="font-display text-xl font-bold">{fmtDate(o.delivery_date)}</div><div className="text-xs text-muted">{o.payment_terms ? `pgto ${o.payment_terms} dias` : ''} {o.buyer ? `· ${o.buyer}` : ''}</div></div>
      </div>
      {unresolved > 0 && (
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm flex items-center gap-3">
          <span className="flex-1">{unresolved} item(ns) deste pedido ainda não foram associados a um produto.</span>
          <Link to="/pedidos/conferencia"><Button size="sm" variant="outline">Conferir</Button></Link>
        </div>
      )}
      <Card title="Itens" padded={false}>
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
      </Card>
    </>
  );
}
