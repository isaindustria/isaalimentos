import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, Dialog, Dropzone, EmptyState, Field, Input, Select, Table } from '@/components/primitives';
import { compararFormulas, lerFormulas, type Formula } from '@/domain/pcp';
import { excluirFormula, importarFormulas, salvarFormula, type Modo, type ProdutoPcp } from '@/api/pcp';
import { useAuth } from '@/hooks/useAuth';
import { EscolhaModo, lerAba, qtd, COMPACTA } from './comum';

/** Aba Fórmula: importar (Incluir/Substituir com as alterações na tela) e alterar à mão. */
export function AbaFormula({ formulas, produtos, pode }: { formulas: Formula[]; produtos: ProdutoPcp[]; pode: boolean }) {
  const [busca, setBusca] = useState('');
  const [importar, setImportar] = useState(false);
  const [editar, setEditar] = useState<Formula | null>(null);
  const nome = useMemo(() => new Map(produtos.map((p) => [p.code, p.description])), [produtos]);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return formulas.filter((f) => !b || String(f.code) === b || f.description.toLowerCase().includes(b) || (f.product_code ?? '') === b || f.items.some((i) => i.input_code === b));
  }, [formulas, busca]);
  const semLigacao = formulas.filter((f) => !f.product_code).length;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 p-4">
        <Input className="h-9 max-w-xs" placeholder="Buscar fórmula, produto ou insumo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="text-sm text-muted">{formulas.length} fórmula(s){semLigacao ? ` · ${semLigacao} sem produto ligado` : ''}</span>
        <div className="ml-auto flex gap-2">
          {pode && <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setEditar({ code: 0, description: '', product_code: null, min_production_kg: null, items: [] })}>Nova fórmula</Button>}
          {pode && <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setImportar(true)}>Importar fórmulas</Button>}
        </div>
      </div>
      {lista.length ? (
        <Table dense className={COMPACTA}>
          <thead><tr><th className="th">Cód. fórmula</th><th className="th">Descrição da fórmula</th><th className="th">Produto fabricado</th><th className="th text-right">Insumos</th><th className="th text-right">Prod. mínima</th><th className="th" /></tr></thead>
          <tbody>{lista.map((f) => (
            <tr key={f.code}>
              <td className="td num">{f.code}</td>
              <td className="td text-xs leading-snug">{f.description}{!/SEMI\s*-?\s*ACABADO/i.test(f.description.normalize('NFD').replace(/[̀-ͯ]/g, '')) && <Badge className="ml-2" tone="neutral">acabado · fracionamento (fase posterior)</Badge>}</td>
              <td className="td text-xs">{f.product_code ? <><b className="num">{f.product_code}</b> · {nome.get(f.product_code) ?? ''}</> : <Badge tone="warn">sem produto ligado</Badge>}</td>
              <td className="td num text-right">{f.items.length}</td>
              <td className="td num text-right">{f.min_production_kg ? `${qtd(f.min_production_kg)} kg` : 'pedido'}</td>
              <td className="td text-right"><Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditar(f)}>{pode ? 'Alterar' : 'Ver'}</Button></td>
            </tr>
          ))}</tbody>
        </Table>
      ) : <EmptyState title={formulas.length ? 'Nenhuma fórmula com essa busca' : 'Nenhuma fórmula cadastrada'} description="Importe a planilha de fórmulas: Cód Fórmula, Descrição da Fórmula, Cód do Insumo, Descrição do Insumo, Cód Unidade, Qtd Unitária Prevista e Produção mínima." />}
      <p className="px-5 py-3 text-xs text-muted">A quantidade do insumo é por 1 kg do semiacabado (no produto acabado, por unidade). Produção mínima em branco: produz a quantidade do pedido. O produto fabricado é ligado pelo nome na importação; corrija em Alterar quando não ligar.</p>
      {importar && <ImportarFormulas atuais={formulas} produtos={produtos} onClose={() => setImportar(false)} />}
      {editar && <EditarFormula f={editar} produtos={produtos} pode={pode} existe={formulas.some((x) => x.code === editar.code)} onClose={() => setEditar(null)} />}
    </Card>
  );
}

