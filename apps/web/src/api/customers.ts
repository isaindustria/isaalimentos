import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, CustomerInteraction, InteractionKind, Order } from '@/lib/types';
import { onlyDigits } from '@/lib/utils';

export async function listCustomers(includeInactive = false): Promise<Customer[]> {
  let q = supabase.from('customers').select('*').order('name');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap(await q);
}

export async function getCustomer(id: string): Promise<Customer> {
  return unwrap(await supabase.from('customers').select('*').eq('id', id).single());
}

export type CustomerInput = Partial<Customer> & { name: string };

export async function upsertCustomer(input: CustomerInput): Promise<Customer> {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    cnpj: input.cnpj ? onlyDigits(input.cnpj) : null,
    trade_name: input.trade_name ?? null,
    group_name: input.group_name ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    district: input.district ?? null,
    state: input.state ?? null,
    cep: input.cep ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    contact_name: input.contact_name ?? null,
    notes: input.notes ?? null,
    active: input.active ?? true,
  };
  if (input.id) payload.id = input.id;
  return unwrap(await supabase.from('customers').upsert(payload).select('*').single());
}

export async function deleteCustomer(id: string) {
  const rows = unwrap(await supabase.from('customers').delete().eq('id', id).select('id')) as Array<{ id: string }>;
  if (!rows.length) throw new Error('o banco não permitiu a exclusão (só o ADM pode excluir clientes).');
}

export async function setCustomerActive(id: string, active: boolean) {
  const rows = unwrap(await supabase.from('customers').update({ active }).eq('id', id).select('id')) as Array<{ id: string }>;
  if (!rows.length) throw new Error('o banco não permitiu a alteração deste cliente.');
}

/** Quantos pedidos e notas fiscais estão ligados ao cliente (o que impede a exclusão). */
export async function customerLinks(id: string): Promise<{ orders: number; notas: number }> {
  const o = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', id);
  if (o.error) throw o.error;
  const ids = o.count ? (unwrap(await supabase.from('orders').select('id').eq('customer_id', id)) as Array<{ id: string }>).map((x) => x.id) : [];
  let notas = 0;
  if (ids.length) { const n = await supabase.from('nfe_notas').select('id', { count: 'exact', head: true }).in('order_id', ids); notas = n.count ?? 0; }
  return { orders: o.count ?? 0, notas };
}

/** Data do último pedido enviado ao sistema por cliente (pedidos cancelados não contam). */
export async function listLastOrders(): Promise<Map<string, string>> {
  const v = await supabase.from('customer_last_order').select('customer_id, last_order_at');
  if (!v.error) return new Map((v.data as Array<{ customer_id: string; last_order_at: string }>).map((r) => [r.customer_id, r.last_order_at]));
  // sem a visão no banco: calcula pelos pedidos
  const rows = unwrap(await supabase.from('orders').select('customer_id, created_at, status').not('customer_id', 'is', null)) as Array<{ customer_id: string; created_at: string; status: string | null }>;
  const m = new Map<string, string>();
  for (const r of rows) if (r.status !== 'cancelado' && (!m.has(r.customer_id) || r.created_at > m.get(r.customer_id)!)) m.set(r.customer_id, r.created_at);
  return m;
}

export async function listCustomerOrders(customerId: string): Promise<Order[]> {
  return unwrap(await supabase.from('orders').select('*').eq('customer_id', customerId).order('order_date', { ascending: false }));
}

export async function listInteractions(customerId: string): Promise<CustomerInteraction[]> {
  return unwrap(
    await supabase.from('customer_interactions').select('*').eq('customer_id', customerId).order('occurred_at', { ascending: false }),
  );
}

export async function addInteraction(input: { customer_id: string; kind: InteractionKind; content: string; occurred_at?: string; created_by?: string | null }) {
  return unwrap(await supabase.from('customer_interactions').insert(input).select('*').single());
}

export async function deleteInteraction(id: string) {
  unwrap(await supabase.from('customer_interactions').delete().eq('id', id));
}

/** Aggregated numbers for the customers list. */
export interface CustomerStats {
  customer_id: string;
  orders: number;
  total_value: number;
  last_order: string | null;
}

export async function customerStats(): Promise<Record<string, CustomerStats>> {
  const rows = unwrap(await supabase.from('orders').select('customer_id, total_value, order_date').neq('status', 'cancelado')) as Array<{
    customer_id: string | null;
    total_value: number;
    order_date: string | null;
  }>;
  const out: Record<string, CustomerStats> = {};
  for (const r of rows) {
    if (!r.customer_id) continue;
    const s = (out[r.customer_id] ??= { customer_id: r.customer_id, orders: 0, total_value: 0, last_order: null });
    s.orders += 1;
    s.total_value += Number(r.total_value ?? 0);
    if (r.order_date && (!s.last_order || r.order_date > s.last_order)) s.last_order = r.order_date;
  }
  return out;
}

/** Bulk upsert by CNPJ (or insert when no CNPJ). Returns how many rows were written. */
export async function bulkUpsertCustomers(rows: CustomerInput[]): Promise<number> {
  const withCnpj = rows.filter((r) => r.cnpj && onlyDigits(r.cnpj).length === 14).map((r) => ({
    cnpj: onlyDigits(r.cnpj),
    name: r.name.trim(),
    trade_name: r.trade_name ?? null,
    group_name: r.group_name ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    district: r.district ?? null,
    state: r.state ?? null,
    cep: r.cep ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    contact_name: r.contact_name ?? null,
    notes: r.notes ?? null,
    active: true,
  }));
  const without = rows.filter((r) => !r.cnpj || onlyDigits(r.cnpj).length !== 14).map((r) => ({
    cnpj: null,
    name: r.name.trim(),
    trade_name: r.trade_name ?? null,
    group_name: r.group_name ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    district: r.district ?? null,
    state: r.state ?? null,
    cep: r.cep ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    contact_name: r.contact_name ?? null,
    notes: r.notes ?? null,
    active: true,
  }));
  for (let i = 0; i < withCnpj.length; i += 200) unwrap(await supabase.from('customers').upsert(withCnpj.slice(i, i + 200), { onConflict: 'cnpj' }));
  for (let i = 0; i < without.length; i += 200) unwrap(await supabase.from('customers').insert(without.slice(i, i + 200)));
  return withCnpj.length + without.length;
}
