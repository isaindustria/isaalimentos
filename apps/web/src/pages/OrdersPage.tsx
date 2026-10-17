import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertTriangle, Filter, Plus, PlayCircle } from 'lucide-react';
import { listOrders, listPendingItems, type OrderFilters } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import type { Order, OrderStatus } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { SalesCards } from '@/components/SalesCards';
import { useColunas, CabecalhoColunas } from '@/components/Colunas';

export const STATUS_LABEL: Record<OrderStatus, { label: string; tone: 'info' | 'brand' | 'ok' | 'neutral' | 'danger' | 'warn' }> = {
  aberto: { label: 'Aberto', tone: 'danger' },
  em_producao: { label: 'Em produção', tone: 'warn' },
  faturado: { label: 'Faturamento', tone: 'ok' },
  entregue: { label: 'Entregue', tone: 'info' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

/** Vendas parte 6: vermelho = aberto, amarelo = produção, verde = faturado, azul = entregue, rosa com letra vermelha = cancelado. */
export const STATUS_COLOR: Record<OrderStatus, string> = {
  aberto: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  em_producao: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/20 dark:text-yellow-200',
  faturado: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  entregue: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  cancelado: 'bg-pink-100 text-red-600 dark:bg-pink-500/20 dark:text-red-300',
};
export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge className={STATUS_COLOR[status]} dot>{STATUS_LABEL[status].label}</Badge>;
}
/** linha de pedido cancelado: fundo rosa e toda a escrita em vermelho */
export const CANCELADO_ROW = 'bg-pink-50 text-red-600 dark:bg-pink-500/10 dark:text-red-300 [&_*]:!text-red-600 dark:[&_*]:!text-red-300';

export default function OrdersPage() {
  const navigate = useNavigate();
  const { isSeller, canWriteArea } = useAuth();
  const [filters, setFilters] = useState<OrderFilters>({ status: 'todos' });

  const orders = useQuery({ queryKey: ['orders', filters], queryFn: () => listOrders(filters) });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });
  const canNew = canWriteArea('compras') || isSeller;

  // solicitação #18: o ADM arrasta as colunas para mudar a ordem (vale para todos)
  const colunas = useColunas<Order>('pedidos', [
    { key: 'pedido', label: 'Pedido', fixa: true, td: 'font-semibold', cell: (o) => <>#{o.order_number ?? '—'}<div className="text-[11px] font-normal text-muted">{o.import_id ? 'PDF' : 'manual'}<span className="sm:hidden"> · {fmtDate(o.order_date)}</span></div></> },
    { key: 'cliente', label: 'Cliente', fixa: true, cell: (o) => <><div className="font-medium">{o.customer?.name ?? o.customer_name ?? '—'}</div><div className="text-xs text-muted">{[o.customer?.city, o.customer?.state].filter(Boolean).join(' - ')}</div></> },
    { key: 'data', label: 'Data', th: 'hidden sm:table-cell', td: 'hidden text-muted sm:table-cell', cell: (o) => fmtDate(o.order_date) },
    { key: 'entrega', label: 'Entrega', th: 'hidden sm:table-cell', td: 'hidden text-muted sm:table-cell', cell: (o) => fmtDate(o.delivery_date) },
    { key: 'valor', label: 'Valor', th: 'text-right', td: 'text-right num font-semibold', cell: (o) => <>{fmtBRL(o.total_value)}<div className="mt-1 sm:hidden"><StatusBadge status={o.status} /></div></> },
    { key: 'status', label: 'Status', th: 'hidden sm:table-cell', td: 'hidden sm:table-cell', cell: (o) => <StatusBadge status={o.status} /> },
    { key: 'vendedor', label: 'Vendedor', th: 'hidden sm:table-cell', td: 'hidden text-muted sm:table-cell', cell: (o) => o.seller_name ?? '—' },
  ]);
  const totalValue = (orders.data ?? []).reduce((s, o) => s + Number(o.total_value), 0);

  return (
    <>
      <PageHeader title="Pedidos" description="Pedidos das lojas e dos vendedores, importados do PDF ou lançados manualmente: todos ficam na mesma lista." />
      {/* Vendas parte 4/5: Como usar, Novo pedido e Importar PDF na mesma linha, no alto da tela */}
      <div className="-mt-3 mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <Link to="/tutoriais" className="shrink-0"><Button size="sm" variant="ghost" icon={<PlayCircle className="h-4 w-4" />}>Como usar</Button></Link>
        {canNew && <Link to="/pedidos/novo" className="shrink-0"><Button size="sm" icon={<Plus className="h-4 w-4" />}>Novo pedido</Button></Link>}
        {canWriteArea('compras') && <Link to="/pedidos/importar" className="shrink-0"><Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />}>Importar PDF</Button></Link>}
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

      {colunas.botao && <div className="mb-2 flex justify-end">{colunas.botao}</div>}
      <Card padded={false}>
        {orders.data?.length ? (
          <Table className="[&>table]:min-w-0">
            <thead><CabecalhoColunas cols={colunas.visiveis} thProps={colunas.thProps} /></thead>
            <tbody>
              {orders.data.map((o) => (
                <tr key={o.id} className={`cursor-pointer ${o.status === 'cancelado' ? CANCELADO_ROW : 'hover:bg-surface-2/60'}`} onClick={() => navigate(`/pedidos/${o.id}`)}>
                  {colunas.visiveis.map((c) => <td key={c.key} className={`td ${c.td ?? ''}`}>{c.cell(o)}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2/50">
                <td className="td font-semibold" colSpan={Math.max(1, colunas.visiveis.length - 1)}>{fmtInt(orders.data.length)} pedido(s)<span className="hidden sm:inline"> · {fmtInt(orders.data.filter((o) => o.import_id).length)} do PDF · {fmtInt(orders.data.filter((o) => !o.import_id).length)} manuais</span> · total <b className="num">{fmtBRL(totalValue)}</b></td>
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