function ImportarFormulas({ atuais, produtos, onClose }: { atuais: Formula[]; produtos: ProdutoPcp[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [novas, setNovas] = useState<Formula[]>([]);
  const [modo, setModo] = useState<Modo | null>(null);
  const diff = useMemo(() => (modo && novas.length ? compararFormulas(atuais, novas, modo) : null), [atuais, novas, modo]);
  const run = useMutation({
    mutationFn: () => importarFormulas(novas, modo!, atuais, produtos, session?.user.id),
    onSuccess: (r) => { toast.success(`${r.gravadas} fórmula(s) gravadas.${r.semProduto ? ` ${r.semProduto} sem produto ligado: ligue em Alterar.` : ''}`, { duration: 8000 }); qc.invalidateQueries({ queryKey: ['pcp'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onClose={onClose} wide title="Importar fórmulas" description="Escolha Incluir ou Substituir e confira as alterações antes de gravar."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!diff} loading={run.isPending} onClick={() => run.mutate()}>Gravar</Button></>}>
      <div className="space-y-3">
        <Dropzone accept=".xlsx,.xls,.csv" file={file} label="Arraste a planilha de fórmulas" hint="Pode ser a planilha com várias abas: uso a que tem a coluna Cód Fórmula."
          onFile={async (f) => { setFile(f); try { const { matrix } = await lerAba(f, (l) => l.includes('cod formula') || l.includes('cód fórmula') || l.includes('cod fórmula')); const r = lerFormulas(matrix); setNovas(r.formulas); toast.success(`${r.formulas.length} fórmula(s) lidas.`); } catch (e) { setNovas([]); toast.error((e as Error).message); } }} />
        {novas.length > 0 && <EscolhaModo modo={modo} onChange={setModo} incluir="Acrescenta e atualiza as fórmulas da planilha; as que não vieram continuam." substituir="Fica só o que veio na planilha; as fórmulas que não vieram são apagadas." />}
        {diff && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone="ok">{diff.novas.length} nova(s)</Badge><Badge tone="info">{diff.alteradas.length} alterada(s)</Badge><Badge>{diff.iguais} igual(is)</Badge>{modo === 'substituir' && <Badge tone="danger">{diff.removidas.length} apagada(s)</Badge>}</div>
            <div className="max-h-72 overflow-auto rounded-xl border border-line">
              <ul className="divide-y divide-line">
                {diff.novas.slice(0, 100).map((f) => <li key={'n' + f.code} className="px-3 py-1.5"><Badge tone="ok">nova</Badge> <b className="num">{f.code}</b> {f.description} · {f.items.length} insumo(s)</li>)}
                {diff.alteradas.slice(0, 200).map((a) => <li key={'a' + a.depois.code} className="px-3 py-1.5"><Badge tone="info">alterada</Badge> <b className="num">{a.depois.code}</b> {a.depois.description}<div className="text-xs text-muted">{a.mudancas.join(' · ')}</div></li>)}
                {diff.removidas.slice(0, 100).map((f) => <li key={'r' + f.code} className="px-3 py-1.5"><Badge tone="danger">apagada</Badge> <b className="num">{f.code}</b> {f.description}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function EditarFormula({ f, produtos, pode, existe, onClose }: { f: Formula; produtos: ProdutoPcp[]; pode: boolean; existe: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [d, setD] = useState<Formula>(() => ({ ...f, items: f.items.map((i) => ({ ...i })) }));
  const [codigo, setCodigo] = useState(f.code ? String(f.code) : '');
  const done = () => { qc.invalidateQueries({ queryKey: ['pcp'] }); onClose(); };
  const salvar = useMutation({
    mutationFn: () => {
      const code = Number(codigo);
      if (!Number.isInteger(code) || code <= 0) throw new Error('Informe o código da fórmula.');
      if (!d.description.trim()) throw new Error('Informe a descrição da fórmula.');
      const items = d.items.filter((i) => i.input_code.trim() && Number(i.qty) > 0).map((i) => ({ ...i, input_code: i.input_code.trim(), qty: Number(i.qty) }));
      return salvarFormula({ ...d, code, description: d.description.trim(), items }, session?.user.id);
    },
    onSuccess: () => { toast.success('Fórmula salva.'); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: () => excluirFormula(f.code), onSuccess: () => { toast.success('Fórmula apagada.'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const set = (k: number, p: Partial<Formula['items'][number]>) => setD((x) => ({ ...x, items: x.items.map((i, j) => (j === k ? { ...i, ...p } : i)) }));
  const nomeInsumo = new Map(produtos.map((p) => [p.code, p.description]));
  return (
    <Dialog open onClose={onClose} wide title={existe ? `Fórmula ${f.code}` : 'Nova fórmula'}
      footer={pode ? <>
        {existe && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} loading={del.isPending} onClick={() => confirm(`Apagar a fórmula ${f.code}?`) && del.mutate()}>Apagar</Button>}
        <Button variant="outline" onClick={onClose}>Cancelar</Button><Button loading={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
      </> : <Button variant="outline" onClick={onClose}>Fechar</Button>}>
      <fieldset disabled={!pode} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[120px_1fr_140px]">
          <Field label="Cód. fórmula"><Input inputMode="numeric" value={codigo} readOnly={existe} className={existe ? 'bg-surface-2' : ''} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Descrição da fórmula"><Input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field>
          <Field label="Prod. mínima (kg)" hint="Em branco: o pedido"><Input inputMode="decimal" value={d.min_production_kg ?? ''} onChange={(e) => { const v = e.target.value.replace(',', '.'); setD({ ...d, min_production_kg: v === '' ? null : Number(v) }); }} /></Field>
        </div>
        <Field label="Produto que a fórmula fabrica">
          <Select value={d.product_code ?? ''} onChange={(e) => setD({ ...d, product_code: e.target.value || null })}>
            <option value="">— sem produto ligado —</option>
            {produtos.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
          </Select>
        </Field>
        <Table dense>
          <thead><tr><th className="th">Cód. insumo</th><th className="th">Descrição do insumo</th><th className="th">Un.</th><th className="th text-right">Qtd. prevista</th><th className="th" /></tr></thead>
          <tbody>{d.items.map((i, k) => (
            <tr key={k}>
              <td className="td"><Input className="h-8 w-24" value={i.input_code} onChange={(e) => set(k, { input_code: e.target.value, input_description: i.input_description || nomeInsumo.get(e.target.value.trim()) || null })} /></td>
              <td className="td text-xs">{i.input_description ?? nomeInsumo.get(i.input_code) ?? '—'}</td>
              <td className="td text-xs">{i.unit ?? 'KG'}</td>
              <td className="td"><Input className="h-8 w-28 text-right" inputMode="decimal" value={String(i.qty)} onChange={(e) => set(k, { qty: e.target.value.replace(',', '.') as unknown as number })} /></td>
              <td className="td"><button type="button" aria-label={`Tirar o insumo ${i.input_code}`} className="text-muted hover:text-danger" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== k) })}><Trash2 className="size-4" /></button></td>
            </tr>
          ))}</tbody>
        </Table>
        <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setD({ ...d, items: [...d.items, { input_code: '', input_description: null, unit: 'KG', qty: 0 }] })}>Adicionar insumo</Button>
      </fieldset>
    </Dialog>
  );
}
