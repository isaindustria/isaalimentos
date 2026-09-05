import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ShoppingCart, FlaskConical, PackageCheck, Upload, AlertTriangle } from 'lucide-react';
import { computePurchasePlan, computeSupplyNeeds, createPurchase, deleteBom, deleteSupply, importConsumption, importSupplies, listBom, listConsumption, listPurchases, listSupplies, saveBom, saveSupply, setPurchaseStatus, type ConsumptionImportRow, type ImportMode, type SupplyImportRow } from '@/api/v14';
import { listProducts } from '@/api/products';
import { listRuns, getRun } from '@/api/production';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Table, Tabs } from '@/components/primitives';
import { ImportSheetDialog } from '@/components/ImportSheetDialog';
import { pick, toNumber } from '@/domain/parsers/sheet';
import { fmtBRL, fmtDateTime, fmtDec } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { SUPPLY_REFERENCE_LABEL, type Supply, type SupplyReference } from '@/lib/types';

const IMPORT_MODES = [
  { value: 'incluir', label: 'Incluir planilha', description: 'Mantém o que já existe. Quem aparece na planilha tem a quantidade substituída (não soma); novos são cadastrados.' },
  { value: 'substituir', label: 'Substituir planilha', description: 'Apaga os dados anteriores dessa categoria e grava só o que está na planilha.' },
];

function parseReference(raw: string): SupplyReference {
  const t = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/materia|prima|mp\b/.test(t)) return 'materia_prima';
  if (/embal/.test(t)) return 'embalagem';
  if (/tampa/.test(t)) return 'tampa';
  if (/pote/.test(t)) return 'pote';
  if (/etiq|rotul/.test(t)) return 'etiqueta';
  return 'insumo';
}

