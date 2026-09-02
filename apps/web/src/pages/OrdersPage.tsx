import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, AlertTriangle, Trash2, Filter, Plus } from 'lucide-react';
import { deleteOrderImport, listOrderImports, listOrders, listPendingItems, type OrderFilters } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table, Tabs } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtDateTime, fmtInt } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

export const STATUS_LABEL: Record<OrderStatus, { label: string; tone: 'info' | 'brand' | 'ok' | 'neutral' | 'danger' }> = {
  aberto: { label: 'Aberto', tone: 'info' },
  em_producao: { label: 'Em produção', tone: 'brand' },
  faturado: { label: 'Faturado', tone: 'ok' },
  entregue: { label: 'Entregue', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

export default function OrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<'pedidos' | 'importacoes'>('pedidos');
  const [filters, setFilters] = useState<OrderFilters>({ status: 'todos' });

  const orders = useQuery({ queryKey: ['orders', filters], queryFn: () => listOrders(filters) });
  const imports = useQuery({ queryKey: ['order-imports'], queryFn: () => listOrderImports() });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });

  const removeImport = useMutation({
    mutationFn: deleteOrderImport,
    onSuccess: () => {
      toast.success('Importação excluída.');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order-imports'] });
      qc.invalidateQueries({ queryKey: ['pending-items'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalValue = (orders.data ?? []).reduce((s, o) => s + Number(o.total_value), 0);

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Pedidos de compra das lojas, importados do PDF ou lançados manualmente."
        actions={
          <>
            {!!pending.data?.length && (
              <Link to="/pedidos/conferencia">
                <Button variant="outline" icon={<AlertTriangle className="h-4 w-4 text-warn" />}>Conferir {pending.data.length} item(ns)</Button>
              </Link>
            )}
            <Link to="/pedidos/importar">
              <Button variant="outline" icon={<FileText className="h-4 w-4" />}>Importar PDF</Button>
            </Link>
            <Link to="/pedidos/novo">
              <Button icon={<Plus className="h-4 w-4" />}>Novo pedido</Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'pedidos', label: 'Pedidos', count: orders.data?.length }, { value: 'importacoes', label: 'Importações', count: imports.data?.length }]} />
        {tab === 'pedidos' && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Filter className="h-4 w-4 text-muted" />
            <Select className="w-40" value={filters.status ?? 'todos'} onChange={(e) => setFilters({ ...filters, status: e.target.value as OrderStatus | 'todos' })}>
              <option value="todos">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            <Select className="w-56" value={filters.customerId ?? ''} onChange={(e) => setFilters({ ...filters, customerId: e.target.value || undefined })}>
              <option value="">Todos os clientes</option>
              {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Input type="date" className="w-40" value={filters.from ?? ''} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} />
            <Input type="date" className="w-40" value={filters.to ?? ''} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} />
          </div>
        )}
      </div>

      {tab === 'pedidos' ? (
        <Card padded={false}>
          {orders.data?.length ? (
            <Table>
              <thead>
                <tr>
                  <th className="th">Pedido</th>
                  <th className="th">Cliente</th>
                  <th className="th">Data</th>
                  <th className="th">Entrega</th>
                  <th className="th text-right">Valor</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => navigate(`/pedidos/${o.id}`)}>
                    <td className="td font-semibold">#{o.order_number ?? '—'}</td>
                    <td className="td">
                      <div className="font-medium">{o.customer?.name ?? '—'}</div>
                      <div className="text-xs text-muted">{[o.customer?.city, o.customer?.state].filter(Boolean).join(' - ')}</div>
                    </td>
                    <td className="td text-muted">{fmtDate(o.order_date)}</td>
                    <td className="td text-muted">{fmtDate(o.delivery_date)}</td>
                    <td className="td text-right num font-semibold">{fmtBRL(o.total_value)}</td>
                    <td className="td"><Badge tone={STATUS_LABEL[o.status].tone} dot>{STATUS_LABEL[o.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2/50">
                  <td className="td font-semibold" colSpan={4}>{fmtInt(orders.data.length)} pedido(s)</td>
                  <td className="td text-right num font-bold">{fmtBRL(totalValue)}</td>
                  <td className="td" />
                </tr>
              </tfoot>
            </Table>
          ) : (
            <EmptyState title="Nenhum pedido" description="Importe o PDF de pedidos de compra das lojas." action={<Link to="/pedidos/importar"><Button icon={<FileText className="h-4 w-4" />}>Importar PDF</Button></Link>} />
          )}
        </Card>
      ) : (
        <Card padded={false}>
          {imports.data?.length ? (
            <Table>
              <thead>
                <tr>
                  <th className="th">Data</th>
                  <th className="th">Arquivo</th>
                  <th className="th text-right">Pedidos</th>
                  <th className="th text-right">Itens</th>
                  <th className="th text-right">Pendentes</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {imports.data.map((i) => (
                  <tr key={i.id}>
                    <td className="td">{fmtDateTime(i.imported_at)}</td>
                    <td className="td text-muted">{i.file_name}</td>
                    <td className="td text-right num">{i.orders_count}</td>
                    <td className="td text-right num">{i.items_count}</td>
                    <td className="td text-right">{i.pending_count ? <Badge tone="warn">{i.pending_count}</Badge> : <Badge tone="ok">0</Badge>}</td>
                    <td className="td text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => { setFilters({ importId: i.id, status: 'todos' }); setTab('pedidos'); }}>Ver pedidos</Button>
                      {isAdmin && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => confirm('Excluir esta importação e todos os pedidos dela?') && removeImport.mutate(i.id)}>Excluir</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhuma importação" />
          )}
        </Card>
      )}
    </>
  );
}
