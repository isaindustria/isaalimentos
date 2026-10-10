import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download } from 'lucide-react';
import { Badge, Button, Dialog, Dropzone, Table } from '@/components/primitives';
import { readSheetText, normalizeHeader, templateWorkbook } from '@/domain/parsers/sheet';
import { downloadBlob } from '@/lib/utils';
import type { PreviewRow, PreviewStatus } from '@/api/sales';

const TONE: Record<PreviewStatus, 'ok' | 'info' | 'warn' | 'danger'> = { nova: 'ok', existente: 'info', duplicada: 'warn', erro: 'danger' };
const LABEL: Record<PreviewStatus, string> = { nova: 'Nova', existente: 'Já existe', duplicada: 'Duplicada', erro: 'Erro' };

/**
 * Importação com prévia: valida colunas obrigatórias, mostra novas/existentes/duplicadas/erros com a linha e o motivo,
 * pede confirmação para atualizar o que já existe e nunca apaga o que ficou fora do arquivo.
 */
export function SalesImportDialog<T>({ open, onClose, title, description, columns, required, example, templateName, preview, describe, commit, onDone }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  columns: string[];
  /** grupos de nomes aceitos por coluna obrigatória */
  required: Array<{ label: string; aliases: string[] }>;
  example: string[];
  templateName: string;
  preview: (rows: Record<string, string>[], lines: number[]) => PreviewRow<T>[];
  describe: (data: T) => string[];
  commit: (rows: PreviewRow<T>[], updateExisting: boolean) => Promise<{ included: number; updated: number; rejected: number }>;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow<T>[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<PreviewStatus | 'todas'>('todas');

  function reset() { setFile(null); setRows([]); setMissing([]); setConfirmUpdate(false); setFilter('todas'); onClose(); }

  async function onFile(f: File) {
    setFile(f);
    if (!/\.(xlsx|xls)$/i.test(f.name)) { setRows([]); setMissing(['O arquivo precisa ser Excel (.xlsx ou .xls).']); return; }
    try {
      const sheet = readSheetText(await f.arrayBuffer());
      const heads = sheet.headers.map(normalizeHeader);
      const miss = required.filter((c) => !c.aliases.some((a) => heads.some((h) => h === normalizeHeader(a) || h.startsWith(normalizeHeader(a))))).map((c) => c.label);
      setMissing(miss.length ? [`Faltam colunas obrigatórias: ${miss.join(', ')}. Baixe o modelo para ver os nomes.`] : []);
      setRows(miss.length ? [] : preview(sheet.rows, sheet.lines));
    } catch (e) {
      setRows([]); setMissing([`Não foi possível ler o arquivo: ${(e as Error).message}`]);
    }
  }

  const count = (s: PreviewStatus) => rows.filter((r) => r.status === s).length;
  const toUpdate = rows.filter((r) => r.status === 'existente' && r.changes?.length).length;
  const shown = filter === 'todas' ? rows : rows.filter((r) => r.status === filter);
  const canImport = count('nova') > 0 || (toUpdate > 0 && confirmUpdate);

  async function confirm() {
    setBusy(true);
    try {
      const r = await commit(rows, confirmUpdate);
      toast.success(`Importação concluída: ${r.included} incluído(s), ${r.updated} atualizado(s), ${r.rejected} rejeitado(s).`, { duration: 8000 });
      onDone();
      reset();
    } catch (e) {
      toast.error(`Não foi possível importar: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={reset} title={title} description={description} wide
      footer={<>
        <Button variant="outline" onClick={reset}>Cancelar</Button>
        <Button onClick={confirm} loading={busy} disabled={!canImport || busy} icon={<CheckCircle2 className="size-4" />}>Importar</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <span>Formato aceito: Excel (.xlsx ou .xls). Colunas: {columns.join(', ')}. Quem não estiver no arquivo continua cadastrado.</span>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(templateWorkbook(columns, example), templateName)}>Baixar modelo</Button>
        </div>
        <Dropzone accept=".xlsx,.xls" onFile={onFile} file={file} label="Arraste a planilha ou clique para escolher" hint="A primeira linha deve ter os nomes das colunas." />
        {missing.map((m) => <p key={m} className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{m}</p>)}
        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              {(['todas', 'nova', 'existente', 'duplicada', 'erro'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 ${filter === s ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line'}`}>
                  {s === 'todas' ? `Todas ${rows.length}` : `${LABEL[s]} ${count(s)}`}
                </button>
              ))}
            </div>
            {toUpdate > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" className="mt-1 accent-brand" checked={confirmUpdate} onChange={(e) => setConfirmUpdate(e.target.checked)} />
                <span><b>Atualizar {toUpdate} cadastro(s) que já existem</b><span className="block text-xs text-muted">Sem marcar, só as linhas novas são incluídas. Pedidos já salvos não mudam.</span></span>
              </label>
            )}
            <div className="max-h-[45vh] overflow-auto rounded-xl border border-line">
              <Table dense>
                <thead><tr><th className="th">Linha</th><th className="th">Situação</th><th className="th">Dados</th><th className="th">Motivo / mudanças</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.line}>
                      <td className="td num text-muted">{r.line}</td>
                      <td className="td"><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge></td>
                      <td className="td text-xs">{describe(r.data).map((d) => <div key={d}>{d}</div>)}</td>
                      <td className="td text-xs">
                        {r.reason && <div className={r.status === 'erro' ? 'text-danger' : 'text-muted'}>{r.reason}</div>}
                        {r.changes?.map((c) => <div key={c}>{c}</div>)}
                        {r.status === 'existente' && !r.changes?.length && <div className="text-muted">sem mudanças</div>}
                        {(r.data as { warning?: string }).warning && <div className="text-warn">{(r.data as { warning?: string }).warning}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
