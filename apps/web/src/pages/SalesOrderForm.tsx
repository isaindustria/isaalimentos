import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Save, Trash2, Users } from 'lucide-react';
import { listCustomers } from '@/api/customers';
import { listProducts } from '@/api/products';
import { getSaleUnitRules, saveSalesOrder } from '@/api/sales';
import { logActivity } from '@/api/activity';
import { Button, Card, Field, Input, PageHeader, Select, Table, Textarea } from '@/components/primitives';
import { SearchSelect, type SearchOption } from '@/components/SearchSelect';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fmtCnpj, normalizeKey, orderTotals, quantityError, saleUnitFor, type SaleUnit } from '@/domain/sales';
import { fmtBRL } from '@/lib/utils';
import type { Order, OrderItem, OrderStatus, Product } from '@/lib/types';
import { STATUS_LABEL } from './OrdersPage';
import { useAuth } from '@/hooks/useAuth';
import { useEditLock } from '@/hooks/useRealtime';

interface Line { key: number; reference: string; code: string; quantity: string; price: string }
const emptyLine = (): Line => ({ key: Date.now() + Math.random(), reference: '', code: '', quantity: '', price: '' });
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const fmtQty = (n: number, u: SaleUnit | null) => (u === 'kg' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : String(n));

/** Formulário do pedido de venda: cliente por nome ou CNPJ, desconto financeiro do cadastro e itens em kg ou unidade. */
export default function SalesOrderForm({ existing }: { existing?: Order & { items: OrderItem[] } }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session, profile } = useAuth();
  const editing = Boolean(existing);
  const editors = useEditLock(existing ? `order:${existing.id}` : 'order:new');

  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const rules = useQuery({ queryKey: ['sale-unit-rules'], queryFn: getSaleUnitRules });

  const [customerId, setCustomerId] = useState<string | null>(existing?.customer_id ?? null);
  const [discount, setDiscount] = useState<number>(Number(existing?.discount_pct ?? 0));
  const [orderNumber, setOrderNumber] = useState(existing?.order_number ?? '');
  const [orderDate, setOrderDate] = useState(existing?.order_date ?? new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(existing?.delivery_date ?? '');
  const [status, setStatus] = useState<OrderStatus>(existing?.status ?? 'aberto');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(() =>
    existing?.items.length
      ? existing.items.map((it, i) => ({ key: i + 1, reference: it.product_reference ?? '', code: it.product_code ?? '', quantity: it.quantity != null ? String(it.quantity) : '', price: it.unit_price != null ? String(it.unit_price) : '' }))
      : [emptyLine()],
  );
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const saving = useRef(false);
  const touch = () => setDirty(true);

  // Aviso ao sair com alterações não salvas (fechar aba ou clicar em outro menu).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.getAttribute('href') === window.location.hash) return;
      if (!window.confirm('Há alterações não salvas neste pedido. Sair mesmo assim?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
  }, [dirty]);

  const productList = products.data ?? [];
  const byCode = useMemo(() => new Map(productList.map((p) => [p.code, p])), [productList]);
  const references = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of productList) if (p.reference?.trim()) m.set(normalizeKey(p.reference), m.get(normalizeKey(p.reference)) ?? p.reference.trim());
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'pt'));
  }, [productList]);
  const customer = customers.data?.find((c) => c.id === customerId) ?? null;
  const discountOptions = useMemo(() => {
    const set = [...(customer?.financial_discounts ?? []).map(Number)];
    if (discount && !set.includes(discount)) set.push(discount); // pedido salvo com desconto que saiu do cadastro
    return set;
  }, [customer, discount]);

  const nameOptions: SearchOption[] = useMemo(() => (customers.data ?? []).map((c) => ({ value: c.id, label: c.name, sub: fmtCnpj(c.cnpj), search: c.cnpj ?? '' })), [customers.data]);
  const cnpjOptions: SearchOption[] = useMemo(() => (customers.data ?? []).filter((c) => c.cnpj).map((c) => ({ value: c.id, label: fmtCnpj(c.cnpj), sub: c.name, search: c.cnpj ?? '' })), [customers.data]);
  const refOptions: SearchOption[] = references.map((r) => ({ value: r, label: r }));

  function pickCustomer(id: string | null) {
    setCustomerId(id);
    setDiscount(0); // ao trocar ou limpar o cliente, o desconto volta para "sem desconto"
    touch();
  }

  const unitOf = (p: Product | undefined): SaleUnit | null => (p ? saleUnitFor(p.reference, rules.data) : null);
  const inRef = (p: Product, ref: string) => !ref || normalizeKey(p.reference) === normalizeKey(ref);
  function update(key: number, patch: Partial<Line>) { setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))); touch(); }
  function changeRef(l: Line, ref: string | null) {
    const p = byCode.get(l.code);
    update(l.key, { reference: ref ?? '', ...(p && !inRef(p, ref ?? '') ? { code: '', quantity: '', price: '' } : {}) });
  }
  function pickProduct(l: Line, code: string | null) {
    if (!code) { update(l.key, { code: '', price: '' }); return; }
    const p = byCode.get(code)!;
    const dup = lines.find((x) => x.key !== l.key && x.code === code);
    if (dup) {
      const idx = lines.indexOf(dup) + 1;
      if (window.confirm(`${p.description} já está na linha ${idx}. OK = juntar as quantidades nessa linha. Cancelar = manter em linhas separadas.`)) {
        const q = (num(dup.quantity) ?? 0) + (num(l.quantity) ?? 0);
        setLines((ls) => ls.filter((x) => x.key !== l.key).map((x) => (x.key === dup.key ? { ...x, quantity: q ? String(q) : x.quantity } : x)));
        touch();
        return;
      }
    }
    const u = unitOf(p);
    let q = l.quantity;
    if (u === 'un' && q && !Number.isInteger(num(q))) q = '';
    const ref = references.find((r) => normalizeKey(r) === normalizeKey(p.reference)) ?? p.reference ?? '';
    update(l.key, { code, reference: ref, quantity: q });
  }

  const calc = lines.map((l) => {
    const p = byCode.get(l.code);
    const unit = unitOf(p);
    const q = num(l.quantity), price = num(l.price);
    const errs: Record<string, string> = {};
    const blank = !l.code && !l.quantity && !l.price;
    if (!blank) {
      if (!p) errs.product = 'Escolha o produto na lista.';
      else if (!unit) errs.unit = `Referência "${p.reference || 'vazia'}" sem unidade de venda cadastrada.`;
      const qe = quantityError(q, unit); if (p && qe) errs.quantity = qe;
      if (price == null || !Number.isFinite(price)) errs.price = 'Informe o valor unitário.';
      else if (price < 0) errs.price = 'O valor não pode ser negativo.';
    }
    return { l, p, unit, q, price, errs, blank };
  });
  const filled = calc.filter((c) => !c.blank);
  const totals = orderTotals(calc.map((c) => ({ quantity: c.blank || Object.keys(c.errs).length ? null : c.q, unit_price: c.price })), discount);
  const lineErrors = filled.some((c) => Object.keys(c.errs).length);
  const formErrors = { customer: !customer ? 'Selecione um cliente da lista.' : '', items: !filled.length ? 'Inclua pelo menos um item com produto, quantidade e preço.' : '' };
  const valid = !formErrors.customer && !formErrors.items && !lineErrors;

  const save = useMutation({
    mutationFn: () => saveSalesOrder({
      id: existing?.id,
      customer: customer!,
      order_number: orderNumber.trim() || null,
      order_date: orderDate || null,
      delivery_date: deliveryDate || null,
      status,
      notes: notes.trim() || null,
      discount_pct: discount,
      items: filled.map((c) => ({ product: c.p!, sale_unit: c.unit!, quantity: c.q!, unit_price: c.price! })),
    }),
    onSuccess: async (r) => {
      setDirty(false);
      toast.success(editing ? 'Pedido atualizado.' : 'Pedido salvo.');
      await logActivity({ kind: 'pedido', title: `${editing ? 'Pedido atualizado' : 'Novo pedido'}${orderNumber ? ' #' + orderNumber : ''} · ${customer?.name}`, body: `${filled.length} item(ns) · ${fmtBRL(totals.total)}`, link: `/pedidos/${r.id}`, actor_id: session?.user.id, actor_name: profile?.name ?? null }).catch(() => {});
      ['orders', 'demand', 'activities'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ['order', r.id] });
      navigate(`/pedidos/${r.id}`);
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
    onSettled: () => { saving.current = false; },
  });
  function submit() {
    setShowErrors(true);
    if (!valid) { toast.error('Corrija os campos marcados em vermelho.'); return; }
    if (saving.current) return; // evita salvar duas vezes por clique repetido
    saving.current = true;
    save.mutate();
  }
  function back() { if (!dirty || window.confirm('Há alterações não salvas neste pedido. Sair mesmo assim?')) { setDirty(false); navigate(-1); } }
  const err = (m?: string) => (showErrors && m ? <p className="mt-1 text-xs text-danger">{m}</p> : null);

  return (
    <>
      <PageHeader
        eyebrow="Pedidos"
        title={editing ? `Editar pedido ${existing?.order_number ? '#' + existing.order_number : ''}` : 'Novo pedido'}
        description="Pedido de venda: escolha o cliente pelo nome ou CNPJ e os produtos pela referência, código ou nome."
        actions={<>
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={back}>Voltar</Button>
          <Button icon={<Save className="h-4 w-4" />} onClick={submit} loading={save.isPending} disabled={save.isPending}>Salvar pedido</Button>
        </>}
      />
      {editors.length > 0 && (
        <Alert className="mb-4 border-warn/40 bg-warn/10">
          <Users />
          <AlertTitle>{editors.map((e) => e.name).join(', ')} {editors.length > 1 ? 'também estão' : 'também está'} editando {editing ? 'este pedido' : 'um pedido novo'} agora</AlertTitle>
          <AlertDescription>Combine antes de salvar para não sobrescrever o trabalho de ninguém. O que for salvo por último prevalece.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 min-[1700px]:grid-cols-[minmax(340px,1fr)_2.6fr]">
        <Card title="Dados do pedido">
          <div className="space-y-4">
            <Field label="Cliente / loja">
              <SearchSelect id="cliente" ariaLabel="Cliente / loja" options={nameOptions} value={customerId} onChange={pickCustomer} placeholder="Digite o nome do cliente…" invalid={showErrors && !!formErrors.customer} digitsSearch />
              {err(formErrors.customer)}
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CNPJ">
                <SearchSelect id="cnpj" ariaLabel="CNPJ" options={cnpjOptions} value={customerId} onChange={pickCustomer} placeholder="Digite o CNPJ…" invalid={showErrors && !!formErrors.customer} digitsSearch />
              </Field>
              <Field label="Desconto financeiro">
                <Select id="desconto" value={String(discount)} disabled={!customer} onChange={(e) => { setDiscount(Number(e.target.value)); touch(); }}>
                  <option value="0">Sem desconto</option>
                  {discountOptions.map((d) => <option key={d} value={d}>{String(d).replace('.', ',')}%</option>)}
                </Select>
              </Field>
            </div>
            <div className="text-xs text-muted">Vendedor: <b className="text-ink">{customer ? customer.seller_name || 'sem vendedor' : '—'}</b></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Data"><Input id="data" type="date" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); touch(); }} /></Field>
              <Field label="Status">
                <Select id="status" value={status} onChange={(e) => { setStatus(e.target.value as OrderStatus); touch(); }}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
              <Field label="Nº do pedido"><Input id="numero" value={orderNumber} onChange={(e) => { setOrderNumber(e.target.value); touch(); }} placeholder="opcional" /></Field>
              <Field label="Entrega"><Input id="entrega" type="date" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); touch(); }} /></Field>
            </div>
            <Field label="Observações"><Textarea id="obs" value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} /></Field>
            <dl className="grid gap-1 rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal dos itens</dt><dd className="num">{fmtBRL(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Desconto financeiro{discount ? ` (${String(discount).replace('.', ',')}%)` : ''}</dt><dd className="num">− {fmtBRL(totals.discount)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="num">{fmtBRL(totals.total)}</dd></div>
            </dl>
          </div>
        </Card>
        <Card title="Itens do pedido" padded={false} action={<Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setLines((ls) => [...ls, emptyLine()]); touch(); }}>Adicionar item</Button>}>
          <Table>
            <thead>
              <tr>
                <th className="th">Referência</th><th className="th">Código</th><th className="th">Produto</th>
                <th className="th text-right">Quantidade</th><th className="th">Unidade de venda</th>
                <th className="th text-right">Valor unitário</th><th className="th text-right">Valor total</th><th className="th" />
              </tr>
            </thead>
            <tbody>
              {calc.map((c, i) => {
                const pool = productList.filter((p) => inRef(p, c.l.reference));
                const codeOpts = pool.map((p) => ({ value: p.code, label: p.code, sub: `${p.description}${p.reference ? ' · ' + p.reference : ''}` }));
                const nameOpts = pool.map((p) => ({ value: p.code, label: p.description, sub: `${p.code}${p.reference ? ' · ' + p.reference : ''}` }));
                const e = showErrors ? c.errs : {};
                return (
                  <tr key={c.l.key} className="align-top">
                    <td className="td min-w-[130px]"><SearchSelect ariaLabel={`Referência da linha ${i + 1}`} options={refOptions} value={references.find((r) => normalizeKey(r) === normalizeKey(c.l.reference)) ?? null} onChange={(v) => changeRef(c.l, v)} placeholder="Todas" /></td>
                    <td className="td min-w-[120px]"><SearchSelect ariaLabel={`Código da linha ${i + 1}`} options={codeOpts} value={c.l.code || null} onChange={(v) => pickProduct(c.l, v)} placeholder="Código" invalid={!!e.product} /></td>
                    <td className="td min-w-[240px]"><SearchSelect ariaLabel={`Produto da linha ${i + 1}`} options={nameOpts} value={c.l.code || null} onChange={(v) => pickProduct(c.l, v)} placeholder="Produto" invalid={!!e.product} />{err(c.errs.product)}</td>
                    <td className="td w-28">
                      <Input aria-label={`Quantidade da linha ${i + 1}`} inputMode={c.unit === 'un' ? 'numeric' : 'decimal'} type="number" min={0} step={c.unit === 'un' ? 1 : 0.001} className={`h-10 text-right ${e.quantity ? 'border-danger' : ''}`} value={c.l.quantity} onChange={(ev) => update(c.l.key, { quantity: ev.target.value })} />
                      {err(c.errs.quantity)}
                    </td>
                    <td className="td whitespace-nowrap pt-5">{c.unit ? (c.unit === 'kg' ? 'kg' : 'unidade') : c.p ? <span className="text-xs text-danger">pendente</span> : '—'}{c.p && !c.unit && err(c.errs.unit)}{c.p && !c.unit && !showErrors && <p className="mt-1 max-w-[160px] whitespace-normal text-[11px] text-danger">Referência sem regra de unidade.</p>}</td>
                    <td className="td w-32">
                      <Input aria-label={`Valor unitário da linha ${i + 1}`} type="number" min={0} step="0.01" inputMode="decimal" className={`h-10 text-right ${e.price ? 'border-danger' : ''}`} value={c.l.price} onChange={(ev) => update(c.l.key, { price: ev.target.value })} placeholder={c.unit === 'kg' ? 'R$/kg' : 'R$/un'} />
                      {err(c.errs.price)}
                    </td>
                    <td className="td whitespace-nowrap pt-5 text-right num font-semibold">{c.q && c.price != null && !Object.keys(c.errs).length ? fmtBRL(totals.lineTotals[i]) : '—'}<div className="text-[11px] font-normal text-muted">{c.q && c.unit ? `${fmtQty(c.q, c.unit)} ${c.unit === 'kg' ? 'kg' : 'un'}` : ''}</div></td>
                    <td className="td pt-4 text-right"><button className="p-1 text-muted hover:text-danger" onClick={() => { setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== c.l.key) : [emptyLine()])); touch(); }} aria-label={`Remover linha ${i + 1}`}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {showErrors && formErrors.items && <p className="px-5 pt-3 text-xs text-danger">{formErrors.items}</p>}
          <p className="px-5 py-3 text-xs text-muted">A unidade de venda vem da referência do produto (Ander e ISA em kg; pote temp., pote frut. e revenda em unidade). Valor total = quantidade × valor unitário. Itens em kg entram na produção em kg, sem conversão.</p>
        </Card>
      </div>
    </>
  );
}
