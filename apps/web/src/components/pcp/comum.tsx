import type { ReactNode } from 'react';
import * as XLSX from 'xlsx';

export const kg = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`);
export const qtd = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 }));

/** Botões de filtro que se combinam (mais de uma opção ao mesmo tempo). */
export function Chips<T extends string | number>({ label, opcoes, valor, onChange }: { label: string; opcoes: Array<{ v: T; l: ReactNode }>; valor: Set<T>; onChange: (s: Set<T>) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {opcoes.map((o) => {
        const on = valor.has(o.v);
        return (
          <button key={String(o.v)} type="button" aria-pressed={on}
            onClick={() => { const n = new Set(valor); if (on) n.delete(o.v); else n.add(o.v); onChange(n); }}
            className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-fg'}`}>{o.l}</button>
        );
      })}
    </div>
  );
}

/** Incluir ou Substituir: sempre perguntado antes de importar. */
export function EscolhaModo({ modo, onChange, incluir, substituir }: { modo: 'incluir' | 'substituir' | null; onChange: (m: 'incluir' | 'substituir') => void; incluir: string; substituir: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {([['incluir', 'Incluir', incluir], ['substituir', 'Substituir', substituir]] as const).map(([v, l, d]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`rounded-xl border p-3 text-left text-sm ${modo === v ? 'border-brand bg-brand-soft/40' : 'border-line'}`}>
          <b>{l}</b><span className="block text-xs text-muted">{d}</span>
        </button>
      ))}
    </div>
  );
}

/** Lê a planilha e devolve a aba que tem o título procurado (a planilha pode ter várias abas). */
export async function lerAba(file: File, acha: (linha: string) => boolean): Promise<{ matrix: unknown[][]; nome: string; buffer: ArrayBuffer }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const nome of wb.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    if (matrix.slice(0, 40).some((r) => acha((r ?? []).map(fold).join(' | ')))) return { matrix, nome, buffer };
  }
  const nome = wb.SheetNames[0];
  return { matrix: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null }), nome, buffer };
}

/** Planilha só com a aba escolhida (o leitor de estoque lê a primeira aba). */
export function soAba(buffer: ArrayBuffer, nome: string): Uint8Array {
  const wb = XLSX.read(buffer, { type: 'array' });
  const novo = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(novo, wb.Sheets[nome], 'Estoque');
  return new Uint8Array(XLSX.write(novo, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

/** Tabela compacta (Produção 7): título quebra linha, pouco espaço entre colunas, cabe na tela sem rolar para o lado. */
export const COMPACTA = '[&>table]:min-w-0 [&>table]:table-auto [&_th]:whitespace-normal [&_th]:leading-tight [&_th]:align-bottom [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5';