/** Aceita 09/2026, 2026-09, 01/09/2026, set/2026 e datas do Excel; devolve o primeiro dia do mes. */
function parsePeriod(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  let m = t.match(/^(\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  m = t.match(/^(\d{4})[\/-](\d{1,2})(?:[\/-]\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-01`;
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  m = t.match(/^([a-z]{3})[a-z]*[\/ -]?(\d{4})$/);
  if (m && months.includes(m[1])) return `${m[2]}-${String(months.indexOf(m[1]) + 1).padStart(2, '0')}-01`;
  if (/^\d{5}$/.test(t)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(t) * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const PSTATUS: Record<string, { label: string; tone: 'neutral' | 'info' | 'ok' | 'danger' }> = { rascunho: { label: 'Rascunho', tone: 'neutral' }, enviado: { label: 'Enviado ao fornecedor', tone: 'info' }, recebido: { label: 'Recebido', tone: 'ok' }, cancelado: { label: 'Cancelado', tone: 'danger' } };

export default function SuppliesPage() {
  const qc = useQueryClient();
  const { canWrite, session, profile } = useAuth();
  const [tab, setTab] = useState<'insumos' | 'ficha' | 'compras'>('insumos');
  const [editing, setEditing] = useState<Partial<Supply> | null>(null);
  const [bomProduct, setBomProduct] = useState('');
  const [bomSupply, setBomSupply] = useState('');
  const [bomQty, setBomQty] = useState(0);
  const [runId, setRunId] = useState('');
  const [needs, setNeeds] = useState<ReturnType<typeof computeSupplyNeeds>>([]);
  const [importing, setImporting] = useState<'insumos' | 'consumo' | null>(null);
  const [refFilter, setRefFilter] = useState<'' | SupplyReference>('');

  const supplies = useQuery({ queryKey: ['supplies'], queryFn: listSupplies });
  const bom = useQuery({ queryKey: ['bom'], queryFn: listBom });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: listPurchases });
  const consumption = useQuery({ queryKey: ['supply-consumption'], queryFn: listConsumption });
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => listRuns(30) });
  const invalidate = () => ['supplies', 'bom', 'purchases', 'supply-consumption'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const save = useMutation({ mutationFn: () => saveSupply(editing as Supply), onSuccess: () => { toast.success('Insumo salvo.'); invalidate(); setEditing(null); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: deleteSupply, onSuccess: () => { toast.success('Insumo removido.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const addBom = useMutation({ mutationFn: () => saveBom(bomProduct, bomSupply, bomQty), onSuccess: () => { toast.success('Ficha técnica atualizada.'); invalidate(); setBomQty(0); }, onError: (e: Error) => toast.error(e.message) });
  const removeBom = useMutation({ mutationFn: deleteBom, onSuccess: invalidate });
  const calc = useMutation({
    mutationFn: async () => {
      const run = await getRun(runId);
      return computeSupplyNeeds(bom.data ?? [], supplies.data ?? [], run.items.filter((i) => Number(i.production_need) > 0).map((i) => ({ code: i.product_code, units: Number(i.production_need) })));
    },
    onSuccess: (n) => { setNeeds(n); if (!n.length) toast.info('Nenhum insumo calculado: cadastre a ficha técnica dos produtos da ordem.'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createPO = useMutation({
    mutationFn: () => createPurchase({ supplier: null, notes: `Gerado da ordem de produção`, production_run_id: runId || null, items: needs.filter((n) => n.toBuy > 0).map((n) => ({ supply_id: n.supply_id, qty: Math.ceil(n.toBuy * 100) / 100, unit_cost: n.cost })), userId: session?.user.id }),
    onSuccess: async () => { toast.success('Pedido de compra criado.'); await logActivity({ kind: 'sistema', title: 'Pedido de compra de insumos criado', link: '/insumos', actor_id: session?.user.id, actor_name: profile?.name ?? null }); invalidate(); setTab('compras'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const status = useMutation({ mutationFn: (v: { id: string; status: 'rascunho' | 'enviado' | 'recebido' | 'cancelado'; items?: import('@/lib/types').PurchaseOrderItem[] }) => setPurchaseStatus(v.id, v.status, v.items), onSuccess: () => { toast.success('Pedido de compra atualizado.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const bomByProduct = useMemo(() => { const m = new Map<string, typeof bom.data>(); for (const b of bom.data ?? []) m.set(b.product_code, [...(m.get(b.product_code) ?? []), b]); return m; }, [bom.data]);
  const low = (supplies.data ?? []).filter((s) => Number(s.stock) <= Number(s.min_stock) && Number(s.min_stock) > 0);
  const plan = useMemo(() => computePurchasePlan(supplies.data ?? [], consumption.data ?? []), [supplies.data, consumption.data]);
  const visible = (supplies.data ?? []).filter((s) => !refFilter || s.reference === refFilter);
  const review = [...plan.values()].filter((p) => p.needsReview).length;

  return (
    <>
      <PageHeader title="Insumos e compras" description="Matéria-prima e embalagem por produto (ficha técnica). O sistema calcula o que comprar a partir da ordem de produção." actions={canWrite && tab === 'insumos' && <><Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImporting('insumos')}>Importar matéria-prima</Button><Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImporting('consumo')}>Importar consumo</Button><Button icon={<Plus className="size-4" />} onClick={() => setEditing({ name: '', unit: 'kg', stock: 0, min_stock: 0, reference: 'insumo', code: '' })}>Novo insumo</Button></>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'insumos', label: 'Insumos', count: supplies.data?.length }, { value: 'ficha', label: 'Ficha técnica', count: bom.data?.length }, { value: 'compras', label: 'Pedidos de compra', count: purchases.data?.length }]} />
        {low.length > 0 && <Badge tone="warn" dot>{low.length} insumo(s) abaixo do mínimo</Badge>}
        {review > 0 && <Badge tone="danger" dot>{review} sugestão(ões) para conferir</Badge>}
        {tab === 'insumos' && <Select className="ml-auto h-9 w-full sm:w-56" value={refFilter} onChange={(e) => setRefFilter(e.target.value as '' | SupplyReference)}><option value="">Todas as referências</option>{(Object.keys(SUPPLY_REFERENCE_LABEL) as SupplyReference[]).map((r) => <option key={r} value={r}>{SUPPLY_REFERENCE_LABEL[r]}</option>)}</Select>}
      </div>

      {tab === 'insumos' && (
        <Card padded={false}>
          {supplies.data?.length ? (
            <Table>
              <thead><tr><th className="th">Referência</th><th className="th">Código</th><th className="th">Produto</th><th className="th text-right">Estoque atual</th><th className="th text-right">Média consumo/mês</th><th className="th text-right">Sugestão de compra</th><th className="th text-right">Custo</th><th className="th" /></tr></thead>
              <tbody>{visible.map((s) => { const p = plan.get(s.id); return (
                <tr key={s.id} className={Number(s.stock) <= Number(s.min_stock) && Number(s.min_stock) > 0 ? 'bg-warn/5' : ''}>
                  <td className="td"><Badge tone={s.reference === 'materia_prima' ? 'brand' : 'neutral'}>{SUPPLY_REFERENCE_LABEL[s.reference]}</Badge></td>
                  <td className="td font-mono text-xs text-muted">{s.code ?? '—'}</td>
                  <td className="td font-medium">{s.name}{s.supplier && <span className="block text-xs font-normal text-muted">{s.supplier}</span>}</td>
                  <td className="td num text-right font-semibold">{fmtDec(s.stock)} <span className="text-xs font-normal text-muted">{s.unit}</span></td>
                  <td className="td num text-right text-muted">{p ? <>{fmtDec(p.avgMonthly)} <span className="text-xs">({p.months} {p.months === 1 ? 'mês' : 'meses'})</span></> : '—'}</td>
                  <td className="td num text-right">{p ? <span className={`inline-flex items-center justify-end gap-1 font-bold ${p.suggestion > 0 ? 'text-brand' : 'text-muted'}`}>{p.needsReview && <AlertTriangle className="size-3.5 text-danger" title={`Oscilou ${Math.round(p.maxSwing * 100)}% entre meses: conferir manualmente`} />}{p.suggestion > 0 ? `${fmtDec(p.suggestion)} ${s.unit}` : '0'}</span> : <span className="text-xs text-muted">sem consumo</span>}</td>
                  <td className="td num text-right">{s.cost != null ? fmtBRL(s.cost) : '—'}</td>
                  <td className="td text-right whitespace-nowrap">{canWrite && <><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Editar</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Remover insumo?') && remove.mutate(s.id)} /></>}</td>
                </tr>); })}</tbody>
            </Table>
          ) : <EmptyState icon={<FlaskConical className="size-5" />} title="Nenhum insumo" description="Cadastre matéria-prima e embalagens (ex.: sal, páprica, potes 100g, tampas)." />}
        </Card>
      )}

      {tab === 'ficha' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card title="Adicionar item à ficha técnica">
            <div className="flex flex-col gap-3">
              <Field label="Produto"><Select value={bomProduct} onChange={(e) => setBomProduct(e.target.value)}><option value="">Selecione…</option>{products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}</Select></Field>
              <Field label="Insumo"><Select value={bomSupply} onChange={(e) => setBomSupply(e.target.value)}><option value="">Selecione…</option>{supplies.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}</Select></Field>
              <Field label="Quantidade por unidade produzida" hint="Ex.: 0,05 kg de sal por pote"><Input type="number" step="0.0001" min={0} value={bomQty || ''} onChange={(e) => setBomQty(Number(e.target.value))} /></Field>
              {canWrite && <Button onClick={() => addBom.mutate()} disabled={!bomProduct || !bomSupply || !bomQty} loading={addBom.isPending}>Salvar na ficha</Button>}
            </div>
          </Card>
          <Card title="Fichas cadastradas" padded={false}>
            {bom.data?.length ? (
              <Table><thead><tr><th className="th">Produto</th><th className="th">Insumo</th><th className="th text-right">Qtd / unidade</th><th className="th" /></tr></thead>
                <tbody>{[...bomByProduct.entries()].map(([code, items]) => (items ?? []).map((b, i) => (
                  <tr key={b.id}><td className="td font-medium">{i === 0 ? products.data?.find((p) => p.code === code)?.description ?? code : ''}</td><td className="td">{b.supply?.name}</td><td className="td num text-right">{fmtDec(b.qty_per_unit)} {b.supply?.unit}</td><td className="td text-right">{canWrite && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => removeBom.mutate(b.id)} />}</td></tr>
                )))}</tbody></Table>
            ) : <EmptyState title="Nenhuma ficha técnica" description="Sem ficha, o sistema não consegue calcular insumos." />}
          </Card>
        </div>
      )}

      {tab === 'compras' && (
        <div className="flex flex-col gap-4">
          <Card title="Calcular compra a partir de uma ordem de produção">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Ordem de produção" className="min-w-64 flex-1"><Select value={runId} onChange={(e) => setRunId(e.target.value)}><option value="">Selecione…</option>{runs.data?.map((r) => <option key={r.id} value={r.id}>{r.name} · {fmtDateTime(r.created_at)}</option>)}</Select></Field>
              <Button variant="outline" onClick={() => calc.mutate()} disabled={!runId} loading={calc.isPending}>Calcular insumos</Button>
              {canWrite && needs.some((n) => n.toBuy > 0) && <Button icon={<ShoppingCart className="size-4" />} onClick={() => createPO.mutate()} loading={createPO.isPending}>Gerar pedido de compra</Button>}
            </div>
            {needs.length > 0 && (
              <div className="mt-4"><Table dense><thead><tr><th className="th">Insumo</th><th className="th text-right">Necessário</th><th className="th text-right">Em estoque</th><th className="th text-right">Comprar</th><th className="th text-right">Custo est.</th></tr></thead>
                <tbody>{needs.map((n) => <tr key={n.supply_id} className={n.toBuy > 0 ? 'bg-brand-soft/30' : ''}><td className="td">{n.name}</td><td className="td num text-right">{fmtDec(n.needed)} {n.unit}</td><td className="td num text-right text-muted">{fmtDec(n.stock)}</td><td className={`td num text-right font-bold ${n.toBuy > 0 ? 'text-brand' : 'text-muted'}`}>{n.toBuy > 0 ? `${fmtDec(n.toBuy)} ${n.unit}` : '—'}</td><td className="td num text-right text-muted">{n.cost != null && n.toBuy > 0 ? fmtBRL(n.cost * n.toBuy) : '—'}</td></tr>)}</tbody></Table></div>
            )}
          </Card>
          <Card title="Pedidos de compra" padded={false}>
            {purchases.data?.length ? (
              <Table><thead><tr><th className="th">Criado</th><th className="th">Fornecedor</th><th className="th">Itens</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody>{purchases.data.map((po) => (
                  <tr key={po.id}><td className="td text-muted">{fmtDateTime(po.created_at)}</td><td className="td">{po.supplier ?? '—'}</td>
                    <td className="td text-xs">{(po.items ?? []).map((i) => `${i.supply?.name} ${fmtDec(i.qty)} ${i.supply?.unit ?? ''}`).join(' · ')}</td>
                    <td className="td"><Badge tone={PSTATUS[po.status].tone} dot>{PSTATUS[po.status].label}</Badge></td>
                    <td className="td whitespace-nowrap text-right">{canWrite && po.status === 'rascunho' && <Button size="sm" variant="outline" onClick={() => status.mutate({ id: po.id, status: 'enviado' })}>Marcar enviado</Button>}{canWrite && po.status === 'enviado' && <Button size="sm" icon={<PackageCheck className="size-4" />} onClick={() => confirm('Confirmar recebimento e dar entrada nos insumos?') && status.mutate({ id: po.id, status: 'recebido', items: po.items })}>Receber</Button>}{canWrite && po.status !== 'recebido' && po.status !== 'cancelado' && <Button size="sm" variant="ghost" className="text-danger" onClick={() => status.mutate({ id: po.id, status: 'cancelado' })}>Cancelar</Button>}</td></tr>
                ))}</tbody></Table>
            ) : <EmptyState icon={<ShoppingCart className="size-5" />} title="Nenhum pedido de compra" />}
          </Card>
        </div>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Editar insumo' : 'Novo insumo'} footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!editing?.name}>Salvar</Button></>}>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Referência"><Select value={editing.reference ?? 'insumo'} onChange={(e) => setEditing({ ...editing, reference: e.target.value as SupplyReference })}>{(Object.keys(SUPPLY_REFERENCE_LABEL) as SupplyReference[]).map((r) => <option key={r} value={r}>{SUPPLY_REFERENCE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Código" hint="Usado para identificar o item nas planilhas."><Input value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
            <Field label="Nome" className="sm:col-span-2"><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Unidade"><Select value={editing.unit ?? 'kg'} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}>{['kg', 'g', 'L', 'un', 'cx', 'pct'].map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label="Fornecedor"><Input value={editing.supplier ?? ''} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} /></Field>
            <Field label="Estoque atual"><Input type="number" step="0.01" value={editing.stock ?? 0} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} /></Field>
            <Field label="Estoque mínimo"><Input type="number" step="0.01" value={editing.min_stock ?? 0} onChange={(e) => setEditing({ ...editing, min_stock: Number(e.target.value) })} /></Field>
            <Field label="Custo por unidade (R$)"><Input type="number" step="0.01" value={editing.cost ?? ''} onChange={(e) => setEditing({ ...editing, cost: e.target.value ? Number(e.target.value) : null })} /></Field>
          </div>
        )}
      </Dialog>

      <ImportSheetDialog<SupplyImportRow>
        open={importing === 'insumos'}
        onClose={() => setImporting(null)}
        title="Importar matéria-prima / insumos"
        description="Identifica pelo código; sem código, pela referência + nome. Códigos que não estão na planilha não são mexidos."
        templateName="modelo-materia-prima.xlsx"
        modes={IMPORT_MODES}
        columns={[
          { key: 'reference', label: 'Referência', example: 'Matéria-prima' },
          { key: 'code', label: 'Código', example: 'MP-001' },
          { key: 'name', label: 'Nome do produto', example: 'Sal refinado', required: true },
          { key: 'stock', label: 'Quantidade', example: '250', required: true },
          { key: 'unit', label: 'Unidade', example: 'kg' },
          { key: 'cost', label: 'Custo unitário (R$)', example: '2,30' },
          { key: 'supplier', label: 'Fornecedor', example: 'Salinas Ltda' },
        ]}
        mapRow={(row, line) => {
          const name = pick(row, ['nome do produto', 'produto', 'nome', 'descricao', 'insumo', 'materia-prima', 'materia prima']);
          if (!name) return `Linha ${line}: sem nome do produto`;
          const qtyRaw = pick(row, ['quantidade', 'qtd', 'estoque', 'saldo']);
          if (!qtyRaw) return `Linha ${line}: sem quantidade (${name})`;
          const code = pick(row, ['codigo', 'cod', 'code']);
          return {
            code: code ? String(code).replace(/\.0+$/, '') : null,
            reference: parseReference(pick(row, ['referencia', 'ref', 'categoria', 'tipo']) || 'materia-prima'),
            name, unit: pick(row, ['unidade', 'un', 'unid']) || 'kg',
            stock: toNumber(qtyRaw, 0),
            cost: toNumber(pick(row, ['custo unitario (r$)', 'custo unitario', 'custo', 'preco']), NaN) || null,
            supplier: pick(row, ['fornecedor']) || null,
          };
        }}
        preview={(r) => [SUPPLY_REFERENCE_LABEL[r.reference], r.code ?? '—', r.name, fmtDec(r.stock), r.unit, r.cost != null ? fmtBRL(r.cost) : '—', r.supplier ?? '—']}
        onImport={async (rows, mode) => {
          const r = await importSupplies(mode as ImportMode, rows);
          await logActivity({ kind: 'estoque', title: `Planilha de matéria-prima importada (${mode})`, body: `${r.created} novo(s), ${r.updated} atualizado(s)${r.removed ? `, ${r.removed} removido(s)` : ''}`, link: '/insumos', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          invalidate();
          return `Importação concluída: ${r.created} cadastrado(s), ${r.updated} atualizado(s)${r.removed ? `, ${r.removed} removido(s) pela substituição` : ''}.`;
        }}
      />

      <ImportSheetDialog<ConsumptionImportRow>
        open={importing === 'consumo'}
        onClose={() => setImporting(null)}
        title="Importar consumo"
        description="Uma linha por saída ou por mês. O sistema agrupa por produto e mês, calcula a média mensal e a sugestão de compra (média − estoque atual)."
        templateName="modelo-consumo.xlsx"
        modes={IMPORT_MODES}
        columns={[
          { key: 'period', label: 'Data', example: '09/2026', required: true },
          { key: 'code', label: 'Código', example: 'MP-001' },
          { key: 'name', label: 'Produto', example: 'Sal refinado', required: true },
          { key: 'qty', label: 'Quantidade consumida', example: '180', required: true },
        ]}
        mapRow={(row, line) => {
          const rawDate = pick(row, ['data', 'mes', 'periodo', 'competencia']);
          const period = rawDate ? parsePeriod(rawDate) : null;
          if (!period) return `Linha ${line}: data inválida (${rawDate || 'vazia'})`;
          const name = pick(row, ['produto', 'nome', 'descricao', 'insumo', 'materia-prima', 'materia prima']);
          const code = pick(row, ['codigo', 'cod', 'code']);
          if (!name && !code) return `Linha ${line}: sem produto nem código`;
          const qty = toNumber(pick(row, ['quantidade consumida', 'quantidade', 'qtd', 'consumo', 'saida']), NaN);
          if (!Number.isFinite(qty)) return `Linha ${line}: quantidade inválida (${name || code})`;
          return { code: code ? String(code).replace(/\.0+$/, '') : null, name: name || '', period, qty };
        }}
        preview={(r) => [r.period.slice(0, 7).split('-').reverse().join('/'), r.code ?? '—', r.name || '—', fmtDec(r.qty)]}
        onImport={async (rows, mode) => {
          const r = await importConsumption(mode as ImportMode, rows);
          invalidate();
          const miss = r.unmatched.length ? ` ${r.unmatched.length} produto(s) não encontrado(s) no cadastro e ignorado(s): ${r.unmatched.slice(0, 5).join(', ')}${r.unmatched.length > 5 ? '…' : ''}.` : '';
          return `Consumo importado: ${r.created} mês(es) de produto gravado(s)${r.removed ? `, ${r.removed} registro(s) anteriores apagados` : ''}.${miss}`;
        }}
      />
    </>
  );
}
