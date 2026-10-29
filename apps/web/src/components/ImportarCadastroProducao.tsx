import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Dialog, Dropzone } from '@/components/primitives';
import { importarCadastroProducao } from '@/api/planejamento';
import { readSheetText } from '@/domain/parsers/sheet';

/** Cadastro da produção (equivalência, semiacabado, alternativo e mínimo): fica no menu Produtos (solicitação #21). */
export function ImportarCadastro({ onClose }: { onClose: () => void }) {
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
