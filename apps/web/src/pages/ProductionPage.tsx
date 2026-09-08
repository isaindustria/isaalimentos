import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Upload, Boxes, ClipboardList, Download, Printer, Trash2, Factory, AlertTriangle, Check, Package, Scale, Eraser } from 'lucide-react';
import { applyProdInconsistency, clearProdDemand, deleteProdProduct, discardProdPending, importProdCatalog, importProdDemand, importProdStock, listProdAliases, listProdDemand, listProdPending, listProdProducts, listProdStock, resolveProdPending, saveProdProduct, type ProdCatalogRow, type ProdDemandInput, type ProdInconsistency, type ProdPendingInput, type ProdStockRow } from '@/api/producao';
import { getSettings } from '@/api/settings';
import { logActivity } from '@/api/activity';
import { computeNeed, type NeedRow } from '@/domain/producao';
import { extractRowsFromFile } from '@/domain/parsers/pdfText';
import { consolidateItems, parseOrderPages } from '@/domain/parsers/orderPdf';
import { matchProduct } from '@/domain/matching';
import { normalizedKey } from '@/domain/normalize';
import { pick, readSheet, toNumber } from '@/domain/parsers/sheet';
import { Badge, Button, Card, Dialog, Dropzone, EmptyState, Field, Input, PageHeader, Select, Spinner, Stat, Table } from '@/components/primitives';
import { ImportSheetDialog } from '@/components/ImportSheetDialog';
import { downloadBlob, fmtDec, fmtInt, fmtKg } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { ProdPending, ProdProduct } from '@/lib/types';

type View = 'cadastro' | 'pedido' | 'produzir';

interface PedidoPreviewLine { key: string; store: string | null; clientCode: string | null; description: string; boxes: number; units: number; code: string | null; productName: string | null; status: string; candidates: Array<{ code: string; description: string; score: number }> }

