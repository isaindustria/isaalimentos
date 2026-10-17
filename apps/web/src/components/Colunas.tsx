import { useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Columns3, GripVertical, RotateCcw } from 'lucide-react';
import { Button, Dialog } from '@/components/primitives';
import { supabase, unwrap } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

/**
 * Colunas que o ADM arruma sem mexer no código (solicitação #18): arrasta o título da coluna para outro lugar,
 * esconde/mostra no botão "Colunas" e pode voltar ao padrão. A arrumação vale para todos os usuários
 * (fica em app_settings, chave layout_colunas).
 */
export interface Coluna<T> {
  key: string;
  label: string;
  /** classes extras do <th> e do <td> (alinhamento, esconder no celular etc.) */
  th?: string;
  td?: string;
  cell: (row: T) => ReactNode;
  /** coluna que não pode ser escondida (ex.: código) */
  fixa?: boolean;
}
type Layout = { order?: string[]; hidden?: string[] };
type Layouts = Record<string, Layout>;
const KEY = 'layout_colunas';

async function getLayouts(): Promise<Layouts> {
  const r = unwrap(await supabase.from('app_settings').select('value').eq('key', KEY).maybeSingle()) as { value: Layouts } | null;
  return r?.value ?? {};
}

export function useColunas<T>(id: string, cols: Coluna<T>[]) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const q = useQuery({ queryKey: ['layout-colunas'], queryFn: getLayouts, staleTime: 60_000 });
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const lay = q.data?.[id] ?? {};
  const keys = cols.map((c) => c.key);
  const order = [...(lay.order ?? []).filter((k) => keys.includes(k)), ...keys.filter((k) => !(lay.order ?? []).includes(k))];
  const hidden = new Set((lay.hidden ?? []).filter((k) => !cols.find((c) => c.key === k)?.fixa));
  const porKey = new Map(cols.map((c) => [c.key, c]));
  const visiveis = order.map((k) => porKey.get(k)!).filter((c) => c && !hidden.has(c.key));

  const salvar = useMutation({
    mutationFn: async (next: Layout | null) => {
      const all = { ...(await getLayouts()) };
      if (next) all[id] = next; else delete all[id];
      unwrap(await supabase.from('app_settings').upsert({ key: KEY, value: all }, { onConflict: 'key' }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['layout-colunas'] }),
    onError: (e: Error) => toast.error(`Não foi possível salvar a arrumação: ${e.message}`),
  });
  const mover = (de: string, para: string) => {
    if (de === para) return;
    const o = order.filter((k) => k !== de);
    o.splice(o.indexOf(para), 0, de);
    salvar.mutate({ order: o, hidden: [...hidden] });
  };

  const thProps = (key: string) => (isAdmin ? {
    draggable: true,
    title: 'Arraste para mudar a ordem da coluna',
    onDragStart: (e: DragEvent) => { setArrastando(key); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: (e: DragEvent) => { if (arrastando) e.preventDefault(); },
    onDrop: (e: DragEvent) => { e.preventDefault(); if (arrastando) mover(arrastando, key); setArrastando(null); },
    onDragEnd: () => setArrastando(null),
    className: `cursor-grab ${arrastando === key ? 'opacity-40' : ''}`,
  } : {});

  const botao = isAdmin ? (
    <>
      <Button size="sm" variant="ghost" icon={<Columns3 className="size-4" />} onClick={() => setMenu(true)}>Colunas</Button>
      {menu && (
        <Dialog open onClose={() => setMenu(false)} title="Colunas da tabela" description="Arraste (ou use as setas) para mudar a ordem e desmarque para esconder. Vale para todos os usuários."
          footer={<><Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => salvar.mutate(null)}>Voltar ao padrão</Button><Button onClick={() => setMenu(false)}>Pronto</Button></>}>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {order.map((k, i) => { const c = porKey.get(k)!; return (
              <li key={k} draggable onDragStart={() => setArrastando(k)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (arrastando) mover(arrastando, k); setArrastando(null); }}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${arrastando === k ? 'opacity-40' : ''}`}>
                <GripVertical className="size-4 cursor-grab text-muted" />
                <label className="flex flex-1 items-center gap-2">
                  <input type="checkbox" className="accent-brand" disabled={c.fixa} checked={!hidden.has(k)}
                    onChange={(e) => { const h = new Set(hidden); if (e.target.checked) h.delete(k); else h.add(k); salvar.mutate({ order, hidden: [...h] }); }} />
                  {c.label || '(ações)'}{c.fixa && <span className="text-xs text-muted">· sempre visível</span>}
                </label>
                <button type="button" className="p-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} aria-label={`Subir ${c.label}`} onClick={() => mover(k, order[i - 1])}><ArrowUp className="size-4" /></button>
                <button type="button" className="p-1 text-muted hover:text-fg disabled:opacity-30" disabled={i === order.length - 1} aria-label={`Descer ${c.label}`} onClick={() => { const o = [...order]; [o[i], o[i + 1]] = [o[i + 1], o[i]]; salvar.mutate({ order: o, hidden: [...hidden] }); }}><ArrowDown className="size-4" /></button>
              </li>
            ); })}
          </ul>
        </Dialog>
      )}
    </>
  ) : null;

  return { visiveis, thProps, botao };
}

/** Cabeçalho pronto: <th> de cada coluna visível, arrastável para o ADM. */
export function CabecalhoColunas<T>({ cols, thProps }: { cols: Coluna<T>[]; thProps: (k: string) => Record<string, unknown> }) {
  return (
    <tr>
      {cols.map((c) => { const p = thProps(c.key) as { className?: string }; return <th key={c.key} {...p} className={`th ${c.th ?? ''} ${p.className ?? ''}`}>{c.label}</th>; })}
    </tr>
  );
}
