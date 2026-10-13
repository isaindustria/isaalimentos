import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Undo2, X } from 'lucide-react';
import { Badge, Button, Dialog, Dropzone, Input, Select, Table } from '@/components/primitives';
import { readSheetText, normalizeHeader } from '@/domain/parsers/sheet';
import { CUSTOMER_FIELDS, FIELD_LABEL, autoMap, buildPreview, toPayload, type CustomerField, type ImportRow, type Mapping } from '@/domain/customerImport';
import { fmtCnpj } from '@/domain/sales';
import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, Profile } from '@/lib/types';

const TONE = { nova: 'ok', existente: 'info', duplicada: 'warn', divergente: 'warn', erro: 'danger' } as const;
const LABEL = { nova: 'Nova', existente: 'Já existe', duplicada: 'Duplicada', divergente: 'Divergente', erro: 'Erro' } as const;
type Filtro = 'todas' | 'problemas' | 'nova' | 'existente' | 'fora';

/**
 * Importar cadastro de clientes de qualquer Excel (sem modelo):
 * 1) arquivo, 2) o sistema reconhece as colunas e o ADM confere/indica as que faltam,
 * 3) conferência com duplicidades e divergências, que podem ser corrigidas ou tiradas antes de gravar.
 */
export function CustomerImportDialog({ open, onClose, existing, sellers, onDone }: { open: boolean; onClose: () => void; existing: Customer[]; sellers: Profile[]; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<{ headers: string[]; rows: Record<string, string>[]; lines: number[] } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<number, Partial<Record<CustomerField, string>>>>({});
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [filter, setFilter] = useState<Filtro>('todas');
  const [busy, setBusy] = useState(false);

  function reset() { setFile(null); setSheet(null); setMapping({}); setStep(1); setError(''); setEdits({}); setExcluded(new Set()); setConfirmUpdate(false); setFilter('todas'); onClose(); }

  async function onFile(f: File) {
    setFile(f); setError('');
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setSheet(null); setError('O arquivo precisa ser Excel (.xlsx ou .xls) ou CSV.'); return; }
    try {
      const s = readSheetText(await f.arrayBuffer());
      if (!s.rows.length) { setSheet(null); setError('Não achei linhas com dados na primeira aba da planilha.'); return; }
      setSheet(s); setMapping(autoMap(s.headers, s.rows)); setEdits({}); setExcluded(new Set()); setStep(2);
    } catch (e) { setSheet(null); setError(`Não foi possível ler o arquivo: ${(e as Error).message}`); }
  }

  const cols = useMemo(() => (sheet?.headers ?? []).filter(Boolean).map((h) => ({ head: h, key: normalizeHeader(h), sample: (sheet?.rows ?? []).map((r) => r[normalizeHeader(h)]).filter(Boolean).slice(0, 2) })), [sheet]);
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const repeated = CUSTOMER_FIELDS.filter((f) => Object.values(mapping).filter((v) => v === f.key).length > 1).map((f) => f.label);
  const mapErrors = [
    !mapped.has('name') && 'Indique a coluna do nome do cliente.',
    !mapped.has('code') && !mapped.has('cnpj') && 'Indique a coluna do código do cliente ou do CNPJ (um dos dois identifica o cliente).',
    repeated.length > 0 && `Mais de uma coluna marcada como: ${repeated.join(', ')}. Deixe só uma.`,
  ].filter(Boolean) as string[];

  const preview = useMemo(() => (sheet && step === 3 ? buildPreview(sheet.rows, sheet.lines, mapping, existing, sellers, edits, excluded) : []), [sheet, step, mapping, existing, sellers, edits, excluded]);
  const problem = (r: ImportRow) => ['erro', 'duplicada', 'divergente'].includes(r.status);
  const n = {
    nova: preview.filter((r) => r.include && r.status === 'nova').length,
    atualizar: preview.filter((r) => r.include && r.status === 'existente' && r.changes.length).length,
    fora: preview.filter((r) => !r.include).length,
  };
  const shown = preview.filter((r) => filter === 'todas' || (filter === 'problemas' ? problem(r) : filter === 'fora' ? !r.include : r.include && r.status === filter));
  const canImport = n.nova > 0 || (n.atualizar > 0 && confirmUpdate);

  const edit = (line: number, f: CustomerField, v: string) => setEdits((e) => ({ ...e, [line]: { ...e[line], [f]: v } }));
  const toggle = (line: number, out: boolean) => setExcluded((s) => { const x = new Set(s); if (out) x.add(line); else x.delete(line); return x; });

  async function commit() {
    setBusy(true);
    try {
      const novas = preview.filter((r) => r.include && r.status === 'nova').map((r) => toPayload(r, true));
      const upd = confirmUpdate ? preview.filter((r) => r.include && r.status === 'existente' && r.changes.length) : [];
      for (let i = 0; i < novas.length; i += 200) unwrap(await supabase.from('customers').insert(novas.slice(i, i + 200)));
      for (const r of upd) unwrap(await supabase.from('customers').update({ ...toPayload(r, false), updated_at: new Date().toISOString() }).eq('id', r.existingId!));
      toast.success(`Importação concluída: ${novas.length} incluído(s), ${upd.length} atualizado(s), ${preview.length - novas.length - upd.length} sem mudança ou fora.`, { duration: 8000 });
      onDone(); reset();
    } catch (e) { toast.error(`Não foi possível importar: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  const footer = step === 1 ? <Button variant="outline" onClick={reset}>Cancelar</Button>
    : step === 2 ? <><Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(1)}>Trocar arquivo</Button><Button disabled={mapErrors.length > 0} icon={<ArrowRight className="size-4" />} onClick={() => setStep(3)}>Conferir clientes</Button></>
    : <><Button variant="outline" icon={<ArrowLeft className="size-4" />} onClick={() => setStep(2)}>Voltar às colunas</Button><Button onClick={commit} loading={busy} disabled={!canImport || busy} icon={<CheckCircle2 className="size-4" />}>Importar</Button></>;

  return (
    <Dialog open={open} onClose={reset} wide title="Importar cadastro de clientes" footer={footer}
      description={step === 1 ? 'Use a planilha do jeito que ela sai do seu sistema: o ISA reconhece as colunas. Nada é apagado e nenhum cadastro existente muda sem a sua confirmação.' : step === 2 ? 'Confira as colunas reconhecidas e escolha o campo das que ficaram sem campo. Colunas em "Ignorar" não são importadas.' : 'Confira antes de gravar. Corrija ou tire da importação as linhas com duplicidade ou divergência.'}>
      {step === 1 && (
        <div className="space-y-3">
          <Dropzone accept=".xlsx,.xls,.csv" onFile={onFile} file={file} label="Arraste a planilha de clientes ou clique para escolher" hint="Qualquer Excel com uma linha de títulos. O código do cliente é mantido como está, com os zeros à esquerda." />
          {error && <p className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">{file?.name} · {sheet?.rows.length} linha(s)</p>
          <div className="max-h-[50vh] overflow-auto rounded-xl border border-line">
            <Table dense>
              <thead><tr><th className="th">Coluna da planilha</th><th className="th">Exemplo</th><th className="th">Campo no ISA</th></tr></thead>
              <tbody>
                {cols.map((c) => (
                  <tr key={c.key}>
                    <td className="td font-medium">{c.head}{!mapping[c.key] && <Badge tone="warn" className="ml-2">sem campo</Badge>}</td>
                    <td className="td max-w-[220px] truncate text-xs text-muted" title={c.sample.join(' | ')}>{c.sample.join(' | ') || '—'}</td>
                    <td className="td">
                      <Select className="h-8 w-56" aria-label={`Campo da coluna ${c.head}`} value={mapping[c.key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [c.key]: e.target.value as CustomerField | '' }))}>
                        <option value="">Ignorar</option>
                        {CUSTOMER_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          {mapErrors.map((m) => <p key={m} className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{m}</p>)}
          <p className="text-xs text-muted">Obrigatórios: nome do cliente e código ou CNPJ. Desconto financeiro: escolha a coluna em Campo no ISA (ex.: 3% ou 3%;1%). Sem as colunas Vendedor ou Desconto, esses dados ficam como estão e podem ser ajustados depois em Ver clientes.</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {([['todas', `Todas ${preview.length}`], ['nova', `Novas ${n.nova}`], ['existente', `Já existem ${preview.filter((r) => r.include && r.status === 'existente').length}`], ['problemas', `Duplicidades e erros ${preview.filter(problem).length}`], ['fora', `Fora da importação ${n.fora}`]] as Array<[Filtro, string]>).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 ${filter === k ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line'}`}>{l}</button>
            ))}
          </div>
          {n.atualizar > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
              <input type="checkbox" className="mt-1 accent-brand" checked={confirmUpdate} onChange={(e) => setConfirmUpdate(e.target.checked)} />
              <span><b>Atualizar {n.atualizar} cliente(s) que já existem com as mudanças mostradas</b><span className="block text-xs text-muted">Sem marcar, só os clientes novos são incluídos. Campo vazio na planilha não apaga o que já está no cadastro.</span></span>
            </label>
          )}
          <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
            <Table dense>
              <thead><tr><th className="th">Linha</th><th className="th">Situação</th><th className="th">Código</th><th className="th">Cliente</th><th className="th">CNPJ</th><th className="th">Vendedor / desconto</th><th className="th">Motivo / mudanças</th><th className="th" /></tr></thead>
              <tbody>
                {shown.map((r) => {
                  const fix = problem(r);
                  return (
                    <tr key={r.line} className={r.include ? '' : 'opacity-60'}>
                      <td className="td num text-muted">{r.line}</td>
                      <td className="td">{r.include || fix ? <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge> : <Badge tone="neutral">Fora</Badge>}</td>
                      <td className="td">{fix ? <Input className="h-8 w-24 font-mono" aria-label={`Código da linha ${r.line}`} defaultValue={r.values.code ?? ''} onBlur={(e) => e.target.value !== (r.values.code ?? '') && edit(r.line, 'code', e.target.value)} /> : <span className="font-mono text-xs">{r.values.code ?? '—'}</span>}</td>
                      <td className="td">{fix ? <Input className="h-8 w-52" aria-label={`Nome da linha ${r.line}`} defaultValue={r.values.name ?? ''} onBlur={(e) => e.target.value !== (r.values.name ?? '') && edit(r.line, 'name', e.target.value)} /> : <span className="text-sm">{r.values.name}</span>}</td>
                      <td className="td">{fix ? <Input className="h-8 w-40 font-mono" aria-label={`CNPJ da linha ${r.line}`} defaultValue={r.values.cnpj ?? ''} onBlur={(e) => e.target.value.replace(/\D/g, '') !== (r.values.cnpj ?? '') && edit(r.line, 'cnpj', e.target.value)} /> : <span className="font-mono text-xs">{r.values.cnpj ? fmtCnpj(r.values.cnpj) : '—'}</span>}</td>
                      <td className="td text-xs">{r.values.seller || '—'}<div className="text-muted">{r.discounts ? (r.discounts.length ? r.discounts.map((d) => `${String(d).replace('.', ',')}%`).join(' · ') : 'sem desconto') : 'desconto: não veio na planilha'}</div></td>
                      <td className="td text-xs">
                        {r.reason && <div className={r.status === 'erro' ? 'text-danger' : 'text-warn'}>{r.reason}</div>}
                        {r.changes.map((c) => <div key={c}>{c}</div>)}
                        {r.status === 'existente' && !r.changes.length && <div className="text-muted">sem mudanças</div>}
                        {r.warning && <div className="text-warn">{r.warning}</div>}
                      </td>
                      <td className="td text-right">
                        {excluded.has(r.line)
                          ? <button type="button" className="inline-flex items-center gap-1 text-xs text-brand" onClick={() => toggle(r.line, false)}><Undo2 className="size-3.5" />Voltar</button>
                          : <button type="button" className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger" onClick={() => toggle(r.line, true)} aria-label={`Tirar a linha ${r.line} da importação`}><X className="size-3.5" />Tirar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <p className="text-xs text-muted">Corrija código, nome ou CNPJ direto na linha com problema: a conferência é refeita na hora. Campos reconhecidos: {[...mapped].map((f) => FIELD_LABEL[f as CustomerField]).join(', ')}.</p>
        </div>
      )}
    </Dialog>
  );
}
