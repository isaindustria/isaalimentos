import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertTriangle, Filter, Plus, PlayCircle } from 'lucide-react';
import { listOrders, listPendingItems, type OrderFilters } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { SalesCards } from '@/components/SalesCards';

export const STATUS_LABEL: Record<OrderStatus, { label: string; tone: 'info' | 'brand' | 'ok' | 'neutral' | 'danger' }> = {
  aberto: { label: 'Aberto', tone: 'info' },
  em_producao: { label: 'Em produção', tone: 'brand' },
  faturado: { label: 'Faturado', tone: 'ok' },
  entregue: { label: 'Entregue', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

export default function OrdersPage() {
  const navigate = useNavigate();
  const { isSeller, canWriteArea } = useAuth();
  const [filters, setFilters] = useState<OrderFilters>({ status: 'todos' });

  const orders = useQuery({ queryKey: ['orders', filters], queryFn: () => listOrders(filters) });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });
  const canNew = canWriteArea('compras') || isSeller;

  const totalValue = (orders.data ?? []).reduce((s, o) => s + Number(o.total_value), 0);

  return (
    <>
      <PageHeader title="Pedidos" description="Pedidos das lojas e dos vendedores, importados do PDF ou lançados manualmente: todos ficam na mesma lista." />
      {/* Vendas parte 4: Como usar, Importar PDF e Novo pedido na mesma linha, no alto da tela */}
      <div className="-mt-3 mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <Link to="/tutoriais" className="shrink-0"><Button size="sm" variant="ghost" icon={<PlayCircle className="h-4 w-4" />}>Como usar</Button></Link>
        {canWriteArea('compras') && <Link to="/pedidos/importar" className="shrink-0"><Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />}>Importar PDF</Button></Link>}
        {canNew && <Link to="/pedidos/novo" className="shrink-0"><Button size="sm" icon={<Plus className="h-4 w-4" />}>Novo pedido</Button></Link>}
        {!!pending.data?.length && !isSeller && (
          <Link to="/pedidos/conferencia" className="ml-auto shrink-0"><Button size="sm" variant="outline" icon={<AlertTriangle className="h-4 w-4 text-warn" />}>Conferir {pending.data.length} item(ns)</Button></Link>
        )}
      </div>
      <SalesCards />

      <div className="mb-4 space-y-2 lg:flex lg:items-center lg:gap-2 lg:space-y-0">
        <div className="flex items-center gap-2 lg:flex-1">
          <Filter className="h-4 w-4 shrink-0 text-muted" />
          <Select aria-label="Status" className="min-w-0 flex-1 sm:max-w-48" value={filters.status ?? 'todos'} onChange={(e) => setFilters({ ...filters, status: e.target.value as OrderStatus | 'todos' })}>
            <option value="todos">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select aria-label="Cliente" className="min-w-0 flex-1 sm:max-w-72" value={filters.customerId ?? ''} onChange={(e) => setFilters({ ...filters, customerId: e.target.value || undefined })}>
            <option value="">Todos os clientes</option>
            {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2 pl-6 text-xs text-muted lg:pl-0">
          <span>De</span><Input aria-label="De" type="date" className="h-9 min-w-0 flex-1 sm:max-w-40" value={filters.from ?? ''} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} />
          <span>até</span><Input aria-label="Até" type="date" className="h-9 min-w-0 flex-1 sm:max-w-40" value={filters.to ?? ''} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} />
        </div>
      </div>

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
                  <td className="td font-semibold">#{o.order_number ?? '—'}<div className="text-[11px] font-normal text-muted">{o.import_id ? 'PDF' : 'manual'}</div></td>
                  <td className="td">
                    <div className="font-medium">{o.customer?.name ?? o.customer_name ?? '—'}</div>
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
                <td className="td font-semibold" colSpan={4}>{fmtInt(orders.data.length)} pedido(s) · {fmtInt(orders.data.filter((o) => o.import_id).length)} do PDF · {fmtInt(orders.data.filter((o) => !o.import_id).length)} manuais</td>
                <td className="td text-right num font-bold">{fmtBRL(totalValue)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          </Table>
        ) : (
          <EmptyState title="Nenhum pedido" description="Lance um pedido em Novo pedido ou importe o PDF das lojas." action={canNew ? <Link to="/pedidos/novo"><Button icon={<Plus className="h-4 w-4" />}>Novo pedido</Button></Link> : undefined} />
        )}
      </Card>
    </>
  );
}
