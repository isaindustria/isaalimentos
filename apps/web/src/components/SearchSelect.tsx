import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchOption { value: string; label: string; sub?: string; /** texto extra para a busca (ex.: CNPJ só com dígitos) */ search?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Lista pesquisável: digitar filtra; só vale o que for escolhido na lista.
 * Texto digitado sem escolher volta para a seleção atual ao sair do campo.
 */
export function SearchSelect({ options, value, onChange, placeholder = 'Pesquisar…', invalid, disabled, className, id, ariaLabel, digitsSearch, limit = 60 }: {
  options: SearchOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  /** também compara só os dígitos do que foi digitado (CNPJ com ou sem pontuação) */
  digitsSearch?: boolean;
  limit?: number;
}) {
  const selected = options.find((o) => o.value === value) ?? null;
  const [text, setText] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!open) setText(selected?.label ?? ''); }, [selected?.label, open]);

  const filtered = useMemo(() => {
    const q = norm(text.trim());
    const digits = text.replace(/\D/g, '');
    if (!q || (selected && text === selected.label)) return options.slice(0, limit);
    return options
      .filter((o) => {
        const hay = norm(`${o.label} ${o.sub ?? ''} ${o.search ?? ''}`);
        if (q.split(/\s+/).every((w) => hay.includes(w))) return true;
        return !!(digitsSearch && digits.length >= 2 && (o.search ?? '').replace(/\D/g, '').includes(digits));
      })
      .slice(0, limit);
  }, [text, options, selected, digitsSearch, limit]);

  function choose(o: SearchOption) {
    onChange(o.value);
    setText(o.label);
    setOpen(false);
  }

  return (
    <div ref={box} className={cn('relative', className)} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) { setOpen(false); setText(selected?.label ?? ''); } }}>
      <input
        id={id}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        className={cn('h-10 w-full rounded-xl border bg-surface px-3 pr-14 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60', invalid ? 'border-danger' : 'border-line')}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => { setOpen(true); e.currentTarget.select(); }}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
          else if (e.key === 'Escape') { setOpen(false); setText(selected?.label ?? ''); }
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-muted">
        {value && !disabled && (
          <button type="button" className="pointer-events-auto rounded p-1 hover:text-danger" aria-label="Limpar" onClick={() => { onChange(null); setText(''); }}><X className="size-3.5" /></button>
        )}
        <ChevronDown className="size-4" />
      </div>
      {open && !disabled && (
        <ul role="listbox" className="absolute z-50 mt-1 max-h-72 w-full min-w-[260px] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-pop">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nada encontrado.</li>}
          {filtered.map((o, i) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={cn('flex w-full flex-col items-start rounded-lg px-3 py-1.5 text-left text-sm', i === active ? 'bg-surface-2' : 'hover:bg-surface-2', o.value === value && 'font-semibold')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.sub && <span className="text-xs text-muted">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
