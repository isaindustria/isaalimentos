import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Filtro de status com seleção múltipla (Vendas parte 7): marca e desmarca cada status;
 * nada marcado = Todos os status.
 */
export function StatusMultiplo<T extends string>({ valor, onChange, opcoes }: { valor: T[]; onChange: (v: T[]) => void; opcoes: Array<{ v: T; l: string }> }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  const rotulo = !valor.length ? 'Todos os status' : valor.length === 1 ? opcoes.find((o) => o.v === valor[0])?.l ?? '1 status' : `${valor.length} status`;
  const toggle = (v: T) => onChange(valor.includes(v) ? valor.filter((x) => x !== v) : [...valor, v]);
  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:max-w-48">
      <button type="button" aria-haspopup="listbox" aria-expanded={aberto} aria-label="Status" onClick={() => setAberto((a) => !a)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm">
        <span className="truncate">{rotulo}</span><ChevronDown className="size-4 shrink-0 text-muted" />
      </button>
      {aberto && (
        <div role="listbox" aria-multiselectable="true" className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <button type="button" role="option" aria-selected={!valor.length} onClick={() => onChange([])} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
            <span className={`grid size-4 place-items-center rounded border ${!valor.length ? 'border-brand bg-brand text-white' : 'border-line'}`}>{!valor.length && <Check className="size-3" />}</span>Todos os status
          </button>
          {opcoes.map((o) => {
            const on = valor.includes(o.v);
            return (
              <button key={o.v} type="button" role="option" aria-selected={on} onClick={() => toggle(o.v)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2">
                <span className={`grid size-4 place-items-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>{on && <Check className="size-3" />}</span>{o.l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
