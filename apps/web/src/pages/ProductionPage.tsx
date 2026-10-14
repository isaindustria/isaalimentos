import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Printer, Scale, Upload } from 'lucide-react';
import { Badge, Button, Card, Dialog, Dropzone, EmptyState, PageHeader, Stat, Table, Tabs } from '@/components/primitives';
import { FluxoPedidos } from '@/components/FluxoPedidos';
import { carregarPlanejamento, importarCadastroProducao } from '@/api/planejamento';
import { readSheetText } from '@/domain/parsers/sheet';
import { fmtDate } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const kg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;

/**
 * Produção (Vendas parte 6): alimentada pelos pedidos. Mostra a necessidade somada por código
 * (pedido − estoque − alternativo − semiacabado, com a produção mínima) e os pedidos que estão na produção,
 * onde o PCP passa de Aberto para Em produção e, ao terminar, para Faturamento.
 */
export default function ProductionPage() {
  const { canWriteArea, isAdmin } = useAuth();
  const plano = useQuery({ queryKey: ['planejamento'], queryFn: carregarPlanejamento, refetchInterval: 30000 });
  const [aba, setAba] = useState<'necessidade' | 'pedidos'>('necessidade');
  const [importar, setImportar] = useState(false);
  const rows = plano.data?.rows ?? [];
  const produzir = rows.filter((r) => r.situacao === 'produzir');
  const semCadastro = rows.filter((r) => r.situacao === 'sem_cadastro');

  return (
    <>
      <PageHeader title="Produção" description="Alimentada pelos pedidos: o que precisa produzir, somado por código e pela entrega mais próxima. Revenda e o que o estoque já atende vão direto para o faturamento (Rotas de entrega)."
        actions={<>
          {(isAdmin || canWriteArea('estoque')) && <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => setImportar(true)}>Importar cadastro da produção</Button>}
          <Button variant="outline" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button>
        </>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Produtos a produzir" value={produzir.length} icon={<Factory className="size-5" />} tone="warn" />
        <Stat label="Quilos a produzir" value={kg(produzir.reduce((s, r) => s + r.produzirKg, 0))} icon={<Scale className="size-5" />} tone="brand" />
        <Stat label="Pedidos na produção" value={plano.data?.producao.length ?? 0} sub={`${plano.data?.faturamento.length ?? 0} no faturamento`} />
      </div>
      {semCadastro.length > 0 && <p className="mb-4 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm">Sem equivalência no cadastro: {semCadastro.map((r) => r.code).join(', ')}. Importe o cadastro da produção ou preencha a equivalência em Produtos.</p>}
      <div className="mb-4"><Tabs value={aba} onChange={setAba} items={[{ value: 'necessidade', label: 'Pedido / Necessidade de produção', count: rows.length }, { value: 'pedidos', label: 'Pedidos na produção', count: plano.data?.producao.length }]} /></div>

      {aba === 'necessidade' ? (
        <Card padded={false}>
          {rows.length ? (
            <Table className="[&>table]:min-w-max">
              <thead><tr>
                <th className="th">Cód.</th><th className="th">Produto</th><th className="th">Entrega</th><th className="th text-right">Pedido</th><th className="th text-right">Estoque</th>
                <th className="th text-right">Alternativo</th><th className="th text-right">Semiacabado</th><th className="th text-right">Necessidade</th><th className="th text-right">Prod. mín.</th><th className="th text-right">Produzir</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className={r.situacao === 'produzir' ? '' : 'text-muted'}>
                    <td className="td font-mono text-xs">{r.code}</td>
                    <td className="td">{r.name}{r.semiCode && <div className="text-[11px] text-muted">semiacabado {r.semiCode}</div>}</td>
                    <td className="td whitespace-nowrap">{fmtDate(r.earliest)}</td>
                    <td className="td num text-right">{kg(r.pedidoKg)}</td>
                    <td className="td num text-right">{r.estoqueUn.toLocaleString('pt-BR')}<div className="text-[11px] text-muted">{kg(r.estoqueKg)}</div></td>
                    <td className="td num text-right">{r.altCode ? <>{r.altUn}{r.altUsado ? <div className="text-[11px] text-ok">usado ({r.altCode})</div> : <div className="text-[11px] text-muted">{r.altCode}</div>}</> : '—'}</td>
                    <td className="td num text-right">{r.semiCode ? kg(r.semiKg) : '—'}</td>
                    <td className="td num text-right">{r.situacao === 'produzir' ? kg(r.necessidadeKg) : '—'}</td>
                    <td className="td num text-right">{r.minKg != null ? kg(r.minKg) : '—'}</td>
                    <td className="td text-right">{r.situacao === 'produzir' ? <b className="num">{kg(r.produzirKg)}</b> : r.situacao === 'atendido' ? <Badge tone="ok">atendido</Badge> : <Badge tone="warn">sem cadastro</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title="Nada para produzir" description="Quando entrarem pedidos com produtos fabricados, a necessidade aparece aqui." />}
          <p className="px-5 py-3 text-xs text-muted">Necessidade = pedido − estoque (unidades × equivalência) − semiacabado em estoque. O produto alternativo só entra se cobrir tudo e o vendedor marcou SIM em "Se precisar, posso trocar a embalagem?". Se a necessidade for menor que a produção mínima do semiacabado, produz o mínimo.</p>
        </Card>
      ) : (
        <FluxoPedidos fluxo="producao" pedidos={plano.data?.producao ?? []} podeMudar={canWriteArea('producao')} />
      )}

      {importar && <ImportarCadastro onClose={() => setImportar(false)} />}
    </>
  );
}

function ImportarCadastro({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [modo, setModo] = useState<'incluir' | 'substituir' | null>(null);
  const run = useMutation({
    mutationFn: () => importarCadastroProducao(rows, modo!),
    onSuccess: (r) => {
      toast.success(`Cadastro da produção: ${r.atualizados} produto(s) atualizados, ${r.semiacabados} semiacabado(s) (${r.criados} novo(s)).${r.ignorados.length ? ` Fora do cadastro de produtos: ${r.ignorados.slice(0, 8).join(', ')}${r.ignorados.length > 8 ? '…' : ''}.` : ''}`, { duration: 10000 });
      ['planejamento', 'products', 'current-stock'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onClose={onClose} wide title="Importar cadastro da produção" description="Colunas: Código, Referência, Descrição do Produto, Und venda, Equivalência, Código semiacabado, Descrição, Estoque alternativo e Quantidade mínima a produzir. Os semiacabados entram no cadastro com a referência SEMIACABADO (aparecem no Estoque, não no pedido de venda)."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!rows.length || !modo} loading={run.isPending} onClick={() => run.mutate()}>Importar</Button></>}>
      <div className="space-y-3">
        <Dropzone accept=".xlsx,.xls,.csv" file={file} label="Arraste a planilha do cadastro da produção" hint="A primeira linha com os títulos das colunas."
          onFile={async (f) => { setFile(f); try { setRows(readSheetText(await f.arrayBuffer()).rows); } catch (e) { toast.error((e as Error).message); } }} />
        {rows.length > 0 && <p className="text-sm">{rows.length} linha(s) lidas.</p>}
        {rows.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {([['incluir', 'Incluir', 'Preenche e acrescenta; o que já está no cadastro e não veio na planilha continua.'], ['substituir', 'Substituir', 'Limpa equivalência, semiacabado, alternativo e mínimo de todos os produtos e aplica a planilha. Nenhum produto é apagado.']] as const).map(([v, l, d]) => (
              <button key={v} type="button" onClick={() => setModo(v)} className={`rounded-xl border p-3 text-left text-sm ${modo === v ? 'border-brand bg-brand-soft/40' : 'border-line'}`}><b>{l}</b><span className="block text-xs text-muted">{d}</span></button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
