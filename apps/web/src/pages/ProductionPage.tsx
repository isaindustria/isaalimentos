import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Factory, Download, Save, Printer, AlertTriangle, History, Trash2 } from 'lucide-react';
import { getCurrentStock, listStockImports } from '@/api/stock';
import { demand, listOrderImports } from '@/api/orders';
import { deleteRun, listRuns, saveRun } from '@/api/production';
import { computeProduction, summarize, type ProductionRow } from '@/domain/production';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Stat, Table, Tabs } from '@/components/primitives';
import { downloadBlob, fmtDate, fmtDateTime, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

type Scope = 'abertos' | 'importacao' | 'periodo';
type View = 'todos' | 'produzir' | 'atende' | 'sem_pedido';

export default function ProductionPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { session, isAdmin } = useAuth();
  const [tab, setTab] = useState<'calculo' | 'ordens'>('calculo');
  const [scope, setScope] = useState<Scope>('abertos');
  const [importId, setImportId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState<View>('todos');
  const [unit, setUnit] = useState<'un' | 'cx'>('un');
  const [runName, setRunName] = useState('');
  const [jit, setJit] = useState(true);

  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const stockImports = useQuery({ queryKey: ['stock-imports'], queryFn: () => listStockImports(1) });
  const orderImports = useQuery({ queryKey: ['order-imports'], queryFn: () => listOrderImports() });
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => listRuns() });
  const filters = scope === 'importacao' ? { importId: importId || undefined } : scope === 'periodo' ? { from: from || undefined, to: to || undefined } : {};
  const dem = useQuery({ queryKey: ['demand', filters], queryFn: () => demand(filters), enabled: scope !== 'importacao' || !!importId });

  const rows = useMemo(() => (stock.data && dem.data ? computeProduction(stock.data, dem.data.rows, { includeMinStock: jit }) : []), [stock.data, dem.data, jit]);
  const summary = useMemo(() => summarize(rows), [rows]);
  const visible = rows.filter((r) => view === 'todos' || (view === 'produzir' ? r.need > 0 : view === 'atende' ? r.ordered > 0 && r.need === 0 : r.ordered === 0));
  const currentImport = stockImports.data?.[0];
  const show = (r: ProductionRow, v: number) => (unit === 'un' ? fmtInt(v) : fmtInt(Math.ceil(v / r.unitsPerBox)));

  const save = useMutation({
    mutationFn: () =>
      saveRun({
        name: runName.trim() || `Produção ${fmtDate(new Date(), 'dd/MM/yyyy HH:mm')}`,
        stockImportId: currentImport?.id ?? null,
        orderIds: dem.data?.orders.map((o) => o.id) ?? [],
        rows,
        userId: session?.user.id,
      }),
    onSuccess: (run) => {
      toast.success('Ordem de produção salva.');
      qc.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/producao/${run.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: deleteRun, onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }) });

  function exportXlsx() {
    const data = rows.map((r) => ({
      Código: r.code,
      Descrição: r.description,
      'Estoque Local 1': r.stock1,
      'Estoque Local 5': r.stock5,
      'Estoque Disponível': r.stockTotal,
      'Total Pedido (un)': r.ordered,
      'Total Pedido (cx)': r.orderedBoxes,
      'Necessidade Produção (un)': r.need,
      'Necessidade Produção (cx)': r.needBoxes,
      'Saldo Restante': r.remaining,
      Situação: r.status === 'produzir' || r.status === 'critico' ? 'PRODUZIR' : r.status === 'atende' ? 'ESTOQUE ATENDE' : 'SEM PEDIDO',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 8 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Necessidade de Produção');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `necessidade-producao-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title="Necessidade de produção"
        description="Total pedido por todas as lojas menos o estoque disponível (locais 1 + 5). Com 'repor estoque mínimo' ligado, a meta inclui o mínimo de cada produto."
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportXlsx} disabled={!rows.length}>Exportar Excel</Button>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'calculo', label: 'Cálculo' }, { value: 'ordens', label: 'Ordens salvas', count: runs.data?.length }]} />

      {tab === 'calculo' ? (
        <>
          <Card className="mt-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Pedidos considerados">
                <Select className="w-56" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                  <option value="abertos">Todos abertos / em produção</option>
                  <option value="importacao">Uma importação de PDF</option>
                  <option value="periodo">Por período</option>
                </Select>
              </Field>
              {scope === 'importacao' && (
                <Field label="Importação">
                  <Select className="w-full sm:w-72" value={importId} onChange={(e) => setImportId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {orderImports.data?.map((i) => <option key={i.id} value={i.id}>{fmtDateTime(i.imported_at)} · {i.file_name} ({i.orders_count} pedidos)</option>)}
                  </Select>
                </Field>
              )}
              {scope === 'periodo' && (
                <>
                  <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
                  <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
                </>
              )}
              <label className="flex items-center gap-2 text-sm h-10">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={jit} onChange={(e) => setJit(e.target.checked)} />
                Repor estoque mínimo (just in time)
              </label>
              <div className="flex-1" />
              <div className="text-xs text-muted text-right">
                <div>Estoque: {currentImport ? `${currentImport.file_name} · ${fmtDateTime(currentImport.imported_at)}` : 'nenhuma importação'}</div>
                <div>{dem.data?.orders.length ?? 0} pedido(s) considerados</div>
              </div>
            </div>
            {!!dem.data?.unresolved && (
              <div className="mt-3 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-warn" />
                <span className="flex-1">{dem.data.unresolved} linha(s) de pedido sem produto associado não entram no cálculo.</span>
                <Link to="/pedidos/conferencia"><Button size="sm" variant="outline">Conferir agora</Button></Link>
              </div>
            )}
          </Card>

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
            <Stat label="Produtos a produzir" value={fmtInt(summary.toProduce)} sub={`de ${summary.products} cadastrados`} tone="brand" icon={<Factory className="h-5 w-5" />} />
            <Stat label="Necessidade total" value={fmtInt(summary.totalNeedUnits)} sub={`${fmtInt(summary.totalNeedBoxes)} caixas`} tone="warn" />
            <Stat label="Total pedido" value={fmtInt(summary.totalOrderedUnits)} sub="unidades (todas as lojas)" tone="info" />
            <Stat label="Estoque disponível" value={fmtInt(summary.totalStockUnits)} sub="locais 1 + 5" tone="ok" />
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-4 mb-3">
            <Tabs value={view} onChange={setView} items={[{ value: 'todos', label: 'Todos', count: rows.length }, { value: 'produzir', label: 'Produzir', count: rows.filter((r) => r.need > 0).length }, { value: 'atende', label: 'Estoque atende', count: rows.filter((r) => r.ordered > 0 && r.need === 0).length }, { value: 'sem_pedido', label: 'Sem pedido', count: rows.filter((r) => r.ordered === 0).length }]} />
            <Tabs value={unit} onChange={setUnit} items={[{ value: 'un', label: 'Unidades' }, { value: 'cx', label: 'Caixas' }]} />
            <div className="flex-1" />
            <Input className="w-64" placeholder="Nome da ordem (opcional)" value={runName} onChange={(e) => setRunName(e.target.value)} />
            <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} loading={save.isPending} disabled={!rows.length || summary.totalOrderedUnits === 0}>Salvar ordem de produção</Button>
          </div>

          <Card padded={false}>
            {visible.length ? (
              <Table>
                <thead>
                  <tr>
                    <th className="th">Código</th>
                    <th className="th">Produto</th>
                    <th className="th text-right">Local 1</th>
                    <th className="th text-right">Local 5</th>
                    <th className="th text-right">Estoque disp.</th>
                    <th className="th text-right">Total pedido</th>
                    <th className="th text-right">Pedidos</th>
                    <th className="th text-right">Necessidade</th>
                    <th className="th text-right">Saldo restante</th>
                    <th className="th">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.code} className={r.need > 0 ? 'bg-brand-soft/20' : ''}>
                      <td className="td font-mono text-xs font-semibold">{r.code}</td>
                      <td className="td font-medium">{r.description}</td>
                      <td className="td text-right num text-muted">{show(r, r.stock1)}</td>
                      <td className="td text-right num text-muted">{show(r, r.stock5)}</td>
                      <td className="td text-right num">{show(r, r.stockTotal)}</td>
                      <td className="td text-right num font-semibold">{show(r, r.ordered)}</td>
                      <td className="td text-right num text-muted">{r.ordersCount || '—'}</td>
                      <td className={`td text-right num font-bold ${r.need > 0 ? 'text-brand' : 'text-muted'}`}>{r.need > 0 ? show(r, r.need) : '—'}</td>
                      <td className="td text-right num text-muted">{r.ordered > 0 && r.remaining > 0 ? show(r, r.remaining) : '—'}</td>
                      <td className="td">
                        {r.status === 'critico' ? <Badge tone="danger" dot>Produzir · sem estoque</Badge> : r.status === 'produzir' ? <Badge tone="brand" dot>Produzir</Badge> : r.status === 'atende' ? <Badge tone="ok" dot>Estoque atende</Badge> : <Badge>Sem pedido</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState icon={<Factory className="h-5 w-5" />} title="Nada para calcular" description="Importe o estoque e os pedidos para ver a necessidade de produção." />
            )}
          </Card>
        </>
      ) : (
        <Card padded={false} className="mt-4">
          {runs.data?.length ? (
            <Table>
              <thead><tr><th className="th">Ordem</th><th className="th">Criada em</th><th className="th text-right">Pedidos</th><th className="th">Status</th><th className="th" /></tr></thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/60 cursor-pointer" onClick={() => navigate(`/producao/${r.id}`)}>
                    <td className="td font-semibold">{r.name}</td>
                    <td className="td text-muted">{fmtDateTime(r.created_at)}</td>
                    <td className="td text-right num">{r.order_ids.length}</td>
                    <td className="td"><Badge tone={r.status === 'concluido' ? 'ok' : r.status === 'em_andamento' ? 'brand' : 'info'} dot>{r.status === 'concluido' ? 'Concluída' : r.status === 'em_andamento' ? 'Em andamento' : 'Planejada'}</Badge></td>
                    <td className="td text-right">{isAdmin && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={(e) => { e.stopPropagation(); if (confirm('Excluir esta ordem?')) remove.mutate(r.id); }} />}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<History className="h-5 w-5" />} title="Nenhuma ordem salva" description="Salve o cálculo atual para acompanhar a produção." />
          )}
        </Card>
      )}
    </>
  );
}
