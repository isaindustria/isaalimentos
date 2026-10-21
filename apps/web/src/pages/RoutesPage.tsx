import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Plus, Printer, Truck, Trash2, Undo2 } from 'lucide-react';
import { deleteRoute, listRoutes, saveRoute, setRouteStatus } from '@/api/v14';
import { listOrders, getOrder } from '@/api/orders';
import { logActivity } from '@/api/activity';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, PageHeader, Select, Table, Tabs } from '@/components/primitives';
import { fmtDate, fmtDateTime } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { FaturamentoPedidos } from '@/components/FaturamentoPedidos';
import { carregarPlanejamento, entregarRota, salvarNF, listVehicles, marcarRotaEtapa, pesoPorPedido, removeVehicle, saveVehicle, tirarDaRota, voltarParaRotas, type Vehicle } from '@/api/planejamento';
import { equivalencia } from '@/domain/planejamento';
import type { DeliveryRoute, Order, OrderItem, RouteStatus } from '@/lib/types';

const RSTATUS: Record<RouteStatus, { label: string; tone: 'info' | 'brand' | 'ok' }> = { planejada: { label: 'Planejada', tone: 'info' }, em_rota: { label: 'Saiu (em rota)', tone: 'brand' }, concluida: { label: 'Entregue', tone: 'ok' } };
type Aba = 'faturamento' | 'montar' | 'rotas' | 'relatorio';
type ItemRomaneio = OrderItem & { product?: { code: string; description: string; weight_g: number | null; equivalence_kg: number | null } | null };

/** Quantidade de saída em unidades: o que é unidade fica; kg vira unidades pelo cadastro (10 kg do 471 de 10 kg = 1 unidade). */
function unidadesDeSaida(i: ItemRomaneio): number {
  if (i.sale_unit === 'kg') {
    const eq = equivalencia(i.product ? { code: i.product.code, description: i.product.description, reference: null, weight_g: i.product.weight_g, equivalence_kg: i.product.equivalence_kg } : undefined);
    return eq ? Math.ceil(Number(i.quantity ?? 0) / eq - 1e-9) : Number(i.quantity ?? 0);
  }
  if (i.sale_unit === 'un') return Number(i.quantity ?? 0);
  return Number(i.quantity_units ?? 0) || Number(i.quantity_boxes ?? 0);
}

/**
 * Rotas de entrega (solicitação #17), na ordem do fluxo: Faturamento → Montar rota → Rotas → Relatório.
 * O pedido sai de uma aba e vai para a próxima; dá para voltar cada passo (Relatório → Rotas só o ADM).
 */
