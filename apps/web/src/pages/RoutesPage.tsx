import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Printer, Truck, Trash2, QrCode } from 'lucide-react';
import { deleteRoute, listRoutes, saveRoute, setRouteStatus } from '@/api/v14';
import { listOrders, getOrder } from '@/api/orders';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Table, Tabs } from '@/components/primitives';
import { fmtBRL, fmtDate, fmtInt } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import type { DeliveryRoute, Order, RouteStatus } from '@/lib/types';

const RSTATUS: Record<RouteStatus, { label: string; tone: 'info' | 'brand' | 'ok' }> = { planejada: { label: 'Planejada', tone: 'info' }, em_rota: { label: 'Em rota', tone: 'brand' }, concluida: { label: 'Concluída', tone: 'ok' } };

/** Simple QR (as SVG) via a tiny encoder-free approach: uses an <img> from a data URL is not possible offline, so we render the code text as a barcode-like label. */
function CodeLabel({ text }: { text: string }) {
  return <div className="font-mono text-[11px] tracking-widest">{text}</div>;
}

export default function RoutesPage() {
  const qc = useQueryClient();
  const { canWrite, session, profile } = useAuth();
  const [tab, setTab] = useState<'montar' | 'rotas'>('rotas');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [print, setPrint] = useState<{ route: DeliveryRoute; orders: Array<Order & { items: { raw_description: string; quantity_boxes: number; product?: { description: string } | null }[] }> } | null>(null);

  const orders = useQuery({ queryKey: ['orders', { status: 'todos' }], queryFn: () => listOrders({ status: 'todos' }) });
  const routes = useQuery({ queryKey: ['routes'], queryFn: listRoutes });
  const pending = useMemo(() => (orders.data ?? []).filter((o) => ['aberto', 'em_producao', 'faturado'].includes(o.status)), [orders.data]);
  const byCity = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of pending) { const k = [o.customer?.city, o.customer?.state].filter(Boolean).join(' - ') || 'Sem cidade'; m.set(k, [...(m.get(k) ?? []), o]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pending]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['routes'] }); qc.invalidateQueries({ queryKey: ['activities'] }); };
  const create = useMutation({
    mutationFn: () => saveRoute({ name: name.trim() || `Rota ${fmtDate(date)}`, route_date: date, driver: driver || null, vehicle: vehicle || null, order_ids: [...sel] }),
    onSuccess: async () => { toast.success('Rota criada.'); await logActivity({ kind: 'pedido', title: `Rota de entrega criada · ${sel.size} pedido(s)`, link: '/rotas', actor_id: session?.user.id, actor_name: profile?.name ?? null }); invalidate(); setSel(new Set()); setTab('rotas'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const status = useMutation({ mutationFn: (v: { id: string; status: RouteStatus }) => setRouteStatus(v.id, v.status), onSuccess: () => { toast.success('Rota atualizada.'); invalidate(); } });
  const remove = useMutation({ mutationFn: deleteRoute, onSuccess: invalidate });
  const openPrint = useMutation({
    mutationFn: async (r: DeliveryRoute) => ({ route: r, orders: await Promise.all(r.order_ids.map((id) => getOrder(id))) }),
    onSuccess: (d) => { setPrint(d as never); setTimeout(() => window.print(), 400); },
  });

  const selectedTotal = pending.filter((o) => sel.has(o.id));

  return (
    <>
      <PageHeader title="Rotas de entrega" description="Agrupe pedidos por cidade ou rede, gere o romaneio para o motorista e as etiquetas de caixa." actions={<Tabs value={tab} onChange={setTab} items={[{ value: 'rotas', label: 'Rotas', count: routes.data?.length }, { value: 'montar', label: 'Montar rota' }]} />} />
      {tab === 'montar' ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Pedidos aguardando entrega" padded={false}>
            {byCity.length ? byCity.map(([city, list]) => (
              <div key={city}>
                <div className="flex items-center gap-2 bg-surface-2/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted"><Truck className="size-3.5" /> {city} <Badge>{list.length}</Badge>
                  <button className="ml-auto text-brand" onClick={() => setSel((s) => { const n = new Set(s); list.forEach((o) => n.add(o.id)); return n; })}>selecionar todos</button></div>
                {list.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-3 border-t border-line px-4 py-2 text-sm hover:bg-surface-2/40">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={sel.has(o.id)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(o.id) : n.delete(o.id); return n; })} />
                    <span className="flex-1 truncate"><b>#{o.order_number}</b> · {o.customer?.name}</span>
                    <span className="text-muted">{fmtDate(o.delivery_date ?? o.order_date)}</span>
                    <span className="num w-24 text-right">{fmtBRL(o.total_value)}</span>
                  </label>
                ))}
              </div>
            )) : <EmptyState title="Nenhum pedido aguardando entrega" />}
          </Card>
          <Card title="Nova rota">
            <div className="flex flex-col gap-3">
              <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Santos e Guarujá" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Veículo"><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Placa" /></Field>
              </div>
              <Field label="Motorista"><Input value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
              <div className="rounded-xl bg-surface-2 p-3 text-sm"><b>{sel.size}</b> pedido(s) · {fmtBRL(selectedTotal.reduce((s, o) => s + Number(o.total_value), 0))}</div>
              {canWrite && <Button icon={<Plus className="size-4" />} disabled={!sel.size} loading={create.isPending} onClick={() => create.mutate()}>Criar rota</Button>}
            </div>
          </Card>
        </div>
      ) : (
        <Card padded={false}>
          {routes.data?.length ? (
            <Table><thead><tr><th className="th">Rota</th><th className="th">Data</th><th className="th">Motorista</th><th className="th text-right">Pedidos</th><th className="th">Status</th><th className="th" /></tr></thead>
              <tbody>{routes.data.map((r) => (
                <tr key={r.id}><td className="td font-medium">{r.name}</td><td className="td text-muted">{fmtDate(r.route_date)}</td><td className="td">{r.driver ?? '—'} {r.vehicle ? `· ${r.vehicle}` : ''}</td><td className="td num text-right">{r.order_ids.length}</td>
                  <td className="td"><Badge tone={RSTATUS[r.status].tone} dot>{RSTATUS[r.status].label}</Badge></td>
                  <td className="td whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" icon={<Printer className="size-3.5" />} onClick={() => openPrint.mutate(r)}>Romaneio e etiquetas</Button>
                    {canWrite && r.status === 'planejada' && <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: r.id, status: 'em_rota' })}>Saiu</Button>}
                    {canWrite && r.status === 'em_rota' && <Button size="sm" variant="ghost" onClick={() => status.mutate({ id: r.id, status: 'concluida' })}>Entregue</Button>}
                    {canWrite && <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Excluir rota?') && remove.mutate(r.id)} />}
                  </td></tr>
              ))}</tbody></Table>
          ) : <EmptyState icon={<Truck className="size-5" />} title="Nenhuma rota" description="Monte a primeira rota agrupando pedidos por cidade." action={<Button onClick={() => setTab('montar')}>Montar rota</Button>} />}
        </Card>
      )}

      <Dialog open={!!print} onClose={() => setPrint(null)} title={`Romaneio · ${print?.route.name ?? ''}`} wide footer={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button>}>
        {print && (
          <div className="print:text-black">
            <div className="mb-3 text-sm text-muted">{fmtDate(print.route.route_date)} · {print.route.driver ?? 'sem motorista'} {print.route.vehicle ? `· ${print.route.vehicle}` : ''}</div>
            <Table dense><thead><tr><th className="th">#</th><th className="th">Loja</th><th className="th">Endereço</th><th className="th text-right">Caixas</th><th className="th">Assinatura</th></tr></thead>
              <tbody>{print.orders.map((o) => (
                <tr key={o.id}><td className="td font-semibold">#{o.order_number}</td><td className="td">{o.customer?.name}</td><td className="td text-xs">{[o.customer?.city, o.customer?.state].filter(Boolean).join(' - ')}</td><td className="td num text-right">{fmtInt(o.items.reduce((s, i) => s + Number(i.quantity_boxes), 0))}</td><td className="td"><div className="h-6 w-40 border-b border-line" /></td></tr>
              ))}</tbody></Table>
            <h4 className="mt-6 mb-2 font-display font-bold">Etiquetas de caixa</h4>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {print.orders.flatMap((o) => o.items.map((i, idx) => (
                <div key={o.id + idx} className="rounded-lg border border-line p-2 text-xs">
                  <div className="flex items-center gap-1 font-semibold"><QrCode className="size-3.5" /> Pedido #{o.order_number}</div>
                  <div className="truncate">{o.customer?.name}</div>
                  <div className="truncate">{i.product?.description ?? i.raw_description}</div>
                  <div className="num">{fmtInt(i.quantity_boxes)} caixa(s)</div>
                  <CodeLabel text={`ISA-${o.order_number}-${String(idx + 1).padStart(2, '0')}`} />
                </div>
              )))}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