export default function ProductionPage() {
  const qc = useQueryClient();
  const { canWriteArea, session, profile } = useAuth();
  const canWrite = canWriteArea('producao');
  const [view, setView] = useState<View>('produzir');
  const [importing, setImporting] = useState<'cadastro' | 'estoque' | 'pedido' | null>(null);
  const [inconsistencies, setInconsistencies] = useState<ProdInconsistency[]>([]);
  const [editing, setEditing] = useState<Partial<ProdProduct> | null>(null);
  const [onlyOrdered, setOnlyOrdered] = useState(true);
  const [refFilter, setRefFilter] = useState<string[]>([]);

  const products = useQuery({ queryKey: ['prod-products'], queryFn: listProdProducts });
  const stock = useQuery({ queryKey: ['prod-stock'], queryFn: listProdStock });
  const demand = useQuery({ queryKey: ['prod-demand'], queryFn: listProdDemand });
  const pending = useQuery({ queryKey: ['prod-pending'], queryFn: listProdPending });
  const aliases = useQuery({ queryKey: ['prod-aliases'], queryFn: listProdAliases });
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const invalidate = () => ['prod-products', 'prod-stock', 'prod-demand', 'prod-pending', 'prod-aliases'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const { rows, info } = useMemo(() => computeNeed(products.data ?? [], stock.data ?? [], demand.data ?? []), [products.data, stock.data, demand.data]);
  const references = useMemo(() => [...new Set((products.data ?? []).map((p) => p.reference ?? 'Sem referência'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [products.data]);
  const refOf = (code: string) => products.data?.find((p) => p.code === code)?.reference ?? 'Sem referência';
  const inRef = (ref: string | null) => !refFilter.length || refFilter.includes(ref ?? 'Sem referência');
  const visibleProducts = (products.data ?? []).filter((p) => inRef(p.reference));
  const needRows = (onlyOrdered ? rows.filter((r) => r.ordered > 0) : rows).filter((r) => inRef(refOf(r.code)));
  const stockBy = useMemo(() => new Map((stock.data ?? []).map((s) => [s.code, s])), [stock.data]);

  const applyInc = useMutation({ mutationFn: (i: ProdInconsistency) => applyProdInconsistency(i.code, i.incoming.description, i.incoming.reference), onSuccess: (_, i) => { setInconsistencies((l) => l.filter((x) => x.code !== i.code)); invalidate(); toast.success(`Código ${i.code} atualizado.`); }, onError: (e: Error) => toast.error(e.message) });
  const save = useMutation({ mutationFn: () => saveProdProduct(editing as ProdProduct), onSuccess: () => { toast.success('Produto salvo.'); invalidate(); setEditing(null); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: deleteProdProduct, onSuccess: () => { toast.success('Produto removido.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const resolve = useMutation({ mutationFn: (v: { p: ProdPending; code: string }) => resolveProdPending(v.p, v.code), onSuccess: () => { toast.success('Item ajustado. O sistema aprendeu essa descrição.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const discard = useMutation({ mutationFn: discardProdPending, onSuccess: invalidate });
  const clear = useMutation({ mutationFn: clearProdDemand, onSuccess: () => { toast.success('Pedido zerado.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  function exportProduzir() {
    const data = needRows.map((r) => ({ 'Código': r.code, 'Nome do produto': r.name, 'Gr de uso': r.useG ?? '', 'Estoque disponível': r.available, 'Total pedido': r.ordered, 'Necessidade': r.need, 'Saldo restante': r.remaining, 'Conversão para quilos': Number(r.kg.toFixed(3)), 'Situação': STATUS[r.status] }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produzir');
    downloadBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `produzir-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title="Produção"
        description="Módulo independente: cadastro, estoque e pedido próprios. Necessidade = total pedido − estoque disponível (1 + 5)."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {canWrite && <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImporting('cadastro')}>Importar cadastro</Button>}
            {canWrite && <Button variant="outline" icon={<Boxes className="size-4" />} onClick={() => setImporting('estoque')}>Importar estoque atual</Button>}
            {canWrite && <Button variant="outline" icon={<ClipboardList className="size-4" />} onClick={() => setImporting('pedido')}>Importar pedido</Button>}
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportProduzir} disabled={!needRows.length}>Exportar produzir</Button>
            <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => { setView('produzir'); setTimeout(() => window.print(), 150); }}>Imprimir</Button>
          </div>
        }
      />

      <div className="no-print mb-4 grid gap-3 sm:grid-cols-3">
        {([
          { v: 'cadastro', label: 'Cadastro de produtos', sub: `${products.data?.length ?? 0} produto(s)`, icon: <Package className="size-5" /> },
          { v: 'pedido', label: 'Estoque / Pedido', sub: `${info.productsOrdered} produto(s) pedidos${pending.data?.length ? ` · ${pending.data.length} para ajustar` : ''}`, icon: <ClipboardList className="size-5" /> },
          { v: 'produzir', label: 'Produzir', sub: `${info.productsToProduce} a produzir · ${fmtKg(info.produceKg)} kg`, icon: <Factory className="size-5" /> },
        ] as Array<{ v: View; label: string; sub: string; icon: JSX.Element }>).map((c) => (
          <button key={c.v} type="button" onClick={() => setView(c.v)} className={`card flex items-center gap-3 px-4 py-3 text-left transition ${view === c.v ? 'border-brand ring-2 ring-brand/20' : 'hover:bg-surface-2'}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${view === c.v ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-muted'}`}>{c.icon}</span>
            <span className="min-w-0"><span className="block font-display text-sm font-bold">{c.label}</span><span className="block truncate text-xs text-muted">{c.sub}</span></span>
          </button>
        ))}
      </div>

      {references.length > 1 && view !== 'pedido' && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setRefFilter([])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${refFilter.length === 0 ? 'border-brand bg-brand text-brand-ink' : 'border-line text-muted hover:bg-surface-2'}`}>Todas</button>
          {references.map((r) => (
            <button key={r} type="button" onClick={() => setRefFilter((v) => (v.includes(r) ? v.filter((x) => x !== r) : [...v, r]))} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${refFilter.includes(r) ? 'border-brand bg-brand text-brand-ink' : 'border-line text-muted hover:bg-surface-2'}`}>{r}</button>
          ))}
        </div>
      )}

      {view === 'cadastro' && (
        <div className="flex flex-col gap-4">
          {inconsistencies.length > 0 && (
            <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><AlertTriangle className="size-4 text-warn" /> Ajuste manual: {inconsistencies.length} código(s) com dados diferentes do cadastro</span>} padded={false}>
              <Table dense>
                <thead><tr><th className="th">Código</th><th className="th">No cadastro</th><th className="th">Na planilha</th><th className="th" /></tr></thead>
                <tbody>{inconsistencies.map((i) => (
                  <tr key={i.code}>
                    <td className="td font-mono text-xs">{i.code}</td>
                    <td className="td text-xs">{i.current.name} · {i.current.weight_g ?? '—'} g · {i.current.reference ?? '—'}</td>
                    <td className="td text-xs">{i.incoming.name} · {i.incoming.weight_g ?? '—'} g · {i.incoming.reference ?? '—'}</td>
                    <td className="td whitespace-nowrap text-right"><Button size="sm" variant="outline" onClick={() => applyInc.mutate(i)}>Usar planilha</Button><Button size="sm" variant="ghost" onClick={() => setInconsistencies((l) => l.filter((x) => x.code !== i.code))}>Manter</Button></td>
                  </tr>
                ))}</tbody>
              </Table>
            </Card>
          )}
          <Card padded={false}>
            {products.data?.length ? (
              <Table>
                <thead><tr><th className="th">Código</th><th className="th">Referência</th><th className="th">Nome do produto</th><th className="th text-right">Estoque 1</th><th className="th text-right">Estoque 5</th><th className="th text-right">Estoque disponível</th><th className="th" /></tr></thead>
                <tbody>{visibleProducts.map((p) => { const s = stockBy.get(p.code); const s1 = Number(s?.stock1 ?? 0), s5 = Number(s?.stock5 ?? 0); return (
                  <tr key={p.code}>
                    <td className="td font-mono text-xs text-muted">{p.code}</td>
                    <td className="td"><Badge tone={/POTE/i.test(p.reference ?? '') ? 'brand' : 'neutral'}>{p.reference ?? '—'}</Badge></td>
                    <td className="td font-medium">{p.name}{p.brand && <span className="ml-1 text-xs font-normal text-muted">{p.brand}</span>}</td>
                    <td className="td num text-right text-muted">{fmtInt(s1)}</td>
                    <td className="td num text-right text-muted">{fmtInt(s5)}</td>
                    <td className="td num text-right font-semibold">{fmtInt(s1 + s5)}</td>
                    <td className="td whitespace-nowrap text-right">{canWrite && <><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Editar</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm(`Remover ${p.name} do cadastro da Produção?`) && remove.mutate(p.code)} /></>}</td>
                  </tr>); })}</tbody>
              </Table>
            ) : <EmptyState icon={<Package className="size-5" />} title="Nenhum produto no cadastro da Produção" description="Use Importar cadastro com a exportação do ERP (Código, Referência, Descrição do Produto)." />}
          </Card>
        </div>
      )}

      {view === 'pedido' && (
        <div className="flex flex-col gap-4">
          {pending.data && pending.data.length > 0 && (
            <Card title={<span className="inline-flex items-center gap-2 font-display text-sm font-bold"><AlertTriangle className="size-4 text-warn" /> Ajuste manual: {pending.data.length} item(ns) do pedido sem produto</span>} padded={false}>
              <Table dense>
                <thead><tr><th className="th">Loja</th><th className="th">Descrição no pedido</th><th className="th text-right">Caixas</th><th className="th">Produto</th><th className="th" /></tr></thead>
                <tbody>{pending.data.map((p) => <PendingRow key={p.id} p={p} products={products.data ?? []} onResolve={(code) => resolve.mutate({ p, code })} onDiscard={() => discard.mutate(p.id)} canWrite={canWrite} />)}</tbody>
              </Table>
            </Card>
          )}
          <Card title={<span className="font-display text-sm font-bold">Pedido atual · {fmtInt(info.orderedUnits)} un. em {demand.data?.length ?? 0} linha(s)</span>} action={canWrite && (demand.data?.length || pending.data?.length) ? <Button size="sm" variant="ghost" className="text-danger" icon={<Eraser className="size-3.5" />} onClick={() => confirm('Zerar o pedido atual (demanda e itens pendentes)?') && clear.mutate()}>Zerar pedido</Button> : undefined} padded={false}>
            {demand.data?.length ? (
              <Table>
                <thead><tr><th className="th">Loja</th><th className="th">Código</th><th className="th">Produto</th><th className="th">Descrição no pedido</th><th className="th text-right">Caixas</th><th className="th text-right">Unidades</th></tr></thead>
                <tbody>{demand.data.map((d) => { const p = products.data?.find((x) => x.code === d.code); return (
                  <tr key={d.id}><td className="td text-xs text-muted">{d.store ?? '—'}</td><td className="td font-mono text-xs">{d.code}</td><td className="td font-medium">{p?.name ?? d.code}</td><td className="td text-xs text-muted">{d.raw_description ?? '—'}</td><td className="td num text-right">{fmtDec(d.boxes)}</td><td className="td num text-right font-semibold">{fmtInt(d.units)}</td></tr>); })}</tbody>
              </Table>
            ) : <EmptyState icon={<ClipboardList className="size-5" />} title="Nenhum pedido importado" description="Use Importar pedido com o PDF das lojas (ou planilha com código e quantidade)." />}
          </Card>
        </div>
      )}

      {view === 'produzir' && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Quantidade pedida" value={fmtInt(info.orderedUnits)} sub={`${info.productsOrdered} produto(s) · ${fmtDec(info.orderedUnits / 48)} cx`} icon={<ClipboardList className="size-5" />} tone="info" />
            <Stat label="Atendida pelo estoque" value={fmtInt(info.servedUnits)} sub={info.orderedUnits ? `${Math.round((info.servedUnits / info.orderedUnits) * 100)}% do pedido` : '—'} icon={<Boxes className="size-5" />} tone="ok" />
            <Stat label="A produzir (un.)" value={fmtInt(info.produceUnits)} sub={`${fmtDec(info.produceBoxes)} caixas de 48 · ${info.productsToProduce} produto(s)`} icon={<Factory className="size-5" />} tone="brand" />
            <Stat label="A produzir (quilos)" value={`${fmtKg(info.produceKg)} kg`} sub="necessidade × gr de uso" icon={<Scale className="size-5" />} tone="warn" />
          </div>
          <Card title={<span className="font-display text-sm font-bold">Pedido / Necessidade de produção</span>} action={<label className="no-print inline-flex items-center gap-2 text-xs text-muted"><input type="checkbox" className="accent-brand" checked={onlyOrdered} onChange={(e) => setOnlyOrdered(e.target.checked)} /> só produtos com pedido</label>} padded={false}>
            {needRows.length ? (
              <Table>
                <thead><tr><th className="th">Código</th><th className="th">Nome do produto</th><th className="th text-right">Gr de uso</th><th className="th text-right">Estoque disponível</th><th className="th text-right">Total pedido</th><th className="th text-right">Necessidade</th><th className="th text-right">Saldo restante</th><th className="th text-right">Conversão para quilos</th><th className="th">Situação</th></tr></thead>
                <tbody>{needRows.map((r) => <NeedTr key={r.code} r={r} />)}</tbody>
              </Table>
            ) : <EmptyState icon={<Factory className="size-5" />} title="Nada a calcular" description="Importe o cadastro, o estoque atual e o pedido." />}
          </Card>
        </div>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Editar produto (Produção)" footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!editing?.name}>Salvar</Button></>}>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código"><Input value={editing.code ?? ''} disabled /></Field>
            <Field label="Referência"><Input value={editing.reference ?? ''} onChange={(e) => setEditing({ ...editing, reference: e.target.value })} /></Field>
            <Field label="Nome do produto" className="sm:col-span-2"><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Peso (g)"><Input type="number" min={0} value={editing.weight_g ?? ''} onChange={(e) => setEditing({ ...editing, weight_g: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Unidades por caixa"><Input type="number" min={1} value={editing.units_per_box ?? 48} onChange={(e) => setEditing({ ...editing, units_per_box: Number(e.target.value) || 48 })} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="accent-brand" checked={!!editing.no_margin} onChange={(e) => setEditing({ ...editing, no_margin: e.target.checked })} /> Sem margem de erro (gr de uso = peso, sem +1 g)</label>
          </div>
        )}
      </Dialog>

      <ImportSheetDialog<ProdCatalogRow>
        open={importing === 'cadastro'}
        onClose={() => setImporting(null)}
        title="Importar cadastro (Produção)"
        description="Exportação do ERP: Código, Referência, Descrição do Produto. Identifica pelo código: novo cadastra, igual ignora, diferente vai para ajuste manual."
        templateName="modelo-cadastro-producao.xlsx"
        columns={[
          { key: 'code', label: 'Código', example: '612', required: true },
          { key: 'reference', label: 'Referência', example: 'ISA POTE C/ST' },
          { key: 'description', label: 'Descrição do Produto', example: 'TEMPERO NOVO - ISA - 60g - CX 48', required: true },
        ]}
        mapRow={(row, line) => {
          const code = pick(row, ['codigo', 'cod', 'code']);
          const description = pick(row, ['descricao do produto', 'descricao', 'nome do produto', 'nome', 'produto']);
          if (!code) return `Linha ${line}: sem código`;
          if (!description) return `Linha ${line}: sem descrição (${code})`;
          return { code: String(code).replace(/\.0+$/, ''), reference: pick(row, ['referencia', 'ref']) || null, description };
        }}
        preview={(r) => [r.code, r.reference ?? '—', r.description]}
        onImport={async (rows) => {
          const r = await importProdCatalog(rows);
          setInconsistencies(r.inconsistencies);
          if (r.inconsistencies.length) setView('cadastro');
          await logActivity({ kind: 'producao', title: 'Cadastro da Produção importado', body: `${r.created} novo(s), ${r.unchanged} já cadastrado(s), ${r.inconsistencies.length} para ajuste`, link: '/producao', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          invalidate();
          return `Cadastro: ${r.created} novo(s), ${r.unchanged} já existiam${r.inconsistencies.length ? `, ${r.inconsistencies.length} com diferença — confira em Ajuste manual` : ''}.`;
        }}
      />

      <ImportSheetDialog<ProdStockRow>
        open={importing === 'estoque'}
        onClose={() => setImporting(null)}
        title="Importar estoque atual (Produção)"
        description="Mesma exportação do ERP: Código, Local de Estoque, Saldo. Soma os locais 1 e 5 por código. Só atualiza códigos do cadastro; a base de cálculo não muda."
        templateName="modelo-estoque-producao.xlsx"
        columns={[
          { key: 'code', label: 'Código', example: '612', required: true },
          { key: 'stock1', label: 'local 1', example: '10' },
          { key: 'stock5', label: 'local 5', example: '3' },
          { key: 'location', label: 'Local de Estoque (formato ERP)', example: '1' },
          { key: 'qty', label: 'Saldo [Und Estoque] (formato ERP)', example: '10' },
        ]}
        mapRow={(row, line) => {
          const code = pick(row, ['codigo', 'cod', 'code']);
          if (!code) return `Linha ${line}: sem código`;
          const c = String(code).replace(/\.0+$/, '');
          const l1 = pick(row, ['local 1', 'estoque 1', 'local1']);
          const l5 = pick(row, ['local 5', 'estoque 5', 'local5']);
          if (l1 || l5) return { code: c, stock1: toNumber(l1, 0), stock5: toNumber(l5, 0) };
          const location = toNumber(pick(row, ['local de estoque', 'local']), NaN);
          if (!Number.isFinite(location)) return `Linha ${line}: sem local 1 / local 5 nem Local de Estoque (${code})`;
          const qty = toNumber(pick(row, ['saldo und estoque', 'saldo', 'quantidade', 'qtd']), NaN);
          if (!Number.isFinite(qty)) return `Linha ${line}: saldo inválido (${code})`;
          return { code: c, location, qty };
        }}
        preview={(r) => [r.code, r.location != null ? String(r.location) : `1: ${fmtDec(r.stock1)} · 5: ${fmtDec(r.stock5)}`, r.qty != null ? fmtDec(r.qty) : fmtDec((r.stock1 ?? 0) + (r.stock5 ?? 0))]}
        onImport={async (rows) => {
          const r = await importProdStock(rows);
          invalidate();
          const miss = r.unmatched.length ? ` ${r.unmatched.length} código(s) fora do cadastro ignorado(s): ${r.unmatched.slice(0, 6).join(', ')}${r.unmatched.length > 6 ? '…' : ''}.` : '';
          return `Estoque atualizado em ${r.updated} produto(s).${r.ignored ? ` ${r.ignored} linha(s) de outros locais ignorada(s).` : ''}${miss}`;
        }}
      />

      <PedidoImportDialog
        open={importing === 'pedido'}
        onClose={() => setImporting(null)}
        products={products.data ?? []}
        aliases={(aliases.data ?? []).map((a) => ({ product_code: a.code, client_code: a.client_code, normalized: normalizedKey(a.raw) }))}
        matchOptions={settings.data ? { threshold: settings.data.match_threshold, margin: settings.data.match_margin } : undefined}
        onDone={async (source, matched, pend) => {
          const r = await importProdDemand(source, matched, pend);
          await logActivity({ kind: 'producao', title: 'Pedido importado na Produção', body: `${r.matched} item(ns) reconhecido(s)${r.pending ? `, ${r.pending} para ajuste manual` : ''}`, link: '/producao', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          invalidate();
          setView(r.pending ? 'pedido' : 'produzir');
          toast.success(`Pedido importado: ${r.matched} item(ns)${r.pending ? `, ${r.pending} para ajustar` : ''}.`);
        }}
      />
    </>
  );
}

const fmtUse = (g: number) => (g >= 1000 ? `${fmtKg(g / 1000)} kg` : `${fmtInt(g)} g`);

const STATUS: Record<NeedRow['status'], string> = { produzir: 'Produzir', atendido: 'Atendido pelo estoque', sem_pedido: 'Sem pedido' };

function NeedTr({ r }: { r: NeedRow }) {
  return (
    <tr className={r.status === 'produzir' ? 'bg-brand-soft/30' : ''}>
      <td className="td font-mono text-xs text-muted">{r.code}</td>
      <td className="td font-medium">{r.name}</td>
      <td className="td num text-right text-muted">{r.useG != null ? fmtUse(r.useG) : '—'}</td>
      <td className="td num text-right">{fmtInt(r.available)}</td>
      <td className="td num text-right">{fmtInt(r.ordered)} <span className="text-xs text-muted">({fmtDec(r.orderedBoxes)} cx)</span></td>
      <td className={`td num text-right font-bold ${r.need > 0 ? 'text-brand' : 'text-muted'}`}>{r.need > 0 ? <>{fmtInt(r.need)} <span className="text-xs font-normal">({fmtDec(r.needBoxes)} cx)</span></> : '0'}</td>
      <td className="td num text-right text-muted">{fmtInt(r.remaining)}</td>
      <td className="td num text-right font-semibold">{r.need > 0 ? `${fmtKg(r.kg)} kg` : '—'}</td>
      <td className="td whitespace-nowrap"><Badge tone={r.status === 'produzir' ? 'brand' : r.status === 'atendido' ? 'ok' : 'neutral'} dot>{STATUS[r.status]}</Badge></td>
    </tr>
  );
}

function PendingRow({ p, products, onResolve, onDiscard, canWrite }: { p: ProdPending; products: ProdProduct[]; onResolve: (code: string) => void; onDiscard: () => void; canWrite: boolean }) {
  const [code, setCode] = useState(p.candidates[0]?.code ?? '');
  return (
    <tr>
      <td className="td text-xs text-muted">{p.store ?? '—'}</td>
      <td className="td text-xs">{p.raw_description}{p.client_code && <span className="ml-1 font-mono text-[10px] text-muted">{p.client_code}</span>}</td>
      <td className="td num text-right">{fmtDec(p.boxes)}</td>
      <td className="td">
        <Select className="h-8 w-full min-w-56" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Escolha o produto…</option>
          {p.candidates.map((c) => <option key={`c-${c.code}`} value={c.code}>{Math.round(c.score * 100)}% · {c.description}</option>)}
          {products.map((x) => <option key={x.code} value={x.code}>{x.code} · {x.description}</option>)}
        </Select>
      </td>
      <td className="td whitespace-nowrap text-right">{canWrite && <><Button size="sm" icon={<Check className="size-3.5" />} disabled={!code} onClick={() => onResolve(code)}>Ajustar</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={onDiscard} /></>}</td>
    </tr>
  );
}

function PedidoImportDialog({ open, onClose, products, aliases, matchOptions, onDone }: { open: boolean; onClose: () => void; products: ProdProduct[]; aliases: Array<{ product_code: string; client_code: string | null; normalized: string | null }>; matchOptions?: { threshold: number; margin: number }; onDone: (source: string, matched: ProdDemandInput[], pending: ProdPendingInput[]) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<PedidoPreviewLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  function reset() { setFile(null); setLines([]); setWarnings([]); onClose(); }

  async function onFile(f: File) {
    setFile(f); setBusy(true);
    try {
      const matchable = products.map((p) => ({ code: p.code, description: p.description }));
      const out: PedidoPreviewLine[] = [];
      if (/\.pdf$/i.test(f.name)) {
        const pages = await extractRowsFromFile(await f.arrayBuffer());
        const parsed = parseOrderPages(pages);
        setWarnings(parsed.warnings);
        for (const o of parsed.orders) {
          const store = o.deliveryCnpj ? `${o.orderNumber ?? ''} ${o.city ?? ''}`.trim() || o.deliveryCnpj : o.orderNumber;
          for (const c of consolidateItems([o])) {
            const m = matchProduct({ clientCode: c.clientCode, description: c.description }, matchable, aliases, matchOptions);
            const prod = m.productCode ? products.find((p) => p.code === m.productCode) : undefined;
            const upb = prod?.units_per_box ?? 48;
            out.push({ key: `${o.orderNumber}-${c.key}`, store, clientCode: c.clientCode, description: c.description, boxes: c.boxes, units: c.boxes * upb, code: prod?.code ?? null, productName: prod?.name ?? null, status: m.status, candidates: m.candidates.slice(0, 3) });
          }
        }
      } else {
        const sheet = readSheet(await f.arrayBuffer());
        sheet.rows.forEach((row, i) => {
          const code = String(pick(row, ['codigo', 'cod', 'code'])).replace(/\.0+$/, '');
          if (!code) return;
          const prod = products.find((p) => p.code === code);
          const upb = prod?.units_per_box ?? 48;
          const unitsRaw = pick(row, ['pedido ttl', 'pedido total', 'unidades', 'pedido (un)', 'total pedido']);
          const boxesRaw = pick(row, ['caixas', 'cx', 'pedido (cx)']);
          let units = NaN, boxes = NaN;
          if (unitsRaw) { units = toNumber(unitsRaw, NaN); boxes = units / upb; }
          else if (boxesRaw) { boxes = toNumber(boxesRaw, NaN); units = boxes * upb; }
          else { const q = toNumber(pick(row, ['pedido', 'quantidade', 'qtd']), NaN); boxes = q; units = q * upb; }
          if (!Number.isFinite(units) || units <= 0) return;
          out.push({ key: `xls-${i}`, store: null, clientCode: null, description: pick(row, ['descricao', 'produto', 'nome']) || code, boxes, units, code: prod?.code ?? null, productName: prod?.name ?? null, status: prod ? 'auto' : 'not_found', candidates: [] });
        });
      }
      setLines(out);
      if (!out.length) toast.error('Nenhum item encontrado no arquivo.');
    } catch (e) {
      toast.error(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    try {
      const matched: ProdDemandInput[] = lines.filter((l) => l.code).map((l) => ({ code: l.code!, raw_description: l.description, store: l.store, boxes: l.boxes, units: l.units }));
      const pend: ProdPendingInput[] = lines.filter((l) => !l.code).map((l) => ({ raw_description: l.description, client_code: l.clientCode, store: l.store, boxes: l.boxes, units: l.units, candidates: l.candidates }));
      await onDone(file.name, matched, pend);
      reset();
    } catch (e) {
      toast.error(`Falha na importação: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const ok = lines.filter((l) => l.code).length;
  return (
    <Dialog open={open} onClose={reset} title="Importar pedido (Produção)" description="PDF das lojas (uma loja por página) ou planilha: Código + 'pedido ttl' (unidades) ou Código + Caixas. Itens reconhecidos entram na necessidade; os outros vão para ajuste manual." wide footer={<><Button variant="outline" onClick={reset}>Cancelar</Button><Button onClick={confirm} loading={busy} disabled={!lines.length} icon={<Check className="size-4" />}>Importar {lines.length ? `${lines.length} item(ns)` : ''}</Button></>}>
      <div className="flex flex-col gap-4">
        <Dropzone accept=".pdf,.xlsx,.xls,.csv" onFile={onFile} file={file} label="Arraste o PDF do pedido ou a planilha" hint="Mantém o cálculo atual: total pedido − estoque disponível, caixas de 48." />
        {busy && !lines.length && <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Lendo o arquivo…</div>}
        {warnings.length > 0 && <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs text-muted">{warnings.slice(0, 5).map((w, i) => <div key={i}>{w}</div>)}</div>}
        {lines.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-xs"><Badge tone="ok" dot>{ok} reconhecido(s)</Badge>{lines.length - ok > 0 && <Badge tone="warn" dot>{lines.length - ok} para ajuste manual</Badge>}</div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
              <Table dense>
                <thead className="sticky top-0 bg-surface"><tr><th className="th">Loja</th><th className="th">Descrição no pedido</th><th className="th text-right">Caixas</th><th className="th">Produto</th></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.key} className={!l.code ? 'bg-warn/5' : ''}>
                    <td className="td text-xs text-muted">{l.store ?? '—'}</td>
                    <td className="td text-xs">{l.description}</td>
                    <td className="td num text-right">{fmtDec(l.boxes)}</td>
                    <td className="td text-xs">{l.code ? <><b className="font-mono">{l.code}</b> {l.productName}</> : <span className="text-warn">ajuste manual{l.candidates[0] ? ` · sugestão: ${l.candidates[0].description}` : ''}</span>}</td>
                  </tr>
                ))}</tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
