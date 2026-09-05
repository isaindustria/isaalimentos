import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Boxes, ClipboardList, Factory, AlertTriangle, ArrowRight, Upload, FileText, Users, TrendingUp, Wallet, Truck, FlaskConical, Database, Target } from 'lucide-react';
import { getCurrentStock, listStockImports } from '@/api/stock';
import { demand, listOrders, listPendingItems } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { listRuns } from '@/api/production';
import { dbStats, FREE_PLAN_DB_BYTES, getModules, listRoutes, listSupplies } from '@/api/v14';
import { computeProduction, summarize } from '@/domain/production';
import { Badge, Button, Card, PageHeader, ProgressBar, Skeleton, Table } from '@/components/primitives';
import { ActivityList } from '@/components/Notifications';
import { cn, fmtAgo, fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';
const TONES: Record<Tone, string> = { neutral: 'bg-surface-2 text-muted', brand: 'bg-brand-soft text-brand', ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', danger: 'bg-danger/10 text-danger', info: 'bg-info/10 text-info' };

function Kpi({ label, value, sub, icon, tone = 'neutral', delta, to }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: Tone; delta?: number | null; to?: string }) {
  const body = (
    <div className="card flex min-w-0 items-start gap-4 p-5 transition hover:shadow-pop">
      <div className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TONES[tone])}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className={cn('font-display num mt-1 truncate font-bold tracking-tight', typeof value === 'string' && value.length > 11 ? 'text-xl' : 'text-2xl')}>{value}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {delta != null && Number.isFinite(delta) && <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', delta >= 0 ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger')}>{delta >= 0 ? '+' : ''}{Math.round(delta * 100)}% vs 30 d antes</span>}
          {sub}
        </div>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const imports = useQuery({ queryKey: ['stock-imports'], queryFn: () => listStockImports(1) });
  const allOrders = useQuery({ queryKey: ['orders', { status: 'todos', dash: true }], queryFn: () => listOrders({ status: 'todos' }) });
  const dem = useQuery({ queryKey: ['demand', 'open'], queryFn: () => demand({ statuses: ['aberto', 'em_producao'] }) });
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => listRuns(50) });
  const routes = useQuery({ queryKey: ['routes'], queryFn: listRoutes });
  const supplies = useQuery({ queryKey: ['supplies'], queryFn: listSupplies });
  const modules = useQuery({ queryKey: ['modules'], queryFn: getModules });
  const db = useQuery({ queryKey: ['db-stats'], queryFn: dbStats, staleTime: 5 * 60_000 });

  const rows = useMemo(() => (stock.data && dem.data ? computeProduction(stock.data, dem.data.rows, { includeMinStock: true }) : []), [stock.data, dem.data]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const top = rows.filter((r) => r.need > 0).slice(0, 7);
  const lowStock = (stock.data ?? []).filter((s) => s.total <= s.min_stock && s.min_stock > 0);
  const lastImport = imports.data?.[0];

  const orders = allOrders.data ?? [];
  const open = orders.filter((o) => o.status === 'aberto');
  const now = Date.now();
  const d30 = new Date(now - 30 * 864e5).toISOString().slice(0, 10);
  const d60 = new Date(now - 60 * 864e5).toISOString().slice(0, 10);
  const valid = orders.filter((o) => o.status !== 'cancelado' && o.order_date);
  const last30 = valid.filter((o) => o.order_date! >= d30);
  const prev30 = valid.filter((o) => o.order_date! >= d60 && o.order_date! < d30);
  const rev30 = last30.reduce((s, o) => s + Number(o.total_value), 0);
  const revPrev = prev30.reduce((s, o) => s + Number(o.total_value), 0);
  const delta = revPrev ? (rev30 - revPrev) / revPrev : null;
  const ticket = last30.length ? rev30 / last30.length : 0;
  const served = valid.filter((o) => ['faturado', 'entregue'].includes(o.status)).length;
  const serviceRate = valid.length ? served / valid.length : 0;
  const activeCustomers30 = new Set(last30.map((o) => o.customer_id)).size;

  const topCustomers = useMemo(() => {
    const m = new Map<string, { name: string; value: number; n: number }>();
    for (const o of last30) { const k = o.customer?.name ?? 'Sem cliente'; const c = m.get(k) ?? { name: k, value: 0, n: 0 }; c.value += Number(o.total_value); c.n += 1; m.set(k, c); }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  }, [last30]);
  const inProgress = (runs.data ?? []).filter((r) => r.status === 'em_andamento');
  const routesOpen = (routes.data ?? []).filter((r) => r.status !== 'concluida');
  const lowSupplies = (supplies.data ?? []).filter((s) => Number(s.stock) <= Number(s.min_stock) && Number(s.min_stock) > 0);
  const dbPct = db.data ? Math.min(100, (db.data.db_bytes / FREE_PLAN_DB_BYTES) * 100) : 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const skel = <Skeleton className="h-7 w-16" />;

  return (
    <>
      <PageHeader
        eyebrow={fmtDate(new Date(), "EEEE, d 'de' MMMM")}
        title={`${greeting}, ${profile?.name?.split(' ')[0] ?? ''}`}
        description="Indicadores do dia: pedidos, faturamento, produção, estoque e equipe."
        actions={<><Link to="/estoque"><Button variant="outline" icon={<Upload className="size-4" />}>Importar estoque</Button></Link><Link to="/pedidos/importar"><Button icon={<FileText className="size-4" />}>Importar pedidos</Button></Link></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Faturamento 30 dias" value={allOrders.data ? fmtBRL(rev30) : skel} delta={delta} sub={`${last30.length} pedido(s) · ticket ${fmtBRL(ticket)}`} tone="ok" icon={<Wallet className="size-5" />} to="/relatorios" />
        <Kpi label="Pedidos abertos" value={allOrders.data ? fmtInt(open.length) : skel} sub={fmtBRL(open.reduce((s, o) => s + Number(o.total_value), 0))} tone="info" icon={<ClipboardList className="size-5" />} to="/pedidos" />
        <Kpi label="A produzir (JIT)" value={dem.data && stock.data ? fmtInt(summary.toProduce) : skel} sub={`${fmtInt(summary.totalNeedUnits)} un · ${fmtInt(summary.totalNeedBoxes)} caixas`} tone="brand" icon={<Factory className="size-5" />} to="/producao" />
        <Kpi label="Itens para conferir" value={pending.data ? fmtInt(pending.data.length) : skel} sub={pending.data?.length ? 'descrições não reconhecidas' : 'tudo reconhecido'} tone={pending.data?.length ? 'warn' : 'neutral'} icon={<AlertTriangle className="size-5" />} to="/pedidos/conferencia" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Estoque (locais 1+5)" value={stock.data ? fmtInt(summary.totalStockUnits) : skel} sub={lastImport ? `atualizado ${fmtAgo(lastImport.imported_at)}` : 'sem importação'} tone="ok" icon={<Boxes className="size-5" />} to="/estoque" />
        <Kpi label="Abaixo do mínimo" value={stock.data ? fmtInt(lowStock.length) : skel} sub={lowSupplies.length ? `+ ${lowSupplies.length} insumo(s)` : 'produtos'} tone={lowStock.length ? 'danger' : 'neutral'} icon={<Target className="size-5" />} to="/estoque" />
        <Kpi label="Taxa de atendimento" value={allOrders.data ? `${Math.round(serviceRate * 100)}%` : skel} sub={`${served} de ${valid.length} faturados ou entregues`} tone="info" icon={<TrendingUp className="size-5" />} to="/relatorios" />
        <Kpi label="Clientes ativos (30 d)" value={allOrders.data ? fmtInt(activeCustomers30) : skel} sub={`${customers.data?.length ?? 0} cadastrados`} tone="brand" icon={<Users className="size-5" />} to="/clientes" />
      </div>

      <Card className="mt-4" title="Maiores necessidades de produção" padded={false} action={<Link to="/producao" className="inline-flex items-center gap-1 text-xs font-semibold text-brand">Ver cálculo <ArrowRight className="size-3" /></Link>}>
        {top.length ? (
          <Table dense>
            <thead><tr><th className="th">Produto</th><th className="th text-right">Pedido</th><th className="th text-right">Estoque</th><th className="th text-right">Produzir</th><th className="th text-right">Caixas</th></tr></thead>
            <tbody>{top.map((r, i) => <tr key={r.code} className={i === 0 ? 'bg-brand-soft/30' : ''}><td className="td font-medium">{r.description}</td><td className="td num text-right text-muted">{fmtInt(r.ordered)}</td><td className="td num text-right text-muted">{fmtInt(r.stock)}</td><td className="td num text-right font-bold text-brand">{fmtInt(r.need)}</td><td className="td num text-right">{fmtInt(Math.ceil(r.need / (r.units_per_box || 48)))}</td></tr>)}</tbody>
          </Table>
        ) : <p className="py-10 text-center text-sm text-muted">Estoque cobre todos os pedidos abertos.</p>}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Top clientes (30 dias)" padded={false}>
          {topCustomers.length ? (
            <Table><thead><tr><th className="th">Cliente</th><th className="th text-right">Pedidos</th><th className="th text-right">Valor</th></tr></thead>
              <tbody>{topCustomers.map((c) => <tr key={c.name}><td className="td max-w-[200px] truncate">{c.name}</td><td className="td num text-right">{c.n}</td><td className="td num text-right font-semibold">{fmtBRL(c.value)}</td></tr>)}</tbody></Table>
          ) : <p className="py-8 text-center text-sm text-muted">Sem pedidos nos últimos 30 dias.</p>}
        </Card>
        <Card title="Operação agora">
          <div className="flex flex-col gap-3 text-sm">
            <Link to="/producao" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand/40"><Factory className="size-4 text-brand" /><span className="flex-1">Ordens em andamento</span><Badge tone={inProgress.length ? 'brand' : 'neutral'}>{inProgress.length}</Badge></Link>
            {modules.data?.rotas !== false && <Link to="/rotas" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand/40"><Truck className="size-4 text-brand-green" /><span className="flex-1">Rotas planejadas ou em rota</span><Badge tone={routesOpen.length ? 'info' : 'neutral'}>{routesOpen.length}</Badge></Link>}
            {modules.data?.compras !== false && <Link to="/insumos" className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand/40"><FlaskConical className="size-4 text-warn" /><span className="flex-1">Insumos abaixo do mínimo</span><Badge tone={lowSupplies.length ? 'warn' : 'neutral'}>{lowSupplies.length}</Badge></Link>}
            <Link to="/configuracoes" className="rounded-xl border border-line p-3 hover:border-brand/40">
              <div className="mb-2 flex items-center gap-3"><Database className="size-4 text-muted" /><span className="flex-1">Banco de dados</span><span className="num text-xs text-muted">{db.data ? `${(db.data.db_bytes / 1048576).toFixed(1)} MB / 500 MB` : '…'}</span></div>
              <ProgressBar value={dbPct} tone={dbPct > 85 ? 'danger' : dbPct > 60 ? 'warn' : 'ok'} />
            </Link>
          </div>
        </Card>
        <Card title="Atividades da equipe" action={<Badge tone="brand" dot>ao vivo</Badge>}>
          <ActivityList limit={6} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Últimos pedidos" padded={false} action={<Link to="/pedidos" className="text-xs font-semibold text-brand">Ver todos</Link>}>
          <Table><thead><tr><th className="th">Pedido</th><th className="th">Cliente</th><th className="th">Data</th><th className="th text-right">Valor</th></tr></thead>
            <tbody>
              {orders.slice(0, 6).map((o) => <tr key={o.id} className="hover:bg-surface-2/60"><td className="td font-semibold"><Link to={`/pedidos/${o.id}`} className="hover:text-brand">#{o.order_number}</Link></td><td className="td max-w-[220px] truncate">{o.customer?.name ?? '—'}</td><td className="td text-muted">{fmtDate(o.order_date)}</td><td className="td num text-right">{fmtBRL(o.total_value)}</td></tr>)}
              {allOrders.data && !orders.length && <tr><td className="td py-8 text-center text-muted" colSpan={4}>Nenhum pedido.</td></tr>}
            </tbody></Table>
        </Card>
        <Card title="Estoque abaixo do mínimo" padded={false} action={<Badge tone={lowStock.length ? 'danger' : 'ok'}>{lowStock.length} produto(s)</Badge>}>
          <Table><thead><tr><th className="th">Produto</th><th className="th text-right">Estoque</th><th className="th text-right">Mínimo</th></tr></thead>
            <tbody>
              {lowStock.slice(0, 6).map((s) => <tr key={s.code}><td className="td">{s.description}</td><td className="td num text-right font-semibold text-danger">{fmtInt(s.total)}</td><td className="td num text-right text-muted">{fmtInt(s.min_stock)}</td></tr>)}
              {!lowStock.length && <tr><td className="td py-8 text-center text-muted" colSpan={3}>Nenhum produto abaixo do mínimo. Defina mínimos em Produtos ou em Relatórios → Curva ABC.</td></tr>}
            </tbody></Table>
        </Card>
      </div>
    </>
  );
}
