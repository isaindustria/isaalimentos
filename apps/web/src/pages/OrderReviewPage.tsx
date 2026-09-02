import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ArrowLeft, Search, XCircle } from 'lucide-react';
import { ignoreItem, listPendingItems, resolveItem } from '@/api/orders';
import { listProducts } from '@/api/products';
import { rankCandidates } from '@/domain/matching';
import { normalizedKey } from '@/domain/normalize';
import { Button, Card, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { fmtInt, fmtPct } from '@/lib/utils';
import type { OrderItem } from '@/lib/types';
import { MatchBadge } from './OrderImportPage';

interface Group {
  key: string;
  clientCode: string | null;
  description: string;
  items: OrderItem[];
  boxes: number;
  status: string;
  score: number | null;
}

export default function OrderReviewPage() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ['pending-items'], queryFn: listPendingItems });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const it of pending.data ?? []) {
      const key = it.client_code ?? normalizedKey(it.raw_description);
      const g = map.get(key) ?? { key, clientCode: it.client_code, description: it.raw_description, items: [], boxes: 0, status: it.match_status, score: it.match_score };
      g.items.push(it);
      g.boxes += Number(it.quantity_boxes);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.description.localeCompare(b.description));
  }, [pending.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pending-items'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['order-imports'] });
    qc.invalidateQueries({ queryKey: ['aliases'] });
    qc.invalidateQueries({ queryKey: ['demand'] });
  };

  const resolve = useMutation({
    mutationFn: (v: { item: OrderItem; productCode: string; learn: boolean; unitsPerBox: number }) => resolveItem(v),
    onSuccess: (n) => {
      toast.success(`${n} linha(s) associada(s).`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ignore = useMutation({
    mutationFn: (g: Group) => Promise.all(g.items.map((i) => ignoreItem(i.id))),
    onSuccess: invalidate,
  });

  return (
    <>
      <PageHeader
        eyebrow="Pedidos"
        title="Conferência de itens"
        description="Descrições do PDF que não foram reconhecidas com segurança. Escolha o produto correto; a associação fica salva para as próximas importações."
        actions={<Link to="/pedidos"><Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>Voltar</Button></Link>}
      />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 className="h-5 w-5 text-ok" />} title="Tudo reconhecido" description="Nenhum item aguardando conferência." action={<Link to="/producao"><Button>Ir para produção</Button></Link>} />
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => (
            <ReviewCard key={g.key} group={g} products={products.data ?? []} busy={resolve.isPending} onResolve={(code, learn, upb) => resolve.mutate({ item: g.items[0], productCode: code, learn, unitsPerBox: upb })} onIgnore={() => ignore.mutate(g)} />
          ))}
        </div>
      )}
    </>
  );
}

function ReviewCard({ group, products, busy, onResolve, onIgnore }: { group: Group; products: Array<{ code: string; description: string; units_per_box: number }>; busy: boolean; onResolve: (code: string, learn: boolean, upb: number) => void; onIgnore: () => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [learn, setLearn] = useState(true);
  const candidates = useMemo(() => rankCandidates(group.description, products, 4), [group.description, products]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? products.filter((p) => p.code.includes(q) || p.description.toLowerCase().includes(q)).slice(0, 8) : [];
  }, [search, products]);
  const chosen = products.find((p) => p.code === selected);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2 mb-1"><MatchBadge status={group.status} score={group.score} /> <span className="text-xs text-muted">{group.items.length} linha(s) · {fmtInt(group.boxes)} caixas</span></div>
          <div className="font-display text-lg font-bold">{group.description}</div>
          <div className="text-xs text-muted font-mono mt-0.5">código do cliente: {group.clientCode ?? '—'}</div>
          <div className="text-xs text-muted mt-2">Pedidos: {group.items.map((i) => `#${i.order?.order_number ?? '?'}`).join(', ')}</div>
        </div>
        <div className="flex-1 min-w-[320px] space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Sugestões</div>
          <div className="grid gap-2">
            {candidates.map((c) => (
              <button key={c.code} onClick={() => setSelected(c.code)} className={`flex items-center gap-3 rounded-xl border p-3 text-left text-sm transition ${selected === c.code ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/40'}`}>
                <span className="font-mono text-xs w-10 text-muted">{c.code}</span>
                <span className="flex-1 font-medium">{c.description}</span>
                <span className="text-xs text-muted num">{fmtPct(c.score)}</span>
              </button>
            ))}
            {!candidates.length && <div className="text-sm text-muted">Nenhuma sugestão. Use a busca.</div>}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Buscar outro produto" value={search} onChange={(e) => setSearch(e.target.value)} />
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full card shadow-pop p-1 max-h-60 overflow-y-auto">
                {filtered.map((p) => (
                  <button key={p.code} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-surface-2" onClick={() => { setSelected(p.code); setSearch(''); }}>
                    <span className="font-mono text-xs text-muted mr-2">{p.code}</span>{p.description}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Select className="w-auto flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Selecione o produto…</option>
              {products.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--brand))]" checked={learn} onChange={(e) => setLearn(e.target.checked)} /> Lembrar para as próximas importações
            </label>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="text-muted" icon={<XCircle className="h-3.5 w-3.5" />} onClick={onIgnore}>Não é produto ISA</Button>
            <Button disabled={!chosen} loading={busy} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => chosen && onResolve(chosen.code, learn, chosen.units_per_box)}>Confirmar</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
