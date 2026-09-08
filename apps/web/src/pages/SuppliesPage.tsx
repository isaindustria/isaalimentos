import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, FlaskConical, Upload, Boxes, TrendingUp, AlertTriangle, Download, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { computePurchasePlan, deleteSupply, importConsumption, importSupplyCatalog, importSupplyStock, listConsumption, listSupplies, saveSupply, type ConsumptionImportRow, type ImportMode, type SupplyCatalogImportRow, type SupplyStockImportRow } from '@/api/v14';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Table, Tabs } from '@/components/primitives';
import { ImportSheetDialog } from '@/components/ImportSheetDialog';
import { pick, toNumber } from '@/domain/parsers/sheet';
import { downloadBlob, fmtBRL, fmtDec, fmtKg } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { SUPPLY_REFERENCE_LABEL, type Supply, type SupplyReference } from '@/lib/types';

const IMPORT_MODES = [
  { value: 'incluir', label: 'Incluir planilha', description: 'Mantém o que já existe. Quem aparece na planilha tem os dados substituídos (não soma); novos são cadastrados.' },
  { value: 'substituir', label: 'Substituir planilha', description: 'Apaga os dados anteriores dessa categoria e grava só o que está na planilha.' },
];

function parseReference(raw: string): SupplyReference {
  const t = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
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

const REFERENCES = Object.keys(SUPPLY_REFERENCE_LABEL) as SupplyReference[];

/** Chips de seleção múltipla; nenhum marcado = exibir todas as referências. */
function ReferenceFilter({ value, onChange }: { value: SupplyReference[]; onChange: (v: SupplyReference[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={() => onChange([])} className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${value.length === 0 ? 'border-brand bg-brand text-brand-ink' : 'border-line text-muted hover:bg-surface-2'}`}>
        Todas
      </button>
      {REFERENCES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])}
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${value.includes(r) ? 'border-brand bg-brand text-brand-ink' : 'border-line text-muted hover:bg-surface-2'}`}
        >
          {SUPPLY_REFERENCE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

export default function SuppliesPage() {
  const qc = useQueryClient();
  const { canWriteArea, session, profile } = useAuth();
  const [view, setView] = useState<'cadastro' | 'estoque'>('cadastro');
  const [editing, setEditing] = useState<Partial<Supply> | null>(null);
  const [importing, setImporting] = useState<'cadastro' | 'estoque' | 'consumo' | null>(null);
  const [refFilter, setRefFilter] = useState<SupplyReference[]>([]);
  const [search, setSearch] = useState('');

  const supplies = useQuery({ queryKey: ['supplies'], queryFn: listSupplies });
  const consumption = useQuery({ queryKey: ['supply-consumption'], queryFn: listConsumption });
  const invalidate = () => ['supplies', 'supply-consumption'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const save = useMutation({ mutationFn: () => saveSupply(editing as Supply), onSuccess: () => { toast.success('Item salvo.'); invalidate(); setEditing(null); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: deleteSupply, onSuccess: () => { toast.success('Item removido.'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const plan = useMemo(() => computePurchasePlan(supplies.data ?? [], consumption.data ?? []), [supplies.data, consumption.data]);
  const fold = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(search.trim());
  const visible = (supplies.data ?? []).filter((s) => (!refFilter.length || refFilter.includes(s.reference)) && (!q || fold(s.code).includes(q) || fold(s.name).includes(q) || fold(SUPPLY_REFERENCE_LABEL[s.reference]).includes(q) || fold(s.supplier).includes(q)));
  const review = [...plan.values()].filter((p) => p.needsReview).length;

  const canWrite = canWriteArea('compras');

  function exportXlsx() {
    const monthLabel = (p: string | null) => (p ? p.slice(0, 7).split('-').reverse().join('/') : '');
    const data = visible.map((s) => {
      const p = plan.get(s.id);
      return {
        'Referência': SUPPLY_REFERENCE_LABEL[s.reference],
        'Código': s.code ?? '',
        'Nome do produto': s.name,
        'Estoque 2 (kg)': Number(s.stock2),
        'Estoque 6 (kg)': Number(s.stock6),
        'Estoque total (kg)': Number(s.stock),
        'Média de consumo mensal (kg)': p ? Number(p.avgMonthly.toFixed(3)) : '',
        [`Consumo do último mês (kg)${plan.size ? ` · ${monthLabel([...plan.values()][0].lastMonth)}` : ''}`]: p ? Number(p.lastMonthQty.toFixed(3)) : '',
        'Sugestão de compra (meses)': p?.coverageMonths ?? '',
        'Conferir': p?.needsReview ? 'sim' : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Controle de estoque');
    downloadBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `controle-de-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <>
      <PageHeader
        title="Insumos e compras"
        description="Cadastro de matéria-prima separado do controle de estoque. A sugestão de compra sai sozinha do consumo importado."
        actions={canWrite && (
          <>
            <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImporting('cadastro')}>Importar cadastro</Button>
            <Button variant="outline" icon={<Boxes className="size-4" />} onClick={() => setImporting('estoque')}>Importar estoque atual</Button>
            <Button variant="outline" icon={<TrendingUp className="size-4" />} onClick={() => setImporting('consumo')}>Importar consumo</Button>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={exportXlsx} disabled={!visible.length}>Exportar planilha</Button>
          </>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onChange={setView} items={[{ value: 'cadastro', label: 'Cadastro de matéria-prima', count: supplies.data?.length }, { value: 'estoque', label: 'Controle de estoque' }]} />
        {review > 0 && <Badge tone="danger" dot>{review} sugestão(ões) para conferir</Badge>}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Buscar por código, nome ou referência" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <ReferenceFilter value={refFilter} onChange={setRefFilter} />
      </div>

      {view === 'cadastro' && (
        <Card padded={false}>
          {visible.length ? (
            <Table>
              <thead><tr><th className="th">Referência</th><th className="th">Código</th><th className="th">Nome do produto</th><th className="th">Unidade</th><th className="th text-right">Custo</th><th className="th">Fornecedor</th><th className="th" /></tr></thead>
              <tbody>{visible.map((s) => (
                <tr key={s.id}>
                  <td className="td"><Badge tone={s.reference === 'materia_prima' ? 'brand' : 'neutral'}>{SUPPLY_REFERENCE_LABEL[s.reference]}</Badge></td>
                  <td className="td font-mono text-xs text-muted">{s.code ?? '—'}</td>
                  <td className="td font-medium">{s.name}</td>
                  <td className="td text-muted">{s.unit}</td>
                  <td className="td num text-right">{s.cost != null ? fmtBRL(s.cost) : '—'}</td>
                  <td className="td text-muted">{s.supplier ?? '—'}</td>
                  <td className="td text-right whitespace-nowrap">{canWrite && <><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Editar</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Remover item do cadastro?') && remove.mutate(s.id)} /></>}</td>
                </tr>
              ))}</tbody>
            </Table>
          ) : <EmptyState icon={<FlaskConical className="size-5" />} title="Nenhum item cadastrado" description="Use Importar cadastro para trazer referência, código e nome da planilha." />}
        </Card>
      )}

      {view === 'estoque' && (
        <Card padded={false}>
          {visible.length ? (
            <Table>
              <thead><tr><th className="th">Referência</th><th className="th">Código</th><th className="th">Nome do produto</th><th className="th text-right">Estoque 2 (kg)</th><th className="th text-right">Estoque 6 (kg)</th><th className="th text-right">Estoque total (kg)</th><th className="th text-right">Média consumo/mês (kg)</th><th className="th text-right">Consumo último mês (kg)</th><th className="th text-right">Sugestão de compra (meses)</th></tr></thead>
              <tbody>{visible.map((s) => { const p = plan.get(s.id); return (
                <tr key={s.id} className={p?.coverageMonths === 0 ? 'bg-danger/5' : ''}>
                  <td className="td"><Badge tone={s.reference === 'materia_prima' ? 'brand' : 'neutral'}>{SUPPLY_REFERENCE_LABEL[s.reference]}</Badge></td>
                  <td className="td font-mono text-xs text-muted">{s.code ?? '—'}</td>
                  <td className="td font-medium">{s.name}</td>
                  <td className="td num text-right text-muted">{fmtKg(s.stock2)}</td>
                  <td className="td num text-right text-muted">{fmtKg(s.stock6)}</td>
                  <td className="td num text-right font-semibold">{fmtKg(s.stock)}</td>
                  <td className="td num text-right text-muted">{p ? <>{fmtKg(p.avgMonthly)} <span className="text-xs">({p.months} {p.months === 1 ? 'mês' : 'meses'})</span></> : '—'}</td>
                  <td className="td num text-right text-muted">{p ? <>{fmtKg(p.lastMonthQty)} <span className="text-xs">({p.lastMonth?.slice(0, 7).split('-').reverse().join('/')})</span></> : '—'}</td>
                  <td className="td num text-right">{p && p.coverageMonths != null ? <span className={`inline-flex items-center justify-end gap-1 font-bold ${p.coverageMonths === 0 ? 'text-danger' : p.coverageMonths <= 1 ? 'text-brand' : 'text-ok'}`}>{p.needsReview && <span title={`Oscilou ${Math.round(p.maxSwing * 100)}% entre meses: conferir manualmente`}><AlertTriangle className="size-3.5 text-danger" /></span>}{p.coverageMonths === 0 ? '0 · comprar agora' : `${p.coverageMonths} ${p.coverageMonths === 1 ? 'mês' : 'meses'}`}</span> : <span className="text-xs text-muted">sem consumo</span>}</td>
                </tr>); })}</tbody>
            </Table>
          ) : <EmptyState icon={<Boxes className="size-5" />} title="Nenhum estoque calculado" description="Use Importar estoque atual para somar os locais 2 e 6 por código." />}
        </Card>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Editar item" footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!editing?.name}>Salvar</Button></>}>
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Referência"><Select value={editing.reference ?? 'insumo'} onChange={(e) => setEditing({ ...editing, reference: e.target.value as SupplyReference })}>{REFERENCES.map((r) => <option key={r} value={r}>{SUPPLY_REFERENCE_LABEL[r]}</option>)}</Select></Field>
            <Field label="Código" hint="Usado para identificar o item nas planilhas."><Input value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></Field>
            <Field label="Nome" className="sm:col-span-2"><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Unidade"><Select value={editing.unit ?? 'kg'} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}>{['kg', 'g', 'L', 'un', 'cx', 'pct'].map((u) => <option key={u}>{u}</option>)}</Select></Field>
            <Field label="Fornecedor"><Input value={editing.supplier ?? ''} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} /></Field>
            <Field label="Custo por unidade (R$)"><Input type="number" step="0.01" value={editing.cost ?? ''} onChange={(e) => setEditing({ ...editing, cost: e.target.value ? Number(e.target.value) : null })} /></Field>
          </div>
        )}
      </Dialog>

      <ImportSheetDialog<SupplyCatalogImportRow>
        open={importing === 'cadastro'}
        onClose={() => setImporting(null)}
        title="Importar cadastro"
        description="Grava referência, código e nome do produto. Nunca mexe no estoque atual."
        templateName="modelo-cadastro-materia-prima.xlsx"
        modes={IMPORT_MODES}
        columns={[
          { key: 'reference', label: 'Referência', example: 'Matéria-prima' },
          { key: 'code', label: 'Código', example: 'MP-001', required: true },
          { key: 'name', label: 'Nome do produto', example: 'Sal refinado', required: true },
          { key: 'unit', label: 'Unidade', example: 'kg' },
          { key: 'cost', label: 'Custo unitário (R$)', example: '2,30' },
          { key: 'supplier', label: 'Fornecedor', example: 'Salinas Ltda' },
        ]}
        mapRow={(row, line) => {
          const name = pick(row, ['nome do produto', 'produto', 'nome', 'descricao']);
          if (!name) return `Linha ${line}: sem nome do produto`;
          const code = pick(row, ['codigo', 'cod', 'code']);
          if (!code) return `Linha ${line}: sem código (${name})`;
          return {
            code: String(code).replace(/\.0+$/, ''),
            reference: parseReference(pick(row, ['referencia', 'ref', 'categoria', 'tipo']) || 'materia-prima'),
            name, unit: pick(row, ['unidade', 'un', 'unid']) || 'kg',
            cost: toNumber(pick(row, ['custo unitario (r$)', 'custo unitario', 'custo', 'preco']), NaN) || null,
            supplier: pick(row, ['fornecedor']) || null,
          };
        }}
        preview={(r) => [SUPPLY_REFERENCE_LABEL[r.reference], r.code ?? '—', r.name, r.unit, r.cost != null ? fmtBRL(r.cost) : '—', r.supplier ?? '—']}
        onImport={async (rows, mode) => {
          const r = await importSupplyCatalog(mode as ImportMode, rows);
          await logActivity({ kind: 'estoque', title: `Cadastro de matéria-prima importado (${mode})`, body: `${r.created} novo(s), ${r.updated} atualizado(s)${r.removed ? `, ${r.removed} removido(s)` : ''}`, link: '/insumos', actor_id: session?.user.id, actor_name: profile?.name ?? null });
          invalidate();
          return `Cadastro importado: ${r.created} novo(s), ${r.updated} atualizado(s)${r.removed ? `, ${r.removed} removido(s) pela substituição` : ''}.`;
        }}
      />

      <ImportSheetDialog<SupplyStockImportRow>
        open={importing === 'estoque'}
        onClose={() => setImporting(null)}
        title="Importar estoque atual"
        description="Soma as quantidades dos locais 2 e 6 por código. Códigos que não estão no cadastro ficam sinalizados, sem associar por nome."
        templateName="modelo-estoque-materia-prima.xlsx"
        modes={IMPORT_MODES}
        columns={[
          { key: 'code', label: 'Código', example: 'MP-001', required: true },
          { key: 'name', label: 'Nome do produto', example: 'Sal refinado' },
          { key: 'location', label: 'Local de estoque', example: '2', required: true },
          { key: 'qty', label: 'Quantidade', example: '120', required: true },
        ]}
        mapRow={(row, line) => {
          const code = pick(row, ['codigo', 'cod', 'code']);
          if (!code) return `Linha ${line}: sem código`;
          const location = toNumber(pick(row, ['local de estoque', 'local', 'deposito', 'loja']), NaN);
          if (!Number.isFinite(location)) return `Linha ${line}: sem local de estoque (${code})`;
          const qty = toNumber(pick(row, ['quantidade', 'qtd', 'saldo']), NaN);
          if (!Number.isFinite(qty)) return `Linha ${line}: quantidade inválida (${code})`;
          return { code: String(code).replace(/\.0+$/, ''), name: pick(row, ['nome do produto', 'produto', 'nome', 'descricao']) || '', location, qty };
        }}
        preview={(r) => [r.code, r.name || '—', String(r.location), fmtDec(r.qty)]}
        onImport={async (rows, mode) => {
          const ignored = rows.filter((r) => r.location !== 2 && r.location !== 6).length;
          const r = await importSupplyStock(mode as ImportMode, rows);
          invalidate();
          const miss = r.unmatched.length ? ` ${r.unmatched.length} código(s) não encontrado(s) no cadastro (não associado por nome): ${r.unmatched.slice(0, 5).join(', ')}${r.unmatched.length > 5 ? '…' : ''}.` : '';
          const ig = ignored ? ` ${ignored} linha(s) de outros locais de estoque ignorada(s).` : '';
          return `Estoque atualizado: ${r.updated} produto(s).${ig}${miss}`;
        }}
      />

      <ImportSheetDialog<ConsumptionImportRow>
        open={importing === 'consumo'}
        onClose={() => setImporting(null)}
        title="Importar consumo"
        description="Aceita a exportação da fábrica (CONSUMO FABRICA MP): uma linha por nota. O sistema soma a Quantidade Estoque por Código Produto, conta os meses distintos da Data Emissão e calcula a média mensal (total ÷ meses). Identifica só pelo código."
        templateName="modelo-consumo.xlsx"
        modes={IMPORT_MODES}
        columns={[
          { key: 'period', label: 'Data Emissão', example: '03/09/2025', required: true },
          { key: 'code', label: 'Código Produto', example: '16', required: true },
          { key: 'name', label: 'Descrição do Produto', example: 'MP ACIDO CITRICO' },
          { key: 'qty', label: 'Quantidade Estoque', example: '0,155', required: true },
        ]}
        mapRow={(row, line) => {
          const rawDate = pick(row, ['data emissao', 'data', 'mes', 'periodo', 'competencia']);
          const period = rawDate ? parsePeriod(rawDate) : null;
          if (!period) return `Linha ${line}: data inválida (${rawDate || 'vazia'})`;
          const code = pick(row, ['codigo produto', 'codigo', 'cod', 'code']);
          if (!code) return `Linha ${line}: sem código do produto`;
          const name = pick(row, ['descricao do produto', 'descricao', 'nome do produto', 'nome', 'insumo', 'materia-prima', 'materia prima', 'produto']);
          const qty = toNumber(pick(row, ['quantidade estoque', 'quantidade consumida', 'quantidade', 'qtd', 'consumo', 'saida']), NaN);
          if (!Number.isFinite(qty)) return `Linha ${line}: quantidade inválida (${name || code})`;
          return { code: String(code).replace(/\.0+$/, ''), name: name || '', period, qty };
        }}
        preview={(r) => [r.period.slice(0, 7).split('-').reverse().join('/'), r.code ?? '—', r.name || '—', fmtKg(r.qty)]}
        onImport={async (rows, mode) => {
          const r = await importConsumption(mode as ImportMode, rows);
          invalidate();
          const miss = r.unmatched.length ? ` ${r.unmatched.length} código(s) não encontrado(s) no cadastro e ignorado(s) (nunca associado por nome): ${r.unmatched.slice(0, 5).join(', ')}${r.unmatched.length > 5 ? '…' : ''}.` : '';
          return `Consumo importado: ${r.created} mês(es) de produto gravado(s)${r.removed ? `, ${r.removed} registro(s) anteriores apagados` : ''}.${miss}`;
        }}
      />
    </>
  );
}
