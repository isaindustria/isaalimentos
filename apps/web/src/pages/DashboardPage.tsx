import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { Boxes, ClipboardList, Factory, AlertTriangle, ArrowRight, Upload, FileText, Users } from 'lucide-react';
import { getCurrentStock, listStockImports } from '@/api/stock';
import { demand, listOrders, listPendingItems } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { computeProduction, summarize } from '@/domain/production';
import { Badge, Button, Card, PageHeader, Skeleton, Stat, Table } from '@/components/primitives';
import { fmtAgo, fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { ActivityList } from '@/components/Notifications';

export default function DashboardPage() {
  const { profile } = useAuth();
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const imports = useQuery({ queryKey: ['stock-imports'], queryFn: () => listStockImports(1) });
  const orders = useQuery({ queryKey: ['orders', { status: 'aberto' }], queryFn: () => listOrders({ status: 'aberto' }) });
  const dem = useQuery({ queryKey: ['demand', 'open'], queryFn: () => demand({ statuses: ['aberto', 'em_producao'] }) });
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });

  const rows = useMemo(() => (stock.data && dem.data ? computeProduction(stock.data, dem.data.rows) : []), [stock.data, dem.data]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const top = rows.filter((r) => r.need > 0).slice(0, 8);
  const lowStock = (stock.data ?? []).filter((s) => s.total <= s.min_stock && s.min_stock > 0);
  const lastImport = imports.data?.[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <>
      <PageHeader
        eyebrow={fmtDate(new Date(), "EEEE, d 'de' MMMM")}
        title={`${greeting}, ${profile?.name?.split(' ')[0] ?? ''}`}
        description="Visão geral de pedidos abertos, estoque atual e necessidade de produção."
        actions={
          <>
            <Link to="/estoque">
              <Button variant="outline" icon={<Upload className="h-4 w-4" />}>Importar estoque</Button>
            </Link>
            <Link to="/pedidos/importar">
              <Button icon={<FileText className="h-4 w-4" />}>Importar pedidos</Button>
            </Link>
          </>
        }
      />

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Pedidos abertos" value={orders.data ? fmtInt(orders.data.length) : <Skeleton className="h-7 w-16" />} sub={orders.data ? fmtBRL(orders.data.reduce((s, o) => s + Number(o.total_value), 0) ) : undefined} tone="info" icon={<ClipboardList className="h-5 w-5" />} />
        <Stat label="Produtos a produzir" value={dem.data && stock.data ? fmtInt(summary.toProduce) : <Skeleton className="h-7 w-16" />} sub={`${fmtInt(summary.totalNeedUnits)} unidades · ${fmtInt(summary.totalNeedBoxes)} caixas`} tone="brand" icon={<Factory className="h-5 w-5" />} />
        <Stat label="Estoque (locais 1+5)" value={stock.data ? fmtInt(summary.totalStockUnits) : <Skeleton className="h-7 w-16" />} sub={lastImport ? `importado ${fmtAgo(lastImport.imported_at)}` : 'nenhuma importação'} tone="ok" icon={<Boxes className="h-5 w-5" />} />
        <Stat label="Itens para conferir" value={pending.data ? fmtInt(pending.data.length) : <Skeleton className="h-7 w-16" />} sub={pending.data?.length ? 'descrições não reconhecidas' : 'tudo reconhecido'} tone={pending.data?.length ? 'warn' : 'neutral'} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4 mt-4">
        <Card
          title="Maiores necessidades de produção"
          action={
            <Link to="/producao" className="text-xs font-semibold text-brand inline-flex items-center gap-1">
              Ver cálculo completo <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {top.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top.map((r) => ({ name: r.description.split(' - ')[0], need: r.need }))} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: 'rgb(var(--muted))' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgb(var(--surface-2))' }} contentStyle={{ borderRadius: 12, border: '1px solid rgb(var(--line))', background: 'rgb(var(--surface))', color: 'rgb(var(--ink))', fontSize: 12 }} formatter={(v) => [fmtInt(v as number), 'unidades']} />
                  <Bar dataKey="need" radius={[0, 8, 8, 0]}>
                    {top.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? 'rgb(var(--brand))' : 'rgb(var(--brand) / 0.55)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted py-8 text-center">Nenhuma necessidade de produção com os pedidos abertos.</p>
          )}
        </Card>

        <Card title="Atalhos">
          <div className="grid gap-2">
            {[
              { to: '/pedidos/importar', icon: FileText, label: 'Importar pedidos em PDF', hint: 'Lê todas as lojas de uma vez' },
              { to: '/estoque', icon: Upload, label: 'Atualizar estoque (XLSX)', hint: 'Substitui o estoque anterior' },
              { to: '/pedidos/conferencia', icon: AlertTriangle, label: 'Conferir itens pendentes', hint: `${pending.data?.length ?? 0} aguardando` },
              { to: '/producao', icon: Factory, label: 'Gerar ordem de produção', hint: 'Pedidos − estoque' },
              { to: '/clientes', icon: Users, label: 'Clientes', hint: `${customers.data?.length ?? 0} cadastrados` },
            ].map((s) => (
              <Link key={s.to} to={s.to} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand/40 hover:bg-brand-soft/30 transition">
                <div className="h-9 w-9 rounded-lg bg-surface-2 grid place-items-center text-brand">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-xs text-muted">{s.hint}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <Card title="Atividades da equipe" action={<Badge tone="brand" dot>ao vivo</Badge>}>
          <ActivityList limit={7} />
        </Card>
        <Card title="Últimos pedidos" padded={false} action={<Link to="/pedidos" className="text-xs font-semibold text-brand">Ver todos</Link>}>
          <Table>
            <thead>
              <tr>
                <th className="th">Pedido</th>
                <th className="th">Cliente</th>
                <th className="th">Data</th>
                <th className="th text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {(orders.data ?? []).slice(0, 6).map((o) => (
                <tr key={o.id} className="hover:bg-surface-2/60">
                  <td className="td font-semibold">
                    <Link to={`/pedidos/${o.id}`} className="hover:text-brand">#{o.order_number}</Link>
                  </td>
                  <td className="td truncate max-w-[220px]">{o.customer?.name ?? '—'}</td>
                  <td className="td text-muted">{fmtDate(o.order_date)}</td>
                  <td className="td text-right num">{fmtBRL(o.total_value)}</td>
                </tr>
              ))}
              {orders.data && !orders.data.length && (
                <tr>
                  <td className="td text-center text-muted py-8" colSpan={4}>Nenhum pedido aberto.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card title="Estoque abaixo do mínimo" padded={false} action={<Badge tone={lowStock.length ? 'danger' : 'ok'}>{lowStock.length} produto(s)</Badge>}>
          <Table>
            <thead>
              <tr>
                <th className="th">Produto</th>
                <th className="th text-right">Estoque</th>
                <th className="th text-right">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.slice(0, 6).map((s) => (
                <tr key={s.code}>
                  <td className="td">{s.description}</td>
                  <td className="td text-right num text-danger font-semibold">{fmtInt(s.total)}</td>
                  <td className="td text-right num text-muted">{fmtInt(s.min_stock)}</td>
                </tr>
              ))}
              {!lowStock.length && (
                <tr>
                  <td className="td text-center text-muted py-8" colSpan={3}>Nenhum produto abaixo do mínimo. Defina mínimos em Produtos.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
