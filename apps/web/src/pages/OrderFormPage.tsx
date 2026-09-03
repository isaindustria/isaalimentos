import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Save } from 'lucide-react';
import { getOrder, saveManualOrder, type ManualOrderItemInput } from '@/api/orders';
import { listCustomers } from '@/api/customers';
import { listProducts } from '@/api/products';
import { getCurrentStock } from '@/api/stock';
import { logActivity } from '@/api/activity';
import { listPrices, resolvePrice } from '@/api/v14';
import { Button, Card, Field, Input, PageHeader, Select, Spinner, Table, Textarea } from '@/components/primitives';
import { fmtBRL, fmtInt } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { STATUS_LABEL } from './OrdersPage';
import { useAuth } from '@/hooks/useAuth';
import { useEditLock } from '@/hooks/useRealtime';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Users } from 'lucide-react';

interface Line extends ManualOrderItemInput {
  key: number;
}

export default function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const editing = Boolean(id);
  const editors = useEditLock(id ? `order:${id}` : 'order:new');

  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const stock = useQuery({ queryKey: ['current-stock'], queryFn: getCurrentStock });
  const prices = useQuery({ queryKey: ['prices'], queryFn: listPrices });
  const existing = useQuery({ queryKey: ['order', id], queryFn: () => getOrder(id!), enabled: editing });

  const [customerId, setCustomerId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState<OrderStatus>('aberto');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: 1, product_code: '', quantity_boxes: 1, units_per_box: 48, unit_price: null }]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!existing.data || loaded) return;
    const o = existing.data;
    setCustomerId(o.customer_id ?? '');
    setOrderNumber(o.order_number ?? '');
    setOrderDate(o.order_date ?? '');
    setDeliveryDate(o.delivery_date ?? '');
    setStatus(o.status);
    setNotes(o.notes ?? '');
    setLines(o.items.map((it, i) => ({ key: i + 1, product_code: it.product_code ?? '', quantity_boxes: Number(it.quantity_boxes), units_per_box: it.units_per_box, unit_price: it.unit_price })));
    setLoaded(true);
  }, [existing.data, loaded]);

  const stockMap = useMemo(() => new Map((stock.data ?? []).map((s) => [s.code, s])), [stock.data]);
  const totals = useMemo(() => {
    const boxes = lines.reduce((s, l) => s + (l.quantity_boxes || 0), 0);
    const units = lines.reduce((s, l) => s + (l.quantity_boxes || 0) * (l.units_per_box || 0), 0);
    const value = lines.reduce((s, l) => s + (l.quantity_boxes || 0) * (l.unit_price ?? 0), 0);
    return { boxes, units, value };
  }, [lines]);

  function update(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function pickProduct(key: number, code: string) {
    const p = products.data?.find((x) => x.code === code);
    const cust = customers.data?.find((c) => c.id === customerId);
    const price = resolvePrice(prices.data ?? [], code, customerId || null, cust?.group_name ?? null);
    update(key, { product_code: code, units_per_box: p?.units_per_box ?? 48, ...(price != null ? { unit_price: price } : {}) });
  }

  const save = useMutation({
    mutationFn: () =>
      saveManualOrder({
        id,
        customer_id: customerId || null,
        order_number: orderNumber.trim() || null,
        order_date: orderDate || null,
        delivery_date: deliveryDate || null,
        status,
        notes,
        items: lines.filter((l) => l.product_code && l.quantity_boxes > 0),
      }),
    onSuccess: async (r) => {
      const cust = customers.data?.find((c) => c.id === customerId)?.name ?? 'sem cliente';
      toast.success(editing ? 'Pedido atualizado.' : 'Pedido criado.');
      await logActivity({ kind: 'pedido', title: `${editing ? 'Pedido atualizado' : 'Novo pedido'} ${orderNumber ? '#' + orderNumber : ''} · ${cust}`, body: `${fmtInt(totals.boxes)} caixas · ${fmtInt(totals.units)} unidades`, link: `/pedidos/${r.id}`, actor_id: session?.user.id, actor_name: profile?.name ?? null });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order', r.id] });
      qc.invalidateQueries({ queryKey: ['demand'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      navigate(`/pedidos/${r.id}`);
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  const valid = lines.some((l) => l.product_code && l.quantity_boxes > 0);
  if (editing && existing.isLoading) return <div className="grid place-items-center py-20"><Spinner /></div>;

  return (
    <>
      <PageHeader
        eyebrow="Pedidos"
        title={editing ? `Editar pedido ${existing.data?.order_number ? '#' + existing.data.order_number : ''}` : 'Novo pedido'}
        description="Lance um pedido direto no sistema, sem PDF. Ele entra no cálculo de produção como qualquer outro."
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Voltar</Button>
            <Button icon={<Save className="h-4 w-4" />} onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>Salvar pedido</Button>
          </>
        }
      />
      {editors.length > 0 && (
        <Alert className="mb-4 border-warn/40 bg-warn/10">
          <Users />
          <AlertTitle>{editors.map((e) => e.name).join(', ')} {editors.length > 1 ? 'também estão' : 'também está'} editando {editing ? 'este pedido' : 'um pedido novo'} agora</AlertTitle>
          <AlertDescription>Combine antes de salvar para não sobrescrever o trabalho de ninguém. O que for salvo por último prevalece.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card title="Dados do pedido">
          <div className="space-y-4">
            <Field label="Cliente / loja">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Selecione…</option>
                {customers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nº do pedido"><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="opcional" /></Field>
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Data"><Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} /></Field>
              <Field label="Entrega"><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></Field>
            </div>
            <Field label="Observações"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <div className="rounded-xl bg-surface-2 p-3 text-sm grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div><div className="text-xs text-muted">Caixas</div><b className="num">{fmtInt(totals.boxes)}</b></div>
              <div><div className="text-xs text-muted">Unidades</div><b className="num">{fmtInt(totals.units)}</b></div>
              <div><div className="text-xs text-muted">Valor</div><b className="num">{fmtBRL(totals.value)}</b></div>
            </div>
          </div>
        </Card>
        <Card title="Itens" padded={false} action={<Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLines((ls) => [...ls, { key: Date.now(), product_code: '', quantity_boxes: 1, units_per_box: 48, unit_price: null }])}>Adicionar item</Button>}>
          <Table>
            <thead>
              <tr>
                <th className="th">Produto</th>
                <th className="th text-right">Caixas</th>
                <th className="th text-right">Un/cx</th>
                <th className="th text-right">Unidades</th>
                <th className="th text-right">Vlr. caixa</th>
                <th className="th text-right">Estoque</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const s = stockMap.get(l.product_code);
                const units = (l.quantity_boxes || 0) * (l.units_per_box || 0);
                const short = s && units > Number(s.total);
                return (
                  <tr key={l.key}>
                    <td className="td min-w-[260px]">
                      <Select value={l.product_code} onChange={(e) => pickProduct(l.key, e.target.value)} className="h-9">
                        <option value="">Selecione o produto…</option>
                        {products.data?.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.description}</option>)}
                      </Select>
                    </td>
                    <td className="td"><Input type="number" min={0} className="h-9 w-24 text-right" value={l.quantity_boxes} onChange={(e) => update(l.key, { quantity_boxes: Number(e.target.value) })} /></td>
                    <td className="td"><Input type="number" min={1} className="h-9 w-20 text-right" value={l.units_per_box} onChange={(e) => update(l.key, { units_per_box: Number(e.target.value) })} /></td>
                    <td className="td text-right num font-semibold">{fmtInt(units)}</td>
                    <td className="td"><Input type="number" min={0} step="0.01" className="h-9 w-28 text-right" value={l.unit_price ?? ''} onChange={(e) => update(l.key, { unit_price: e.target.value ? Number(e.target.value) : null })} placeholder="—" /></td>
                    <td className={`td text-right num ${short ? 'text-danger font-semibold' : 'text-muted'}`}>{s ? fmtInt(s.total) : '—'}</td>
                    <td className="td text-right"><button className="text-muted hover:text-danger p-1" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remover item"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="text-xs text-muted px-5 py-3">Em vermelho: pedido maior que o estoque atual, vai gerar necessidade de produção.</p>
        </Card>
      </div>
    </>
  );
}