export default function RoutesPage() {
  const qc = useQueryClient();
  const { canWriteArea, isAdmin, session, profile } = useAuth();
  const pode = canWriteArea('compras');
  const [tab, setTab] = useState<Aba>('faturamento');
  const plano = useQuery({ queryKey: ['planejamento'], queryFn: carregarPlanejamento, refetchInterval: 30000 });
  const pesos = useQuery({ queryKey: ['planejamento', 'pesos'], queryFn: pesoPorPedido });
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: listVehicles });
  const orders = useQuery({ queryKey: ['orders', { status: 'todos' }], queryFn: () => listOrders({ status: 'todos' }) });
  const routes = useQuery({ queryKey: ['routes'], queryFn: listRoutes });
  const [vehicleId, setVehicleId] = useState('');
  const [cadVeiculo, setCadVeiculo] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [driver, setDriver] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [print, setPrint] = useState<{ route: DeliveryRoute; orders: Array<Order & { items: ItemRomaneio[] }> } | null>(null);
  const kgDe = (id: string) => pesos.data?.get(id) ?? 0;
  const fmtKg = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;

  const ativas = (routes.data ?? []).filter((r) => r.status !== 'concluida');
  const concluidas = (routes.data ?? []).filter((r) => r.status === 'concluida');
  const emRota = useMemo(() => new Set((routes.data ?? []).filter((r) => r.status !== 'concluida').flatMap((r) => r.order_ids)), [routes.data]);
  const porId = useMemo(() => new Map((orders.data ?? []).map((o) => [o.id, o])), [orders.data]);
  // Faturamento: pedidos com algum item ainda fora de Faturamento, ou devolvidos de Montar rota
  const faturamento = (plano.data?.faturamento ?? []).filter((p) => p.rotaEtapa === 'faturamento' || !p.todos.every((i) => i.stage === 'faturado'));
  // Montar rota: tudo em Faturamento, fora de rota, não devolvido
  const montar = useMemo(() => (orders.data ?? []).filter((o) => o.status === 'faturado' && o.rota_etapa !== 'faturamento' && !emRota.has(o.id)), [orders.data, emRota]);
  const byCity = useMemo(() => {
    const m = new Map<string, Order[]>();
    for (const o of montar) { const k = [o.customer?.city, o.customer?.state].filter(Boolean).join(' - ') || 'Sem cidade'; m.set(k, [...(m.get(k) ?? []), o]); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [montar]);

  const refresh = () => ['routes', 'planejamento', 'orders', 'order', 'activities'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const fail = (e: Error) => toast.error(e.message);
  const create = useMutation({
    mutationFn: () => { const v = vehicles.data?.find((x) => x.id === vehicleId); return saveRoute({ name: name.trim() || `Rota ${fmtDate(date)}`, route_date: date, driver: driver || null, vehicle: v ? `${v.model} ${v.plate}` : vehicle || null, vehicle_id: v?.id ?? null, total_weight_kg: Math.round(cargaKg * 10) / 10, order_ids: selecionados.map((o) => o.id) }); },
    onSuccess: async () => { toast.success('Rota criada: os pedidos foram para a aba Rotas.'); await logActivity({ kind: 'pedido', title: `Rota de entrega criada · ${selecionados.length} pedido(s)`, link: '/rotas', actor_id: session?.user.id, actor_name: profile?.name ?? null }); refresh(); setSel(new Set()); setTab('rotas'); },
    onError: fail,
  });
  const saiu = useMutation({ mutationFn: (id: string) => setRouteStatus(id, 'em_rota'), onSuccess: () => { toast.success('Rota saiu para entrega.'); refresh(); }, onError: fail });
  const entregue = useMutation({ mutationFn: entregarRota, onSuccess: () => { toast.success('Rota entregue: os pedidos foram para o Relatório.'); refresh(); }, onError: fail });
  const voltaRotas = useMutation({ mutationFn: voltarParaRotas, onSuccess: () => { toast.success('Rota voltou para a aba Rotas.'); refresh(); }, onError: fail });
  const tirar = useMutation({ mutationFn: (v: { r: DeliveryRoute; id: string }) => tirarDaRota(v.r, v.id), onSuccess: () => { toast.success('Pedido voltou para Montar rota.'); refresh(); }, onError: fail });
  const etapa = useMutation({ mutationFn: (v: { id: string; e: 'faturamento' | null }) => marcarRotaEtapa(v.id, v.e), onSuccess: (_d, v) => { toast.success(v.e ? 'Pedido voltou para o Faturamento.' : 'Pedido foi para Montar rota.'); refresh(); }, onError: fail });
  const remove = useMutation({ mutationFn: deleteRoute, onSuccess: () => { toast.success('Rota excluída: os pedidos voltaram para Montar rota.'); refresh(); }, onError: fail });
  const openPrint = useMutation({
    mutationFn: async (r: DeliveryRoute) => ({ route: r, orders: (await Promise.all(r.order_ids.map((id) => getOrder(id)))) as Array<Order & { items: ItemRomaneio[] }> }),
    onSuccess: (d) => { setPrint(d); setTimeout(() => window.print(), 400); },
    onError: fail,
  });

  const selecionados = montar.filter((o) => sel.has(o.id));
  const cargaKg = selecionados.reduce((s2, o) => s2 + kgDe(o.id), 0);
  const veiculo = vehicles.data?.find((x) => x.id === vehicleId);

  const pedidosDaRota = (r: DeliveryRoute, voltar: boolean) => (
    <ul className="divide-y divide-line border-t border-line">
      {r.order_ids.map((id) => { const o = porId.get(id); return (
        <li key={id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
          <Link to={`/pedidos/${id}`} className="font-semibold hover:text-brand">#{o?.order_number ?? '—'}</Link>
          <span className="min-w-0 flex-1 truncate">{o?.customer?.name ?? o?.customer_name ?? '—'}</span>
          <span className="text-xs text-muted">{[o?.customer?.city, o?.customer?.state].filter(Boolean).join(' - ')}</span>
          <span className="num w-20 text-right text-xs">{fmtKg(kgDe(id))}</span>
          {voltar && pode && <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => tirar.mutate({ r, id })}>Voltar para Montar rota</Button>}
        </li>
      ); })}
    </ul>
  );

  return (
    <>
      <PageHeader title="Rotas de entrega" description="O pedido segue o fluxo Faturamento → Montar rota → Rotas → Relatório e sai de uma aba quando passa para a próxima."
        actions={<Tabs value={tab} onChange={setTab} items={[{ value: 'faturamento', label: 'Faturamento', count: faturamento.length }, { value: 'montar', label: 'Montar rota', count: montar.length }, { value: 'rotas', label: 'Rotas', count: ativas.length }, { value: 'relatorio', label: 'Relatório', count: concluidas.length }]} />} />

      {tab === 'faturamento' && (
        <>
          <p className="mb-3 text-sm text-muted">Cada cartão é o pedido inteiro, pela entrega mais próxima. O faturamento marca <b>Faturamento ciente</b> (verde) nos itens dele; os itens da Produção ficam com cadeado até o PCP liberar. Quando todos os itens estiverem em Faturamento, o pedido vai sozinho para <b>Montar rota</b>.</p>
          <FaturamentoPedidos pedidos={faturamento} podeMudar={pode} onEnviarMontar={(id) => etapa.mutate({ id, e: null })} />
        </>
      )}

      {tab === 'montar' && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Pedidos prontos para a rota" padded={false}>
            {byCity.length ? byCity.map(([city, list]) => (
              <div key={city}>
                <div className="flex items-center gap-2 bg-surface-2/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted"><Truck className="size-3.5" /> {city} <Badge>{list.length}</Badge>
                  <button className="ml-auto text-brand" onClick={() => setSel((s) => { const n = new Set(s); list.forEach((o) => n.add(o.id)); return n; })}>selecionar todos</button></div>
                {list.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 border-t border-line px-4 py-2 text-sm hover:bg-surface-2/40">
                    <input type="checkbox" aria-label={`Selecionar pedido ${o.order_number ?? ''}`} className="size-4 accent-[var(--brand)]" checked={sel.has(o.id)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n; })} />
                    <span className="min-w-0 flex-1 truncate"><b>#{o.order_number ?? '—'}</b> · {o.customer?.name ?? o.customer_name}</span>
                    <span className="hidden text-muted sm:inline">{fmtDate(o.delivery_date ?? o.order_date)}</span>
                    <span className="num w-20 text-right">{fmtKg(kgDe(o.id))}</span>
                    {pode && <button type="button" className="text-xs text-muted hover:text-brand" title="Voltar para o Faturamento" aria-label={`Voltar pedido ${o.order_number ?? ''} para o Faturamento`} onClick={() => etapa.mutate({ id: o.id, e: 'faturamento' })}><Undo2 className="size-4" /></button>}
                  </div>
                ))}
              </div>
            )) : <EmptyState title="Nenhum pedido pronto para a rota" description="Os pedidos chegam aqui quando todos os itens estão em Faturamento." />}
          </Card>
          <Card title="Nova rota">
            <div className="flex flex-col gap-3">
              <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Santos e Guarujá" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
                <Field label="Veículo">
                  {vehicles.data?.length ? (
                    <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                      <option value="">Escolha o veículo</option>
                      {vehicles.data.map((v) => <option key={v.id} value={v.id}>{v.model} {v.plate}</option>)}
                    </Select>
                  ) : <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Placa (ou cadastre o veículo)" />}
                </Field>
              </div>
              <Field label="Motorista"><Input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Digite o nome do motorista" /></Field>
              <div className={`rounded-xl p-3 text-sm ${veiculo?.capacity_kg && cargaKg > Number(veiculo.capacity_kg) ? 'bg-danger/10 text-danger' : 'bg-surface-2'}`}>
                <b>{selecionados.length}</b> pedido(s) · peso da carga <b>{fmtKg(cargaKg)}</b>
                {veiculo?.capacity_kg ? <div className="text-xs">{cargaKg > Number(veiculo.capacity_kg) ? `Passa da capacidade do ${veiculo.model} (${fmtKg(Number(veiculo.capacity_kg))}) em ${fmtKg(cargaKg - Number(veiculo.capacity_kg))}.` : `Capacidade do ${veiculo.model}: ${fmtKg(Number(veiculo.capacity_kg))} · sobra ${fmtKg(Number(veiculo.capacity_kg) - cargaKg)}.`}</div> : null}
              </div>
              {pode && <Button icon={<Plus className="size-4" />} disabled={!selecionados.length} loading={create.isPending} onClick={() => create.mutate()}>Criar rota</Button>}
              {pode && <Button variant="outline" icon={<Truck className="size-4" />} onClick={() => setCadVeiculo(true)}>Cadastrar veículo</Button>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'rotas' && (ativas.length ? (
        <div className="space-y-3">
          {ativas.map((r) => (
            <Card key={r.id} padded={false}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta(aberta === r.id ? null : r.id)}>
                  <div className="font-display font-bold">{r.name}</div>
                  <div className="text-xs text-muted">{fmtDate(r.route_date)} · {r.driver ?? 'sem motorista'}{r.vehicle ? ` · ${r.vehicle}` : ''} · {r.order_ids.length} pedido(s){r.total_weight_kg ? ` · ${fmtKg(Number(r.total_weight_kg))}` : ''}</div>
                </button>
                <Badge tone={RSTATUS[r.status].tone} dot>{RSTATUS[r.status].label}</Badge>
                <Button size="sm" variant="outline" icon={<Printer className="size-3.5" />} onClick={() => openPrint.mutate(r)}>Romaneio</Button>
                {pode && r.status === 'planejada' && <Button size="sm" icon={<Truck className="size-3.5" />} onClick={() => saiu.mutate(r.id)}>Saiu</Button>}
                {pode && r.status === 'em_rota' && <Button size="sm" icon={<CheckCircle2 className="size-3.5" />} loading={entregue.isPending} onClick={() => confirm(`Marcar a rota ${r.name} como entregue? Os ${r.order_ids.length} pedido(s) vão para o Relatório.`) && entregue.mutate(r)}>Entregue</Button>}
                {pode && <Button size="sm" variant="ghost" className="text-danger" aria-label={`Excluir rota ${r.name}`} icon={<Trash2 className="size-3.5" />} onClick={() => confirm('Excluir a rota? Os pedidos voltam para Montar rota.') && remove.mutate(r.id)} />}
              </div>
              {aberta === r.id && pedidosDaRota(r, true)}
            </Card>
          ))}
          <p className="text-xs text-muted">Clique no nome da rota para ver os pedidos e devolver algum para Montar rota.</p>
        </div>
      ) : <Card><EmptyState icon={<Truck className="size-5" />} title="Nenhuma rota em andamento" description="Monte a rota com os pedidos prontos." action={<Button onClick={() => setTab('montar')}>Montar rota</Button>} /></Card>)}

      {tab === 'relatorio' && (concluidas.length ? (
        <div className="space-y-3">
          {concluidas.map((r) => (
            <Card key={r.id} padded={false}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta(aberta === r.id ? null : r.id)}>
                  <div className="font-display font-bold">{r.name}</div>
                  <div className="text-xs text-muted">{fmtDate(r.route_date)} · {r.driver ?? 'sem motorista'}{r.vehicle ? ` · ${r.vehicle}` : ''} · {r.order_ids.length} pedido(s){r.delivered_at ? ` · entregue em ${fmtDateTime(r.delivered_at)}` : ''}</div>
                </button>
                <Badge tone="info" dot>Entregue</Badge>
                <Button size="sm" variant="outline" icon={<Printer className="size-3.5" />} onClick={() => openPrint.mutate(r)}>Romaneio</Button>
                {isAdmin && <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => confirm('Voltar esta rota para a aba Rotas? Os pedidos deixam de constar como entregues.') && voltaRotas.mutate(r)}>Voltar para Rotas</Button>}
              </div>
              {aberta === r.id && pedidosDaRota(r, false)}
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState title="Nada entregue ainda" description="As rotas marcadas como Entregue aparecem aqui." /></Card>)}

      <Dialog open={!!print} onClose={() => setPrint(null)} title={`Romaneio · ${print?.route.name ?? ''}`} wide footer={<Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir</Button>}>
        {print && (
          <div className="print:text-black">
            <div className="mb-3 text-sm text-muted">{fmtDate(print.route.route_date)} · {print.route.driver ?? 'sem motorista'}{print.route.vehicle ? ` · ${print.route.vehicle}` : ''}</div>
            <Table dense><thead><tr><th className="th">Pedido</th><th className="th">NF</th><th className="th">Cliente</th><th className="th">Cidade</th><th className="th">Bairro</th><th className="th">Produto</th><th className="th text-right">Quantidade (un)</th><th className="th">Assinatura</th></tr></thead>
              <tbody>{print.orders.flatMap((o) => o.items.filter((i) => i.product_code).map((i, k) => (
                <tr key={o.id + k} className={k === 0 ? 'border-t-2 border-line' : ''}>
                  <td className="td font-semibold">{k === 0 ? `#${o.order_number ?? '—'}` : ''}</td>
                  <td className="td">{k === 0 ? <CampoNF pedido={o} pode={pode} /> : null}</td>
                  <td className="td">{k === 0 ? o.customer?.name ?? o.customer_name : ''}</td>
                  <td className="td text-xs">{k === 0 ? [o.customer?.city, o.customer?.state].filter(Boolean).join(' - ') : ''}</td>
                  <td className="td text-xs">{k === 0 ? o.customer?.district ?? '' : ''}</td>
                  <td className="td text-xs">{i.product_code} · {i.product_name ?? i.product?.description ?? i.raw_description}</td>
                  <td className="td num text-right font-semibold">{unidadesDeSaida(i).toLocaleString('pt-BR')}</td>
                  <td className="td">{k === 0 ? <div className="h-6 w-40 border-b border-line" /> : null}</td>
                </tr>
              )))}</tbody></Table>
          </div>
        )}
      </Dialog>
      {cadVeiculo && <VeiculosDialog onClose={() => setCadVeiculo(false)} lista={vehicles.data ?? []} />}
    </>
  );
}

/** Solicitação #19: número da NF do pedido, digitado no romaneio (grava ao sair do campo). */
function CampoNF({ pedido, pode }: { pedido: Order; pode: boolean }) {
  const qc = useQueryClient();
  const [v, setV] = useState(pedido.nf_number ?? '');
  const salvar = useMutation({
    mutationFn: (nf: string) => salvarNF(pedido.id, nf),
    onSuccess: () => { toast.success(`NF do pedido #${pedido.order_number ?? ''} salva.`); qc.invalidateQueries({ queryKey: ['orders'] }); qc.invalidateQueries({ queryKey: ['order', pedido.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!pode) return <span className="num">{pedido.nf_number ?? ''}</span>;
  return (
    <>
      <input aria-label={`NF do pedido ${pedido.order_number ?? ''}`} inputMode="numeric" value={v} placeholder="nº NF"
        className="h-8 w-24 rounded-md border border-line bg-surface px-2 text-sm num print:hidden"
        onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== (pedido.nf_number ?? '')) salvar.mutate(v.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="hidden num print:inline">{v}</span>
    </>
  );
}

/** Cadastro de veículos da rota: modelo, placa e peso que aguenta (o motorista é digitado em cada rota). */
function VeiculosDialog({ onClose, lista }: { onClose: () => void; lista: Vehicle[] }) {
  const qc = useQueryClient();
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [cap, setCap] = useState('');
  const done = () => qc.invalidateQueries({ queryKey: ['vehicles'] });
  const add = useMutation({ mutationFn: () => saveVehicle({ model, plate, capacity_kg: cap ? Number(cap.replace(/\./g, '').replace(',', '.')) : null }), onSuccess: () => { toast.success('Veículo cadastrado.'); setModel(''); setPlate(''); setCap(''); done(); }, onError: (e: Error) => toast.error(e.message) });
  const del = useMutation({ mutationFn: removeVehicle, onSuccess: () => { toast.success('Veículo removido da lista.'); done(); } });
  return (
    <Dialog open onClose={onClose} title="Veículos" description="Modelo, placa e peso que o veículo aguenta. O motorista é digitado em cada rota."
      footer={<Button variant="outline" onClick={onClose}>Fechar</Button>}>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Modelo"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ducato" /></Field>
        <Field label="Veículo (placa)"><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="PLV1G74" /></Field>
        <Field label="Peso (kg)"><Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="3500" /></Field>
        <Button disabled={!model.trim() || !plate.trim()} loading={add.isPending} onClick={() => add.mutate()}>Salvar</Button>
      </div>
      {lista.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {lista.map((v) => <li key={v.id} className="flex items-center gap-3 px-3 py-2"><span className="flex-1"><b>{v.model}</b> · {v.plate}</span><span className="num text-muted">{v.capacity_kg ? `${Number(v.capacity_kg).toLocaleString('pt-BR')} kg` : '—'}</span><button className="text-muted hover:text-danger" aria-label={`Remover ${v.plate}`} onClick={() => del.mutate(v.id)}><Trash2 className="size-4" /></button></li>)}
        </ul>
      )}
    </Dialog>
  );
}
