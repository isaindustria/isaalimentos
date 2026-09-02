import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, History, CheckCircle2, Download, RotateCcw, Trash2 } from 'lucide-react';
import { createStockImport, deleteStockImport, getCurrentStock, listStockImports, setCurrentImport } from '@/api/stock';
import { getSettings } from '@/api/settings';
import { parseStockWorkbook, type StockParseResult } from '@/domain/parsers/stockXlsx';
import { Badge, Button, Card, Dialog, Dropzone, EmptyState, Input, PageHeader, Stat, Table, Tabs } from '@/components/primitives';
import { downloadBlob, fmtAgo, fmtDateTime, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import StockMovements from '@/components/StockMovements';

export default function StockPage() {
  const qc = useQueryClient();
  const { session, isAdmin } = useAuth();
  const [tab, setTab] = useState<'atual' | 'lancamentos' | 'historico'>('atual');
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<StockParseResult | null>(null);
  const [createMissing, setCreateMissing] = useState(true);
  const [search, setSearch] = useState('');

  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const imports = useQuery({ queryKey: ['stock-imports'], queryFn: () => listStockImports() });
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (stock.data ?? []).filter((s) => !q || s.code.includes(q) || s.description.toLowerCase().includes(q));
  }, [stock.data, search]);
  const total = (stock.data ?? []).reduce((a, s) => a + Number(s.total), 0);
  const zero = (stock.data ?? []).filter((s) => Number(s.total) === 0).length;
  const current = imports.data?.find((i) => i.is_current);

  async function onFile(f: File) {
    setFile(f);
    try {
      const buf = await f.arrayBuffer();
      setParsed(parseStockWorkbook(buf, settings.data?.stock_locations ?? [1, 5]));
    } catch (e) {
      toast.error(`Não foi possível ler a planilha: ${(e as Error).message}`);
      setParsed(null);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      createStockImport({
        fileName: file!.name,
        locations: parsed!.locations,
        aggregates: parsed!.aggregates,
        rowsTotal: parsed!.rows.length + parsed!.ignoredRows,
        createMissing,
        userId: session?.user.id,
      }),
    onSuccess: (r) => {
      toast.success(`Estoque atualizado: ${fmtInt(parsed!.aggregates.length)} produtos.${r.createdProducts.length ? ` ${r.createdProducts.length} produto(s) novo(s) cadastrado(s).` : ''}`);
      qc.invalidateQueries({ queryKey: ['current-stock'] });
      qc.invalidateQueries({ queryKey: ['stock-imports'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      setImportOpen(false);
      setFile(null);
      setParsed(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restore = useMutation({
    mutationFn: setCurrentImport,
    onSuccess: () => {
      toast.success('Importação definida como estoque atual.');
      qc.invalidateQueries({ queryKey: ['current-stock'] });
      qc.invalidateQueries({ queryKey: ['stock-imports'] });
    },
  });
  const remove = useMutation({
    mutationFn: deleteStockImport,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['current-stock'] });
      qc.invalidateQueries({ queryKey: ['stock-imports'] });
    },
  });

  function exportCsv() {
    const lines = [['Código', 'Descrição', 'Local 1', 'Local 5', 'Total'].join(';')];
    for (const s of stock.data ?? []) lines.push([s.code, s.description, s.location_1, s.location_5, s.total].join(';'));
    downloadBlob(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `estoque-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo dos locais 1 e 5 = última planilha importada + lançamentos feitos aqui (entradas, saídas, produção, inventário)."
        actions={
          <>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={exportCsv} disabled={!stock.data?.length}>Exportar CSV</Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importar planilha</Button>
          </>
        }
      />
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        <Stat label="Unidades em estoque" value={fmtInt(total)} tone="ok" />
        <Stat label="Produtos" value={fmtInt(stock.data?.length ?? 0)} sub={`${zero} sem saldo`} />
        <Stat label="Última importação" value={current ? fmtAgo(current.imported_at) : '—'} sub={current?.file_name ?? 'Nenhuma planilha importada'} tone="brand" icon={<History className="h-5 w-5" />} />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'atual', label: 'Estoque atual' }, { value: 'lancamentos', label: 'Lançamentos' }, { value: 'historico', label: 'Importações', count: imports.data?.length }]} />
        {tab === 'atual' && <Input className="ml-auto w-full sm:w-72" placeholder="Buscar produto" value={search} onChange={(e) => setSearch(e.target.value)} />}
      </div>

      {tab === 'lancamentos' ? (
        <StockMovements />
      ) : tab === 'atual' ? (
        <Card padded={false}>
          {filtered.length ? (
            <Table>
              <thead>
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Produto</th>
                  <th className="th text-right">Local 1</th>
                  <th className="th text-right">Local 5</th>
                  <th className="th text-right">Total</th>
                  <th className="th text-right">Caixas</th>
                  <th className="th">Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.code} className="hover:bg-surface-2/60">
                    <td className="td font-mono text-xs font-semibold">{s.code}</td>
                    <td className="td font-medium">{s.description}</td>
                    <td className="td text-right num text-muted">{fmtInt(s.location_1)}</td>
                    <td className="td text-right num text-muted">{fmtInt(s.location_5)}</td>
                    <td className="td text-right num font-bold">{fmtInt(s.total)}</td>
                    <td className="td text-right num text-muted">{fmtInt(Math.floor(Number(s.total) / (s.units_per_box || 48)))}</td>
                    <td className="td">
                      {Number(s.total) === 0 ? <Badge tone="danger" dot>Zerado</Badge> : s.min_stock > 0 && Number(s.total) <= s.min_stock ? <Badge tone="warn" dot>Abaixo do mínimo</Badge> : <Badge tone="ok" dot>OK</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Sem dados de estoque" description="Importe a planilha ESTOQUE ATUAL exportada do ERP." action={<Button onClick={() => setImportOpen(true)} icon={<Upload className="h-4 w-4" />}>Importar planilha</Button>} />
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
                  <th className="th text-right">Produtos</th>
                  <th className="th text-right">Unidades</th>
                  <th className="th">Locais</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {imports.data.map((i) => (
                  <tr key={i.id} className={i.is_current ? 'bg-brand-soft/30' : ''}>
                    <td className="td">
                      {fmtDateTime(i.imported_at)} {i.is_current && <Badge tone="brand" className="ml-2">Atual</Badge>}
                    </td>
                    <td className="td text-muted">{i.file_name}</td>
                    <td className="td text-right num">{fmtInt(i.products_count)}</td>
                    <td className="td text-right num">{fmtInt(i.total_units)}</td>
                    <td className="td text-muted">{i.locations.join(', ')}</td>
                    <td className="td text-right whitespace-nowrap">
                      {!i.is_current && <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore.mutate(i.id)}>Tornar atual</Button>}
                      {isAdmin && !i.is_current && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => confirm('Excluir esta importação?') && remove.mutate(i.id)}>Excluir</Button>}
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

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar estoque atual"
        wide
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!parsed?.aggregates.length} loading={save.isPending} icon={<CheckCircle2 className="h-4 w-4" />}>
              Substituir estoque atual
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Dropzone accept=".xlsx,.xls" onFile={onFile} file={file} label="Arraste a planilha ESTOQUE ATUAL ou clique para escolher" hint="Somente os locais de estoque 1 e 5 são considerados. Linhas repetidas do mesmo produto são somadas." />
          {parsed && (
            <>
              <div className="grid sm:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Produtos</div><div className="font-bold text-lg num">{parsed.aggregates.length}</div></div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Linhas usadas</div><div className="font-bold text-lg num">{parsed.rows.length}</div></div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Linhas ignoradas</div><div className="font-bold text-lg num">{parsed.ignoredRows}</div></div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Total unidades</div><div className="font-bold text-lg num">{fmtInt(parsed.aggregates.reduce((s, a) => s + a.total, 0))}</div></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
                Cadastrar automaticamente produtos que ainda não existem no sistema
              </label>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
                <Table dense>
                  <thead className="sticky top-0 bg-surface">
                    <tr>
                      <th className="th">Código</th>
                      <th className="th">Descrição</th>
                      {parsed.locations.map((l) => <th key={l} className="th text-right">Local {l}</th>)}
                      <th className="th text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.aggregates.map((a) => (
                      <tr key={a.code}>
                        <td className="td font-mono text-xs">{a.code}</td>
                        <td className="td">{a.description}</td>
                        {parsed.locations.map((l) => <td key={l} className="td text-right num text-muted">{fmtInt(a.byLocation[l] ?? 0)}</td>)}
                        <td className="td text-right num font-semibold">{fmtInt(a.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
