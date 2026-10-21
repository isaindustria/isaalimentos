import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Save, Trash2, Users } from 'lucide-react';
import { listCustomers } from '@/api/customers';
import { listProducts } from '@/api/products';
import { getSaleUnitRules, openOrdersOf, saveSalesOrder } from '@/api/sales';
import { logActivity } from '@/api/activity';
import { Button, Card, Dialog, Field, Input, PageHeader, Select, Textarea } from '@/components/primitives';
import { SearchSelect, type SearchOption } from '@/components/SearchSelect';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { fmtCnpj, normalizeKey, orderTotals, podeEditarPedido, quantityError, saleUnitFor, type SaleUnit } from '@/domain/sales';
import { fmtBRL, fmtDate } from '@/lib/utils';
import type { Order, OrderItem, OrderStatus, Product } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useEditLock } from '@/hooks/useRealtime';

interface Line { key: number; reference: string; code: string; quantity: string; price: string }
const emptyLine = (): Line => ({ key: Date.now() + Math.random(), reference: '', code: '', quantity: '', price: '' });
/** Aceita vírgula (padrão brasileiro) ou ponto; "1.234,50" também vale. */
const num = (s: string) => { const t = s.trim(); if (t === '') return null; const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return /^-?\d*\.?\d+$/.test(n) ? Number(n) : NaN; };
const fmtQty = (n: number, u: SaleUnit | null) => (u === 'kg' ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : String(n));

