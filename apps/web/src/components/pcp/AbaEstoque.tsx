import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Upload } from 'lucide-react';
import { Badge, Button, Card, Dialog, Dropzone, EmptyState, Input, Table } from '@/components/primitives';
import { parseStockWorkbook, type StockParseResult } from '@/domain/parsers/stockXlsx';
import { compararEstoque, importarEstoque, type LinhaEstoque, type Modo } from '@/api/pcp';
import type { EstoqueLocal } from '@/domain/pcp';
import { fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Chips, EscolhaModo, lerAba, qtd, soAba } from './comum';

/**
 * Aba Estoque: código, referência, nome, unidade e os locais 1 (venda, UN), 2 (MP e semiacabado, kg) e 5 (venda, UN).
 * Unidade e pote no local 2 é erro (fica marcado). Em ordem alfabética do nome.
 */
export function AbaEstoque({ linhas, mapa, importadoEm, pode }: { linhas: LinhaEstoque[]; mapa: Map<string, EstoqueLocal>; importadoEm: string | null; pode: boolean }) {
  const [refs, setRefs] = useState<Set<string>>(new Set());
  const [locais, setLocais] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');
  const [importar, setImportar] = useState(false);
  const referencias = useMemo(() => [...new Set(linhas.map((l) => l.reference ?? 'sem referência'))].sort(), [linhas]);
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhas.filter((l) => (!refs.size || refs.has(l.reference ?? 'sem referência'))
      && (!b || l.code === b || l.description.toLowerCase().includes(b))
      && (!locais.size || [...locais].some((n) => (n === 1 ? l.l1 : n === 2 ? l.l2 : l.l5) !== 0)));
  }, [linhas, refs, locais, busca]);
  const erros = linhas.filter((l) => l.erro).length;

  return (
    <Card padded={false}>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 max-w-xs" placeholder="Produto (nome ou código)" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Chips label="Local" opcoes={[{ v: 1, l: '1' }, { v: 2, l: '2' }, { v: 5, l: '5' }]} valor={locais} onChange={setLocais} />
          <span className="text-xs text-muted">{importadoEm ? `Estoque de ${fmtDateTime(importadoEm)}` : 'Sem estoque importado'}</span>
          {pode && <Button className="ml-auto" size="sm" icon={<Upload className="size-4" />} onClick={() => setImportar(true)}>Importar estoque</Button>}
        </div>
        {referencias.length > 1 && <Chips label="Referência" opcoes={referencias.map((r) => ({ v: r, l: r }))} valor={refs} onChange={setRefs} />}
        {erros > 0 && <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-2 text-sm text-danger"><AlertTriangle className="size-4" /> {erros} produto(s) de venda (unidade ou pote) no local 2, que é de MP e semiacabado. Confira o estoque.</p>}
      </div>
      {lista.length ? (
        <Table className="[&>table]:min-w-max">
          <thead><tr><th className="th">Código</th><th className="th">Referência</th><th className="th">Nome do produto</th><th className="th">UN.</th><th className="th text-right">Estoque 1 (UN)</th><th className="th text-right">Estoque 2 (kg)</th><th className="th text-right">Estoque 5 (UN)</th><th className="th text-right">Estoque total</th></tr></thead>
          <tbody>{lista.map((l) => (
            <tr key={l.code} className={l.erro ? 'bg-danger/5' : ''}>
              <td className="td num">{l.code}</td>
              <td className="td text-xs">{l.reference ?? '—'}</td>
              <td className="td">{l.description}{l.erro && <Badge tone="danger" className="ml-2">local 2 com unidade</Badge>}</td>
              <td className="td text-xs">{l.unit ?? '—'}</td>
              <td className="td num text-right">{qtd(l.l1)}</td>
              <td className="td num text-right">{qtd(l.l2)}</td>
              <td className="td num text-right">{qtd(l.l5)}</td>
              <td className="td num text-right font-semibold">{qtd(l.total)}</td>
            </tr>
          ))}</tbody>
        </Table>
      ) : <EmptyState title={linhas.length ? 'Nada com esse filtro' : 'Sem estoque'} description="Importe a planilha do estoque: Código, Referência, Descrição do Produto, Und Estoque, Local de Estoque e Saldo." />}
      {importar && <ImportarEstoque atual={mapa} onClose={() => setImportar(false)} />}
    </Card>
  );
}

function ImportarEstoque({ atual, onClose }: { atual: Map<string, EstoqueLocal>; onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<StockParseResult | null>(null);
  const [modo, setModo] = useState<Modo | null>(null);
  const diff = useMemo(() => (parsed && modo ? compararEstoque(atual, parsed.aggregates, modo) : null), [parsed, modo, atual]);
  const run = useMutation({
    mutationFn: () => importarEstoque({ fileName: file!.name, aggregates: parsed!.aggregates, rowsTotal: parsed!.rows.length, modo: modo!, atual, userId: session?.user.id }),
    onSuccess: (r) => {
      toast.success(`Estoque importado.${r.semisCriados ? ` ${r.semisCriados} semiacabado(s) novo(s) no cadastro.` : ''}${r.ignorados.length ? ` ${r.ignorados.length} código(s) fora do cadastro (matéria-prima) ficaram de fora.` : ''}`, { duration: 9000 });
      ['pcp', 'current-stock', 'planejamento'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onClose={onClose} wide title="Importar estoque" description="Locais 1, 2 e 5. Escolha Incluir ou Substituir e confira as alterações antes de gravar."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!diff} loading={run.isPending} onClick={() => run.mutate()}>Gravar</Button></>}>
      <div className="space-y-3">
        <Dropzone accept=".xlsx,.xls" file={file} label="Arraste a planilha do estoque" hint="Código, Referência, Descrição do Produto, Und Estoque, Local de Estoque e Saldo."
          onFile={async (f) => {
            setFile(f);
            try {
              const { nome, buffer } = await lerAba(f, (l) => l.includes('local de estoque') && l.includes('saldo'));
              const r = parseStockWorkbook(soAba(buffer, nome), [1, 2, 5]);
              if (!r.aggregates.length) throw new Error('Não achei linhas de estoque nos locais 1, 2 e 5.');
              setParsed(r); toast.success(`${r.aggregates.length} produto(s) lidos.`);
            } catch (e) { setParsed(null); toast.error((e as Error).message); }
          }} />
        {parsed && <EscolhaModo modo={modo} onChange={setModo} incluir="Atualiza só os produtos da planilha; o estoque dos outros continua." substituir="O estoque passa a ser só o da planilha; o que não veio fica zerado." />}
        {diff && (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2"><Badge tone="info">{diff.mudam.length} produto(s) mudam</Badge>{modo === 'substituir' && <Badge tone="danger">{diff.zerados} zerado(s)</Badge>}</div>
            <div className="max-h-72 overflow-auto rounded-xl border border-line">
              <Table dense>
                <thead><tr><th className="th">Código</th><th className="th">Produto</th><th className="th text-right">Local 1</th><th className="th text-right">Local 2</th><th className="th text-right">Local 5</th></tr></thead>
                <tbody>{diff.mudam.slice(0, 300).map((m) => (
                  <tr key={m.codigo}>
                    <td className="td num">{m.codigo}</td><td className="td text-xs">{m.descricao}</td>
                    {(['l1', 'l2', 'l5'] as const).map((k) => <td key={k} className="td num text-right text-xs">{m.antes[k] === m.depois[k] ? qtd(m.depois[k]) : <><span className="text-muted line-through">{qtd(m.antes[k])}</span> → <b>{qtd(m.depois[k])}</b></>}</td>)}
                  </tr>
                ))}</tbody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
