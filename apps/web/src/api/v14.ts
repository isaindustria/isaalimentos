import { supabase, unwrap } from '@/lib/supabase';
import type { AuditEntry, DbStats, DeliveryRoute, Modules, PriceList, ProductBom, ProductStats, PurchaseOrder, PurchaseOrderItem, RouteStatus, Supply } from '@/lib/types';

/* ---------------- Modulos (liga/desliga sem apagar) ---------------- */
export const DEFAULT_MODULES: Modules = { precos: true, compras: true, rotas: true, relatorios: true, auditoria: true, portal: true, push: true };
export async function getModules(): Promise<Modules> {
  const row = unwrap(await supabase.from('app_settings').select('value').eq('key', 'modules').maybeSingle()) as { value: Partial<Modules> } | null;
  return { ...DEFAULT_MODULES, ...(row?.value ?? {}) };
}
export async function setModules(m: Modules) {
  unwrap(await supabase.from('app_settings').upsert({ key: 'modules', value: m, updated_at: new Date().toISOString() }));
}

/* ---------------- Precos ---------------- */
export async function listPrices(): Promise<PriceList[]> {
  return unwrap(await supabase.from('price_lists').select('*, product:products(code, description), customer:customers(id, name)').order('valid_from', { ascending: false }));
}
export async function savePrice(p: Partial<PriceList> & { product_code: string; price_box: number }) {
  const payload = { product_code: p.product_code, customer_id: p.customer_id ?? null, group_name: p.group_name ?? null, price_box: p.price_box, valid_from: p.valid_from ?? new Date().toISOString().slice(0, 10), notes: p.notes ?? null };
  if (p.id) unwrap(await supabase.from('price_lists').update(payload).eq('id', p.id));
  else unwrap(await supabase.from('price_lists').insert(payload));
}
export async function deletePrice(id: string) {
  unwrap(await supabase.from('price_lists').delete().eq('id', id));
}
/** Best price for a product: customer-specific > group > general, most recent valid_from. */
export function resolvePrice(prices: PriceList[], productCode: string, customerId?: string | null, groupName?: string | null): number | null {
  const today = new Date().toISOString().slice(0, 10);
  const c = prices.filter((p) => p.product_code === productCode && p.valid_from <= today);
  const pick = (f: (p: PriceList) => boolean) => c.filter(f).sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  const byCustomer = customerId ? pick((p) => p.customer_id === customerId) : undefined;
  const byGroup = groupName ? pick((p) => !p.customer_id && p.group_name === groupName) : undefined;
  const general = pick((p) => !p.customer_id && !p.group_name);
  return byCustomer?.price_box ?? byGroup?.price_box ?? general?.price_box ?? null;
}

/* ---------------- Insumos, ficha tecnica e compras ---------------- */
export async function listSupplies(): Promise<Supply[]> {
  return unwrap(await supabase.from('supplies').select('*').order('name'));
}
export async function saveSupply(s: Partial<Supply> & { name: string }) {
  const payload = { name: s.name, unit: s.unit ?? 'kg', stock: s.stock ?? 0, min_stock: s.min_stock ?? 0, cost: s.cost ?? null, supplier: s.supplier ?? null, active: s.active ?? true };
  if (s.id) unwrap(await supabase.from('supplies').update(payload).eq('id', s.id));
  else unwrap(await supabase.from('supplies').insert(payload));
}
export async function deleteSupply(id: string) {
  unwrap(await supabase.from('supplies').delete().eq('id', id));
}
export async function listBom(): Promise<ProductBom[]> {
  return unwrap(await supabase.from('product_bom').select('*, supply:supplies(*)'));
}
export async function saveBom(product_code: string, supply_id: string, qty_per_unit: number) {
  unwrap(await supabase.from('product_bom').upsert({ product_code, supply_id, qty_per_unit }, { onConflict: 'product_code,supply_id' }));
}
export async function deleteBom(id: string) {
  unwrap(await supabase.from('product_bom').delete().eq('id', id));
}
export async function listPurchases(): Promise<PurchaseOrder[]> {
  return unwrap(await supabase.from('purchase_orders').select('*, items:purchase_order_items(*, supply:supplies(*))').order('created_at', { ascending: false }));
}
export async function createPurchase(input: { supplier: string | null; notes: string | null; production_run_id: string | null; items: Array<{ supply_id: string; qty: number; unit_cost: number | null }>; userId?: string | null }) {
  const po = unwrap(await supabase.from('purchase_orders').insert({ supplier: input.supplier, notes: input.notes, production_run_id: input.production_run_id, created_by: input.userId ?? null }).select('id').single()) as { id: string };
  if (input.items.length) unwrap(await supabase.from('purchase_order_items').insert(input.items.map((i) => ({ ...i, purchase_order_id: po.id }))));
  return po.id;
}
export async function setPurchaseStatus(id: string, status: PurchaseOrder['status'], items?: PurchaseOrderItem[]) {
  unwrap(await supabase.from('purchase_orders').update({ status, received_at: status === 'recebido' ? new Date().toISOString() : null }).eq('id', id));
  if (status === 'recebido' && items) {
    for (const it of items) {
      const s = unwrap(await supabase.from('supplies').select('stock').eq('id', it.supply_id).single()) as { stock: number };
      unwrap(await supabase.from('supplies').update({ stock: Number(s.stock) + Number(it.qty) }).eq('id', it.supply_id));
    }
  }
}
/** Supplies needed for a set of (product, units) using the BOM; subtracts current supply stock. */
export function computeSupplyNeeds(bom: ProductBom[], supplies: Supply[], demand: Array<{ code: string; units: number }>) {
  const need = new Map<string, number>();
  for (const d of demand) for (const b of bom.filter((x) => x.product_code === d.code)) need.set(b.supply_id, (need.get(b.supply_id) ?? 0) + Number(b.qty_per_unit) * d.units);
  return [...need.entries()].map(([supply_id, qty]) => {
    const s = supplies.find((x) => x.id === supply_id);
    const toBuy = Math.max(0, qty - Number(s?.stock ?? 0));
    return { supply_id, name: s?.name ?? '?', unit: s?.unit ?? '', needed: qty, stock: Number(s?.stock ?? 0), toBuy, cost: s?.cost ?? null };
  }).sort((a, b) => b.toBuy - a.toBuy);
}