/** Formulário do pedido de venda: cliente por nome ou CNPJ, desconto financeiro do cadastro e itens em kg ou unidade. */
export default function SalesOrderForm({ existing }: { existing?: Order & { items: OrderItem[] } }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { session, profile, isAdmin } = useAuth();
  const editing = Boolean(existing);
  const editors = useEditLock(existing ? `order:${existing.id}` : 'order:new');

  const customers = useQuery({ queryKey: ['customers'], queryFn: () => listCustomers() });
  const products = useQuery({ queryKey: ['products', 'active'], queryFn: () => listProducts(false) });
  const rules = useQuery({ queryKey: ['sale-unit-rules'], queryFn: getSaleUnitRules });

  const [customerId, setCustomerId] = useState<string | null>(existing?.customer_id ?? null);
  const [discount, setDiscount] = useState<number>(Number(existing?.discount_pct ?? 0));
  const orderNumber = existing?.order_number ?? '';
  const [orderDate, setOrderDate] = useState(existing?.order_date ?? new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(existing?.delivery_date ?? '');
  // O status saiu desta tela (vai para outra tela): pedido novo nasce Aberto; na edição, mantém o que já tinha.
  const status: OrderStatus = existing?.status ?? 'aberto';
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // Vendas parte 4: pergunta no fim do pedido; pedido novo começa sem resposta (obrigatória para salvar)
  const [otherPack, setOtherPack] = useState<boolean | null>(existing ? (existing.allow_other_packaging ?? null) : null);
  // aviso de pedido em aberto para o mesmo cliente (só em pedido novo)
  const [dupAsk, setDupAsk] = useState<{ name: string; orders: Array<{ order_number: string | null; order_date: string | null; total_value: number }> } | null>(null);
  const [lines, setLines] = useState<Line[]>(() =>
    existing?.items.length
      ? existing.items.map((it, i) => ({ key: i + 1, reference: it.product_reference ?? '', code: it.product_code ?? '', quantity: it.quantity != null ? String(it.quantity) : '', price: it.unit_price != null ? String(it.unit_price).replace('.', ',') : '' }))
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

  const productList = useMemo(() => (products.data ?? []).filter((p) => !p.is_semi), [products.data]); // semiacabado não se vende
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
    if (id && !editing) {
      const c = customers.data?.find((x) => x.id === id);
      openOrdersOf(id).then((os) => { if (os.length) setDupAsk({ name: c?.name ?? 'este cliente', orders: os }); }).catch(() => {});
    }
  }
  /** "Não" no aviso de pedido em aberto: limpa tudo e recomeça um pedido novo do zero. */
  function resetForm() {
    setCustomerId(null); setDiscount(0); setOrderDate(new Date().toISOString().slice(0, 10)); setDeliveryDate('');
    setNotes(''); setOtherPack(null); setLines([emptyLine()]); setShowErrors(false); setDirty(false); setDupAsk(null);
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
    let q = l.quantity;
    if (q && !Number.isInteger(num(q))) q = ''; // kg e unidade: só inteiro
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
      if (price == null || !Number.isFinite(price)) errs.price = 'Informe o valor unitário (ex.: 38,50).';
      else if (price < 0) errs.price = 'O valor não pode ser negativo.';
    }
    return { l, p, unit, q, price, errs, blank };
  });
  const filled = calc.filter((c) => !c.blank);
  const totals = orderTotals(calc.map((c) => ({ quantity: c.blank || Object.keys(c.errs).length ? null : c.q, unit_price: c.price })), discount);
  const lineErrors = filled.some((c) => Object.keys(c.errs).length);
  const formErrors = { customer: !customer ? 'Selecione um cliente da lista.' : '', items: !filled.length ? 'Inclua pelo menos um item com produto, quantidade e preço.' : '', pack: otherPack === null ? 'Responda se pode trocar a embalagem.' : '' };
  const valid = !formErrors.customer && !formErrors.items && !formErrors.pack && !lineErrors;

  const save = useMutation({
    mutationFn: () => saveSalesOrder({
      id: existing?.id,
      customer: customer!,
      order_date: orderDate || null,
      delivery_date: deliveryDate || null,
      status,
      notes: notes.trim() || null,
      discount_pct: discount,
      allow_other_packaging: otherPack,
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

  // Solicitação #19: só quem lançou edita, e só enquanto o pedido está em Aberto (voltando as etapas, ele reabre)
  if (editing && existing && !podeEditarPedido(existing, session?.user.id, isAdmin)) {
    return (
      <Card title="Este pedido não pode ser editado">
        <p className="text-sm text-muted">{existing.status !== 'aberto' || existing.items.some((i) => (i.stage ?? 'aberto') !== 'aberto')
          ? `O pedido já saiu de Aberto (${existing.status.replace('_', ' ')}). Para mudar, ele precisa voltar as etapas até ficar Aberto.`
          : 'Só quem lançou o pedido pode editá-lo.'}</p>
        <Button className="mt-3" variant="outline" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(`/pedidos/${existing.id}`)}>Voltar ao pedido</Button>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
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
            {/* Ordem pedida pelo comercial (Vendas parte 2): Vendedor | Nº do pedido; Cliente; CNPJ | Desc. Fin.; Data | Entrega; Observações. O status saiu desta tela. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendedor"><Input id="vendedor" value={customer ? customer.seller_name || 'sem vendedor' : ''} placeholder="—" readOnly tabIndex={-1} className="bg-surface-2" /></Field>
              <Field label="Nº do pedido" hint="Gerado pelo sistema"><Input id="numero" value={orderNumber} placeholder="automático" readOnly tabIndex={-1} className="bg-surface-2" /></Field>
            </div>
            <Field label="Cliente / loja">
              <SearchSelect id="cliente" ariaLabel="Cliente / loja" options={nameOptions} value={customerId} onChange={pickCustomer} placeholder="Digite o nome do cliente…" invalid={showErrors && !!formErrors.customer} digitsSearch />
              {err(formErrors.customer)}
            </Field>
            <div className="grid grid-cols-[2.1fr_1fr] gap-3">
              <Field label="CNPJ">
                <SearchSelect id="cnpj" ariaLabel="CNPJ" options={cnpjOptions} value={customerId} onChange={pickCustomer} placeholder="Digite o CNPJ…" invalid={showErrors && !!formErrors.customer} digitsSearch />
              </Field>
              <Field label="Desc. Fin.">
                <Select id="desconto" aria-label="Desconto financeiro" value={String(discount)} disabled={!customer} onChange={(e) => { setDiscount(Number(e.target.value)); touch(); }}>
                  <option value="0">Nenhum</option>
                  {discountOptions.map((d) => <option key={d} value={d}>{String(d).replace('.', ',')}%</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><Input id="data" type="date" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); touch(); }} /></Field>
              <Field label="Entrega"><Input id="entrega" type="date" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); touch(); }} /></Field>
            </div>
            <Field label="Observações"><Textarea id="obs" value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} /></Field>
            <dl className="grid gap-1 rounded-xl bg-surface-2 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal dos itens</dt><dd className="num">{fmtBRL(totals.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Desc. Financeiro{discount ? ` (${String(discount).replace('.', ',')}%)` : ''}</dt><dd className="num">− {fmtBRL(totals.discount)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total</dt><dd className="num">{fmtBRL(totals.total)}</dd></div>
            </dl>
          </div>
        </Card>
        <div className="space-y-4">
        <Card title="Itens do pedido" padded={false}>
          {/* Uma grade só: em telas largas parece tabela; no celular cada item vira um cartão empilhado. */}
          <div className="hidden gap-2 border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted lg:grid lg:grid-cols-[minmax(110px,1fr)_minmax(110px,1fr)_minmax(220px,2.2fr)_110px_120px_120px_28px]">
            <span>Referência</span><span>Código</span><span>Produto</span><span className="text-right">Qtd Kg/Un</span><span className="text-right">Vlr Un.</span><span className="text-right">Vlr Ttl.</span><span />
          </div>
          <div className="divide-y divide-line">
            {calc.map((c, i) => {
              const pool = productList.filter((p) => inRef(p, c.l.reference));
              const codeOpts = pool.map((p) => ({ value: p.code, label: p.code, sub: `${p.description}${p.reference ? ' · ' + p.reference : ''}` }));
              const nameOpts = pool.map((p) => ({ value: p.code, label: p.description, sub: `${p.code}${p.reference ? ' · ' + p.reference : ''}` }));
              const e = showErrors ? c.errs : {};
              const lbl = (t: string) => <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted lg:hidden">{t}</span>;
              return (
                <div key={c.l.key} className="grid grid-cols-6 items-start gap-x-3 gap-y-3 px-4 py-4 lg:grid-cols-[minmax(110px,1fr)_minmax(110px,1fr)_minmax(220px,2.2fr)_110px_120px_120px_28px] lg:gap-2 lg:py-3">
                  <div className="col-span-6 flex items-center justify-between lg:hidden"><b className="text-sm">Item {i + 1}</b><button className="p-1 text-muted hover:text-danger" onClick={() => { setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== c.l.key) : [emptyLine()])); touch(); }} aria-label={`Remover item ${i + 1}`}><Trash2 className="h-4 w-4" /></button></div>
                  <div className="col-span-3 lg:col-span-1">{lbl('Referência')}<SearchSelect ariaLabel={`Referência da linha ${i + 1}`} options={refOptions} value={references.find((r) => normalizeKey(r) === normalizeKey(c.l.reference)) ?? null} onChange={(v) => changeRef(c.l, v)} placeholder="Todas" /></div>
                  <div className="col-span-3 lg:col-span-1">{lbl('Código')}<SearchSelect ariaLabel={`Código da linha ${i + 1}`} options={codeOpts} value={c.l.code || null} onChange={(v) => pickProduct(c.l, v)} placeholder="Código" invalid={!!e.product} /></div>
                  <div className="col-span-6 lg:col-span-1">{lbl('Produto')}<SearchSelect ariaLabel={`Produto da linha ${i + 1}`} options={nameOpts} value={c.l.code || null} onChange={(v) => pickProduct(c.l, v)} placeholder="Produto" invalid={!!e.product} />{err(c.errs.product)}{c.p && !c.unit && <p className="mt-1 text-[11px] text-danger">Referência "{c.p.reference || 'vazia'}" sem regra de quilo ou unidade. Avise o ADM.</p>}</div>
                  <div className="col-span-2 lg:col-span-1">{lbl('Qtd Kg/Un')}
                    <Input aria-label={`Quantidade da linha ${i + 1}`} inputMode="numeric" type="number" min={0} step={1} className={`h-10 text-right ${e.quantity ? 'border-danger' : ''}`} value={c.l.quantity} onChange={(ev) => update(c.l.key, { quantity: ev.target.value })} />
                    {err(c.errs.quantity)}
                  </div>
                  <div className="col-span-2 lg:col-span-1">{lbl('Vlr Un.')}
                    <Input aria-label={`Valor unitário da linha ${i + 1}`} type="text" inputMode="decimal" className={`h-10 text-right ${e.price ? 'border-danger' : ''}`} value={c.l.price} onChange={(ev) => update(c.l.key, { price: ev.target.value.replace(/[^\d.,]/g, '') })} onBlur={(ev) => { const v = num(ev.target.value); if (v != null && Number.isFinite(v)) update(c.l.key, { price: v.toFixed(2).replace('.', ',') }); }} placeholder={c.unit === 'kg' ? 'R$/kg' : 'R$/un'} />
                    {err(c.errs.price)}
                  </div>
                  <div className="col-span-2 text-right lg:col-span-1 lg:pt-2">{lbl('Vlr Ttl.')}<span className="num font-semibold">{c.q && c.price != null && !Object.keys(c.errs).length ? fmtBRL(totals.lineTotals[i]) : '—'}</span><div className="text-[11px] text-muted">{c.q && c.unit ? `${fmtQty(c.q, c.unit)} ${c.unit === 'kg' ? 'kg' : 'un'}` : ''}</div></div>
                  <div className="hidden pt-2 text-right lg:block"><button className="p-1 text-muted hover:text-danger" onClick={() => { setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== c.l.key) : [emptyLine()])); touch(); }} aria-label={`Remover linha ${i + 1}`}><Trash2 className="h-4 w-4" /></button></div>
                </div>
              );
            })}
          </div>
          {showErrors && formErrors.items && <p className="px-5 py-3 text-xs text-danger">{formErrors.items}</p>}
        </Card>
        {/* Vendas parte 5: Adicionar item em cartão separado, abaixo dos itens */}
        <button type="button" onClick={() => { setLines((ls) => [...ls, emptyLine()]); touch(); }}
          className="card flex w-full items-center justify-center gap-2 p-4 text-sm font-semibold text-brand hover:bg-brand-soft/30">
          <Plus className="h-4 w-4" /> Adicionar item
        </button>
        </div>
      </div>
      <Card title="Perguntas do pedido" className="mt-4">
        <fieldset>
          <legend className="text-sm font-semibold">Se precisar, posso trocar a embalagem?</legend>
          <div className="mt-2 flex gap-2" role="radiogroup">
            {([[true, 'SIM'], [false, 'NÃO']] as const).map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={otherPack === v} onClick={() => { setOtherPack(v); touch(); }}
                className={`min-w-24 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${otherPack === v ? 'border-brand bg-brand text-white' : 'border-line hover:bg-surface-2'}`}>{l}</button>
            ))}
          </div>
          {err(formErrors.pack)}
        </fieldset>
      </Card>
      <Dialog open={!!dupAsk} onClose={() => setDupAsk(null)} title="Você já tem pedido para esse cliente. Continuar?"
        footer={<><Button variant="outline" onClick={resetForm}>Não</Button><Button onClick={() => setDupAsk(null)}>Sim, continuar</Button></>}>
        <p className="text-sm">{dupAsk?.name} já tem {dupAsk && dupAsk.orders.length > 1 ? `${dupAsk.orders.length} pedidos em aberto` : 'um pedido em aberto'}:</p>
        <ul className="mt-2 space-y-1 text-sm">{dupAsk?.orders.map((o, i) => <li key={i} className="rounded-lg bg-surface-2 px-3 py-1.5">Pedido {o.order_number ? `#${o.order_number}` : 'sem número'} · {fmtDate(o.order_date)} · {fmtBRL(o.total_value)}</li>)}</ul>
        <p className="mt-3 text-xs text-muted">Sim: o aviso fecha e você continua este pedido. Não: a seleção é apagada e a tela volta em branco para um pedido novo.</p>
      </Dialog>
    </>
  );
}
