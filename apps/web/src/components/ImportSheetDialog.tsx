import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Download, CheckCircle2 } from 'lucide-react';
import { readSheet, templateWorkbook } from '@/domain/parsers/sheet';
import { Button, Dialog, Dropzone, Table } from '@/components/primitives';
import { downloadBlob } from '@/lib/utils';

export interface ImportColumn {
  key: string;
  label: string;
  example: string;
  required?: boolean;
}

interface Props<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  columns: ImportColumn[];
  /** Converts a raw spreadsheet row into a typed record, or returns a string error. */
  mapRow: (row: Record<string, string>, index: number) => T | string;
  /** Persists the valid records; returns a summary message. */
  onImport: (records: T[]) => Promise<string>;
  preview: (r: T) => ReactNode[];
  templateName: string;
}

/** Generic "import from spreadsheet" flow: template, drop file, preview with errors, confirm. */
export function ImportSheetDialog<T>({ open, onClose, title, description, columns, mapRow, onImport, preview, templateName }: Props<T>) {
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<T[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setRecords([]);
    setErrors([]);
    onClose();
  }

  async function onFile(f: File) {
    setFile(f);
    try {
      const sheet = readSheet(await f.arrayBuffer());
      const ok: T[] = [];
      const errs: string[] = [];
      sheet.rows.forEach((row, i) => {
        const r = mapRow(row, i + 2);
        if (typeof r === 'string') errs.push(r);
        else ok.push(r);
      });
      setRecords(ok);
      setErrors(errs);
      if (!ok.length) toast.error('Nenhuma linha válida encontrada. Confira os cabeçalhos com o modelo.');
    } catch (e) {
      toast.error(`Não foi possível ler o arquivo: ${(e as Error).message}`);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const msg = await onImport(records);
      toast.success(msg);
      reset();
    } catch (e) {
      toast.error(`Falha na importação: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={reset}
      title={title}
      description={description}
      wide
      footer={
        <>
          <Button variant="outline" onClick={reset}>Cancelar</Button>
          <Button onClick={confirm} loading={busy} disabled={!records.length} icon={<CheckCircle2 className="size-4" />}>
            Importar {records.length ? `${records.length} registro(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm">
          <span className="flex-1 text-muted">
            Colunas aceitas: {columns.map((c) => c.label + (c.required ? '*' : '')).join(', ')}. Baixe o modelo, preencha e solte aqui (XLSX ou CSV).
          </span>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(templateWorkbook(columns.map((c) => c.label), columns.map((c) => c.example)), templateName)}>
            Baixar modelo
          </Button>
        </div>
        <Dropzone accept=".xlsx,.xls,.csv" onFile={onFile} file={file} label="Arraste a planilha ou clique para escolher" hint="A primeira linha deve ter os nomes das colunas." />
        {errors.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-xl border border-warn/30 bg-warn/5 p-3 text-xs">
            <b className="text-warn">{errors.length} linha(s) ignorada(s):</b>
            <ul className="mt-1 list-disc pl-4 text-muted">
              {errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {records.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            <Table dense>
              <thead className="sticky top-0 bg-surface">
                <tr>{columns.map((c) => <th key={c.key} className="th">{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {records.slice(0, 200).map((r, i) => (
                  <tr key={i}>{preview(r).map((cell, j) => <td key={j} className="td">{cell}</td>)}</tr>
                ))}
              </tbody>
            </Table>
            {records.length > 200 && <p className="px-3 py-2 text-xs text-muted">Mostrando 200 de {records.length}.</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
