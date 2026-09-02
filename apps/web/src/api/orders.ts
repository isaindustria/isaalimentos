import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, Order, OrderImport, OrderItem, OrderStatus, Product, ProductAlias } from '@/lib/types';
import type { ParsedOrder } from '@/domain/parsers/orderPdf';
import { matchProduct, type MatchOptions } from '@/domain/matching';
import { normalizedKey } from '@/domain/normalize';
import { onlyDigits } from '@/lib/utils';
import { addAlias } from './products';

const ORDER_SELECT = '*, customer:customers(id, name, cnpj, city, state, group_name)';

export interface OrderFilters {
  status?: OrderStatus | 'todos';
  customerId?: string;
  importId?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listOrders(f: OrderFilters = {}): Promise<Order[]> {
  let q = supabase.from('orders').select(ORDER_SELECT).order('order_date', { ascending: false }).order('created_at', { ascending: false });
  if (f.status && f.status !== 'todos') q = q.eq('status', f.status);
  if (f.customerId) q = q.eq('customer_id', f.customerId);
  if (f.importId) q = q.eq('import_id', f.importId);
  if (f.from) q = q.gte('order_date', f.from);
  if (f.to) q = q.lte('order_date', f.to);
  if (f.search) q = q.ilike('order_number', `%${f.search}%`);
  return unwrap(await q.limit(500));
}

export async function getOrder(id: string): Promise<Order & { items: OrderItem[] }> {
  const order = unwrap(await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single()) as Order;
  const items = unwrap(
    await supabase.from('order_items').select('*, product:products(code, description)').eq('order_id', id).order('seq'),
  ) as OrderItem[];
  return { ...order, items };
}

export async function listOrderImports(limit = 30): Promise<OrderImport[]> {
  return unwrap(await supabase.from('order_imports').select('*').order('imported_at', { ascending: false }).limit(limit));
}

export async function setOrderStatus(id: string, status: OrderStatus) {
  unwrap(await supabase.from('orders').update({ status }).eq('id', id));
}

export async function deleteOrder(id: string) {
  unwrap(await supabase.from('orders').delete().eq('id', id));
}

export async function deleteOrderImport(id: string) {
  // Orders keep their rows (import_id becomes null); delete them explicitly first.
  unwrap(await supabase.from('orders').delete().eq('import_id', id));
  unwrap(await supabase.from('order_imports').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
export interface ImportOrdersResult {
  importId: string;
  ordersCreated: number;
  ordersReplaced: number;
  itemsCreated: number;
  pendingItems: number;
  customersCreated: number;
}

async function findOrCreateCustomer(o: ParsedOrder, cache: Map<string, Customer>, created: { n: number }): Promise<Customer | null> {
  const cnpj = onlyDigits(o.deliveryCnpj);
  if (!cnpj) return null;
  if (cache.has(cnpj)) return cache.get(cnpj)!;
  const found = unwrap(await supabase.from('customers').select('*').eq('cnpj', cnpj).maybeSingle()) as Customer | null;
  if (found) {
    cache.set(cnpj, found);
    return found;
  }
  const root = cnpj.slice(0, 8);
  const sibling = unwrap(await supabase.from('customers').select('group_name, name').like('cnpj', `${root}%`).limit(1)) as Array<Pick<Customer, 'group_name' | 'name'>>;
  const groupName = sibling[0]?.group_name ?? `Rede ${root.slice(0, 2)}.${root.slice(2, 5)}.${root.slice(5, 8)}`;
  const suffix = cnpj.slice(8, 12);
  const name = `${groupName} · Loja ${suffix}${o.city ? ` (${o.city})` : ''}`;
  const customer = unwrap(
    await supabase
      .from('customers')
      .insert({ cnpj, name, group_name: groupName, address: o.address, city: o.city, state: o.state, cep: o.cep })
      .select('*')
      .single(),
  ) as Customer;
  created.n += 1;
  cache.set(cnpj, customer);
  return customer;
}

export async function importParsedOrders(input: {
  fileName: string;
  orders: ParsedOrder[];
  products: Product[];
  aliases: ProductAlias[];
  matchOptions?: MatchOptions;
  replaceExisting: boolean;
  userId?: string | null;
}): Promise<ImportOrdersResult> {
  const imp = unwrap(
    await supabase.from('order_imports').insert({ file_name: input.fileName, imported_by: input.userId ?? null }).select('*').single(),
  ) as OrderImport;

  const cache = new Map<string, Customer>();
  const created = { n: 0 };
  let ordersCreated = 0;
  let ordersReplaced = 0;
  let itemsCreated = 0;
  let pendingItems = 0;
  const matchable = input.products.filter((p) => p.active).map((p) => ({ code: p.code, description: p.description }));

  for (const o of input.orders) {
    const customer = await findOrCreateCustomer(o, cache, created);
    if (o.orderNumber && customer) {
      const existing = unwrap(
        await supabase.from('orders').select('id').eq('order_number', o.orderNumber).eq('customer_id', customer.id).maybeSingle(),
      ) as { id: string } | null;
      if (existing) {
        if (!input.replaceExisting) continue;
        unwrap(await supabase.from('orders').delete().eq('id', existing.id));
        ordersReplaced += 1;
      }
    }
    const deliveryDate = o.items.find((i) => i.deliveryDate)?.deliveryDate ?? null;
    const order = unwrap(
      await supabase
        .from('orders')
        .insert({
          import_id: imp.id,
          customer_id: customer?.id ?? null,
          order_number: o.orderNumber,
          order_date: o.orderDate,
          delivery_date: deliveryDate,
          buyer: o.buyer,
          payment_terms: o.paymentTerms,
          total_value: o.totalValue ?? o.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0),
          total_weight: o.totalWeight,
          source: 'pdf',
        })
        .select('id')
        .single(),
    ) as { id: string };
    ordersCreated += 1;

    const rows = o.items.map((it) => {
      const m = matchProduct({ clientCode: it.clientCode, description: it.description }, matchable, input.aliases, input.matchOptions);
      if (!m.productCode) pendingItems += 1;
      const product = m.productCode ? input.products.find((p) => p.code === m.productCode) : null;
      const unitsPerBox = product?.units_per_box ?? it.unitsPerBox;
      return {
        order_id: order.id,
        seq: it.seq,
        client_code: it.clientCode,
        raw_description: it.description,
        packaging: it.packaging,
        product_code: m.productCode,
        quantity_boxes: it.quantityBoxes,
        units_per_box: unitsPerBox,
        quantity_units: it.quantityBoxes * unitsPerBox,
        unit_price: it.unitPrice,
        total_price: it.totalPrice,
        weight_kg: it.weightKg,
        match_status: m.status,
        match_score: m.score,
        candidates: m.candidates,
      };
    });
    if (rows.length) {
      unwrap(await supabase.from('order_items').insert(rows));
      itemsCreated += rows.length;
    }
  }

  unwrap(
    await supabase
      .from('order_imports')
      .update({ orders_count: ordersCreated, items_count: itemsCreated, pending_count: pendingItems })
      .eq('id', imp.id),
  );
  return { importId: imp.id, ordersCreated, ordersReplaced, itemsCreated, pendingItems, customersCreated: created.n };
}

// ---------------------------------------------------------------------------
// Review of unmatched lines
// ---------------------------------------------------------------------------
export async function listPendingItems(): Promise<OrderItem[]> {
  return unwrap(
    await supabase
      .from('order_items')
      .select('*, order:orders(id, order_number, order_date, customer_id, customer:customers(name))')
      .in('match_status', ['pending', 'ambiguous', 'not_found'])
      .order('raw_description'),
  );
}

/**
 * Resolves one line (and every other unresolved line with the same client code / description).
 * When `learn` is true the mapping is stored as an alias so future imports match automatically.
 */
export async function resolveItem(input: { item: OrderItem; productCode: string; learn: boolean; unitsPerBox?: number }) {
  const { item, productCode, learn } = input;
  const upb = input.unitsPerBox ?? item.units_per_box;
  const ids = new Set<string>([item.id]);

  const siblings = unwrap(
    await supabase.from('order_items').select('id, client_code, raw_description').in('match_status', ['pending', 'ambiguous', 'not_found']),
  ) as Array<Pick<OrderItem, 'id' | 'client_code' | 'raw_description'>>;
  const key = normalizedKey(item.raw_description);
  for (const s of siblings) {
    if ((item.client_code && s.client_code === item.client_code) || (key && normalizedKey(s.raw_description) === key)) ids.add(s.id);
  }

  for (const id of ids) {
    const row = siblings.find((s) => s.id === id);
    const boxes = row ? undefined : item.quantity_boxes;
    const patch: Record<string, unknown> = { product_code: productCode, match_status: 'manual', match_score: 1, units_per_box: upb };
    if (boxes !== undefined) patch.quantity_units = boxes * upb;
    unwrap(await supabase.from('order_items').update(patch).eq('id', id));
  }
  // Recompute units for all touched lines in one pass.
  const touched = unwrap(await supabase.from('order_items').select('id, quantity_boxes').in('id', [...ids])) as Array<{ id: string; quantity_boxes: number }>;
  for (const t of touched) unwrap(await supabase.from('order_items').update({ quantity_units: t.quantity_boxes * upb }).eq('id', t.id));

  if (learn) await addAlias({ product_code: productCode, client_code: item.client_code, description: item.raw_description });
  await refreshPendingCounts();
  return ids.size;
}

export async function ignoreItem(itemId: string) {
  unwrap(await supabase.from('order_items').update({ match_status: 'not_found', product_code: null }).eq('id', itemId));
}

async function refreshPendingCounts() {
  const imports = unwrap(await supabase.from('order_imports').select('id')) as Array<{ id: string }>;
  for (const imp of imports) {
    const orders = unwrap(await supabase.from('orders').select('id').eq('import_id', imp.id)) as Array<{ id: string }>;
    if (!orders.length) continue;
    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .in('order_id', orders.map((o) => o.id))
      .in('match_status', ['pending', 'ambiguous', 'not_found']);
    unwrap(await supabase.from('order_imports').update({ pending_count: count ?? 0 }).eq('id', imp.id));
  }
}

// ---------------------------------------------------------------------------
// Demand (for the production calculation)
// ---------------------------------------------------------------------------
export interface DemandFilters {
  orderIds?: string[];
  importId?: string;
  from?: string;
  to?: string;
  statuses?: OrderStatus[];
}

export interface DemandRow {
  productCode: string;
  units: number;
  boxes: number;
  ordersCount: number;
  unresolvedLines: number;
}

export async function demand(f: DemandFilters): Promise<{ rows: DemandRow[]; orders: Order[]; unresolved: number }> {
  let q = supabase.from('orders').select(ORDER_SELECT);
  if (f.orderIds?.length) q = q.in('id', f.orderIds);
  if (f.importId) q = q.eq('import_id', f.importId);
  if (f.from) q = q.gte('order_date', f.from);
  if (f.to) q = q.lte('order_date', f.to);
  q = q.in('status', f.statuses ?? ['aberto', 'em_producao']);
  const orders = unwrap(await q) as Order[];
  if (!orders.length) return { rows: [], orders, unresolved: 0 };

  const items = unwrap(
    await supabase
      .from('order_items')
      .select('order_id, product_code, quantity_boxes, quantity_units, match_status')
      .in('order_id', orders.map((o) => o.id)),
  ) as Array<Pick<OrderItem, 'order_id' | 'product_code' | 'quantity_boxes' | 'quantity_units' | 'match_status'>>;

  const map = new Map<string, DemandRow & { orderSet: Set<string> }>();
  let unresolved = 0;
  for (const it of items) {
    if (!it.product_code) {
      unresolved += 1;
      continue;
    }
    const r = map.get(it.product_code) ?? { productCode: it.product_code, units: 0, boxes: 0, ordersCount: 0, unresolvedLines: 0, orderSet: new Set<string>() };
    r.units += Number(it.quantity_units);
    r.boxes += Number(it.quantity_boxes);
    r.orderSet.add(it.order_id);
    map.set(it.product_code, r);
  }
  const rows = [...map.values()].map(({ orderSet, ...r }) => ({ ...r, ordersCount: orderSet.size }));
  return { rows, orders, unresolved };
}
