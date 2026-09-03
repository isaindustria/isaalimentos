import { useState, type FormEvent } from 'react';
import { Search, PackageCheck, Truck } from 'lucide-react';
import { Button, Card, Field, Input } from '@/components/primitives';
import { Brand } from '@/components/AppShell';
import { fmtBRL, fmtDate, fmtInt, formatCnpj } from '@/lib/utils';

const FN = `${import.meta.env.VITE_SUPABASE_URL || 'https://exbhhwrutvzpwcjxqikp.supabase.co'}/functions/v1/order-status`;

interface Result {
  customer: { name: string; city: string | null; state: string | null };
  order: { number: string; date: string | null; delivery: string | null; status: string; total: number };
  delivery: { date: string; status: string; driver: string | null } | null;
  items: Array<{ description: string; boxes: number }>;
}

/** Public page: the store checks its own order by number + CNPJ. No login. */
export default function PortalPage() {
  const [num, setNum] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setRes(null);
    try {
      const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_number: num.trim(), cnpj }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Não foi possível consultar.');
      setRes(j);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-bg p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between"><Brand /><a href="#/login" className="text-sm text-muted hover:text-brand">Sou da ISA</a></div>
        <Card title="Consultar meu pedido">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Número do pedido"><Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="223563" required /></Field>
            <Field label="CNPJ da loja"><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" required /></Field>
            <Button type="submit" loading={busy} icon={<Search className="size-4" />}>Consultar</Button>
          </form>
          {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </Card>
        {res && (
          <Card className="mt-4 animate-fade-up" title={`Pedido #${res.order.number}`}>
            <div className="flex flex-col gap-4">
              <div className="text-sm text-muted">{res.customer.name} · {[res.customer.city, res.customer.state].filter(Boolean).join(' - ')} · {formatCnpj(cnpj)}</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Situação</div><div className="flex items-center gap-2 font-semibold"><PackageCheck className="size-4 text-brand" /> {res.order.status}</div></div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Emitido / entrega prevista</div><div className="font-semibold">{fmtDate(res.order.date)} · {fmtDate(res.order.delivery)}</div></div>
                <div className="rounded-xl bg-surface-2 p-3"><div className="text-xs text-muted">Entrega</div><div className="flex items-center gap-2 font-semibold"><Truck className="size-4 text-brand-green" /> {res.delivery ? `${res.delivery.status} · ${fmtDate(res.delivery.date)}` : 'Ainda não roteirizada'}</div></div>
              </div>
              <table className="w-full text-sm"><thead><tr><th className="th">Produto</th><th className="th text-right">Caixas</th></tr></thead>
                <tbody>{res.items.map((i, idx) => <tr key={idx}><td className="td">{i.description}</td><td className="td num text-right">{fmtInt(i.boxes)}</td></tr>)}</tbody></table>
              <div className="text-right text-sm">Total: <b>{fmtBRL(res.order.total)}</b></div>
            </div>
          </Card>
        )}
        <p className="mt-6 text-center text-xs text-muted">ISA Indústria de Alimentos e Temperos · (11) 5198-2994</p>
      </div>
    </div>
  );
}