/* ---------------- Rotas / romaneio ---------------- */
export async function listRoutes(): Promise<DeliveryRoute[]> {
  return unwrap(await supabase.from('delivery_routes').select('*').order('route_date', { ascending: false }));
}
export async function saveRoute(r: Partial<DeliveryRoute> & { name: string; order_ids: string[] }) {
  const payload = { name: r.name, route_date: r.route_date ?? new Date().toISOString().slice(0, 10), driver: r.driver ?? null, vehicle: r.vehicle ?? null, status: r.status ?? 'planejada', order_ids: r.order_ids, notes: r.notes ?? null };
  if (r.id) unwrap(await supabase.from('delivery_routes').update(payload).eq('id', r.id));
  else unwrap(await supabase.from('delivery_routes').insert(payload));
}
export async function setRouteStatus(id: string, status: RouteStatus) {
  unwrap(await supabase.from('delivery_routes').update({ status }).eq('id', id));
}
export async function deleteRoute(id: string) {
  unwrap(await supabase.from('delivery_routes').delete().eq('id', id));
}

/* ---------------- Auditoria ---------------- */
export async function listAudit(limit = 200, table?: string): Promise<AuditEntry[]> {
  let q = supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit);
  if (table) q = q.eq('table_name', table);
  return unwrap(await q);
}
export async function undoAudit(id: string) {
  const { error } = await supabase.rpc('audit_undo', { log_id: id });
  if (error) throw new Error(error.message);
}

/* ---------------- Estatisticas / minimo automatico ---------------- */
export async function productStats(): Promise<ProductStats[]> {
  return unwrap(await supabase.from('product_stats').select('*'));
}
/** min = weekly average x lead time (weeks) x safety factor, rounded to boxes. */
export function suggestMin(weeklyAvg: number, leadWeeks = 1, safety = 1.3, unitsPerBox = 48) {
  const raw = weeklyAvg * leadWeeks * safety;
  return Math.ceil(raw / unitsPerBox) * unitsPerBox;
}
export async function applyMinStock(rows: Array<{ code: string; min_stock: number }>) {
  for (const r of rows) unwrap(await supabase.from('products').update({ min_stock: r.min_stock }).eq('code', r.code));
}
export function abcClass(revenueShareCum: number): 'A' | 'B' | 'C' {
  return revenueShareCum <= 0.8 ? 'A' : revenueShareCum <= 0.95 ? 'B' : 'C';
}

/* ---------------- Banco: tamanho ---------------- */
export async function dbStats(): Promise<DbStats> {
  const { data, error } = await supabase.rpc('db_stats');
  if (error) throw new Error(error.message);
  return data as DbStats;
}
export const FREE_PLAN_DB_BYTES = 500 * 1024 * 1024;

/* ---------------- Push ---------------- */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export async function enablePush(userId: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return false;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  const json = sub.toJSON();
  unwrap(await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' }));
  return true;
}
export async function disablePush() {
  const reg = await navigator.serviceWorker?.ready;
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
export async function pushStatus(): Promise<'on' | 'off' | 'unsupported'> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/* ---------------- Backup manual ---------------- */
export async function runBackupNow(): Promise<{ path: string; rows: number; bytes: number }> {
  const { data, error } = await supabase.functions.invoke('db-backup', { body: {} });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function listBackups(): Promise<Array<{ name: string; size: number; created_at: string }>> {
  const { data: days } = await supabase.storage.from('backups').list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } });
  const out: Array<{ name: string; size: number; created_at: string }> = [];
  for (const d of (days ?? []).slice(0, 10)) {
    const { data: files } = await supabase.storage.from('backups').list(d.name);
    for (const f of files ?? []) out.push({ name: `${d.name}/${f.name}`, size: (f.metadata as { size?: number })?.size ?? 0, created_at: f.created_at ?? '' });
  }
  return out;
}
export async function downloadBackup(path: string) {
  const { data, error } = await supabase.storage.from('backups').download(path);
  if (error) throw new Error(error.message);
  return data;
}
