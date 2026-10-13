import { supabase, unwrap } from '@/lib/supabase';
import type { Customer, Product, Profile } from '@/lib/types';
import { pick } from '@/domain/parsers/sheet';
import { DEFAULT_SALE_UNIT_RULES, cnpjDigits, normalizeKey, orderTotals, parseDiscounts, round3, type SaleUnit, type SaleUnitRules } from '@/domain/sales';

// ---------------------------------------------------------------------------
// Prévia de importação: cada linha vira nova, existente (atualiza), duplicada no arquivo ou erro.
// ---------------------------------------------------------------------------
export type PreviewStatus = 'nova' | 'existente' | 'duplicada' | 'erro';
export interface PreviewRow<T> { line: number; status: PreviewStatus; reason?: string; data: T; changes?: string[] }

export interface CustomerImportRow { cnpj: string; name: string; seller_name: string | null; seller_id: string | null; discounts: number[]; existingId?: string; warning?: string }
export interface ProductImportRow { code: string; reference: string; name: string }

export const CUSTOMER_COLUMNS = ['Vendedor', 'CNPJ', 'Nome do cliente/loja', 'Desconto financeiro'];
export const CUSTOMER_EXAMPLE = ['Maria Vendedora', '01.234.567/0001-89', 'Mercado Exemplo', '3%;1%'];
export const PRODUCT_COLUMNS = ['Referência', 'Código', 'Nome do produto'];
export const PRODUCT_EXAMPLE = ['ISA', '000123', 'TEMPERO EXEMPLO 1KG'];

export async function listSellers(): Promise<Profile[]> {
  return unwrap(await supabase.from('profiles').select('*').eq('role', 'vendedor').eq('status', 'ativo').order('name')) as Profile[];
}

/** Acha o usuário vendedor pelo nome ou e-mail da planilha (sem acento/maiúsculas). */
function findSeller(raw: string, sellers: Profile[]): Profile | null {
  const k = normalizeKey(raw);
  if (!k) return null;
  return sellers.find((s) => normalizeKey(s.name) === k || normalizeKey(s.email) === k || normalizeKey(s.email?.split('@')[0]) === k) ?? null;
}

export function previewCustomers(rows: Record<string, string>[], lines: number[], existing: Customer[], sellers: Profile[]): PreviewRow<CustomerImportRow>[] {
  const byCnpj = new Map(existing.filter((c) => c.cnpj).map((c) => [cnpjDigits(c.cnpj), c]));
  const seen = new Map<string, number>();
  return rows.map((r, i) => {
    const line = lines[i];
    const rawCnpj = pick(r, ['cnpj', 'cnpj do cliente']);
    const name = pick(r, ['nome do cliente loja', 'nome do cliente', 'cliente', 'loja', 'nome']).trim();
    const sellerRaw = pick(r, ['vendedor', 'representante']).trim();
    const disc = parseDiscounts(pick(r, ['desconto financeiro', 'desconto', 'descontos']));
    const cnpj = cnpjDigits(rawCnpj);
    const seller = findSeller(sellerRaw, sellers);
    const data: CustomerImportRow = { cnpj, name, seller_name: sellerRaw || null, seller_id: seller?.id ?? null, discounts: disc.values };
    if (sellerRaw && !seller) data.warning = `vendedor "${sellerRaw}" sem usuário no sistema: o cliente fica só para o ADM até ser vinculado`;
    if (!rawCnpj) return { line, status: 'erro', reason: 'CNPJ vazio', data };
    if (cnpj.length !== 14) return { line, status: 'erro', reason: `CNPJ "${rawCnpj}" não tem 14 dígitos`, data };
    if (!name) return { line, status: 'erro', reason: 'nome do cliente/loja vazio', data };
    if (disc.error) return { line, status: 'erro', reason: disc.error, data };
    if (seen.has(cnpj)) return { line, status: 'duplicada', reason: `mesmo CNPJ da linha ${seen.get(cnpj)} (vale a primeira)`, data };
    seen.set(cnpj, line);
    const cur = byCnpj.get(cnpj);
    if (!cur) return { line, status: 'nova', data };
    data.existingId = cur.id;
    const changes: string[] = [];
    if (cur.name !== name) changes.push(`nome: ${cur.name} → ${name}`);
    if ((cur.seller_name ?? '') !== (data.seller_name ?? '') || (cur.seller_id ?? null) !== data.seller_id) changes.push(`vendedor: ${cur.seller_name || '—'} → ${data.seller_name || '—'}`);
    const curDisc = (cur.financial_discounts ?? []).map(Number).join(';'), newDisc = data.discounts.join(';');
    if (curDisc !== newDisc) changes.push(`desconto: ${curDisc || 'nenhum'} → ${newDisc || 'nenhum'}`);
    return { line, status: 'existente', data, changes };
  });
}

/** Grava a prévia: inclui as novas; atualiza as existentes só quando confirmado. Nunca apaga quem não está no arquivo. */
export async function commitCustomers(rows: PreviewRow<CustomerImportRow>[], updateExisting: boolean) {
  const inserts = rows.filter((r) => r.status === 'nova').map((r) => ({ cnpj: r.data.cnpj, name: r.data.name, seller_id: r.data.seller_id, seller_name: r.data.seller_name, financial_discounts: r.data.discounts, active: true }));
  const updates = updateExisting ? rows.filter((r) => r.status === 'existente' && r.changes?.length) : [];
  for (let i = 0; i < inserts.length; i += 200) unwrap(await supabase.from('customers').insert(inserts.slice(i, i + 200)));
  for (const r of updates) unwrap(await supabase.from('customers').update({ name: r.data.name, seller_id: r.data.seller_id, seller_name: r.data.seller_name, financial_discounts: r.data.discounts, updated_at: new Date().toISOString() }).eq('id', r.data.existingId!));
  return { included: inserts.length, updated: updates.length, rejected: rows.filter((r) => r.status === 'erro' || r.status === 'duplicada').length };
}

/**
 * Produtos: o cadastro atual usa o CÓDIGO como identificador único (chave da tabela), então a importação também.
 * O mesmo código com referências diferentes no arquivo é erro (não sobrescreve um produto com outro).
 */
export function previewProducts(rows: Record<string, string>[], lines: number[], existing: Product[]): PreviewRow<ProductImportRow>[] {
  const byCode = new Map(existing.map((p) => [p.code, p]));
  const seen = new Map<string, { line: number; ref: string }>();
  return rows.map((r, i) => {
    const line = lines[i];
    const code = pick(r, ['codigo', 'cod', 'codigo do produto']).trim();
    const reference = pick(r, ['referencia', 'ref']).trim();
    const name = pick(r, ['nome do produto', 'produto', 'descricao', 'nome']).trim();
    const data = { code, reference, name };
    if (!code) return { line, status: 'erro', reason: 'código vazio', data };
    if (!name) return { line, status: 'erro', reason: 'nome do produto vazio', data };
    if (!reference) return { line, status: 'erro', reason: 'referência vazia', data };
    const prev = seen.get(code);
    if (prev) {
      return normalizeKey(prev.ref) === normalizeKey(reference)
        ? { line, status: 'duplicada', reason: `mesmo código da linha ${prev.line} (vale a primeira)`, data }
        : { line, status: 'erro', reason: `código ${code} já aparece na linha ${prev.line} com outra referência (${prev.ref})`, data };
    }
    seen.set(code, { line, ref: reference });
    const cur = byCode.get(code);
    if (!cur) return { line, status: 'nova', data };
    const changes: string[] = [];
    if (cur.description !== name) changes.push(`nome: ${cur.description} → ${name}`);
    if ((cur.reference ?? '') !== reference) changes.push(`referência: ${cur.reference || '—'} → ${reference}`);
    return { line, status: 'existente', data, changes };
  });
}

/** Não cria preço nem conversão: só código, referência e nome (o resto do cadastro fica como está ou no padrão). */
export async function commitProducts(rows: PreviewRow<ProductImportRow>[], updateExisting: boolean) {
  const inserts = rows.filter((r) => r.status === 'nova').map((r) => ({ code: r.data.code, reference: r.data.reference, description: r.data.name, active: true }));
  const updates = updateExisting ? rows.filter((r) => r.status === 'existente' && r.changes?.length) : [];
  for (let i = 0; i < inserts.length; i += 200) unwrap(await supabase.from('products').insert(inserts.slice(i, i + 200)));
  for (const r of updates) unwrap(await supabase.from('products').update({ reference: r.data.reference, description: r.data.name, updated_at: new Date().toISOString() }).eq('code', r.data.code));
  return { included: inserts.length, updated: updates.length, rejected: rows.filter((r) => r.status === 'erro' || r.status === 'duplicada').length };
}

// ---------------------------------------------------------------------------
// Vínculo cliente → vendedor (só ADM; o banco registra cada troca)
// ---------------------------------------------------------------------------
export async function setCustomerSeller(customerId: string, seller: Profile | null) {
  unwrap(await supabase.from('customers').update({ seller_id: seller?.id ?? null, seller_name: seller?.name ?? null, updated_at: new Date().toISOString() }).eq('id', customerId));
}
export async function setCustomerDiscounts(customerId: string, discounts: number[]) {
  unwrap(await supabase.from('customers').update({ financial_discounts: discounts, updated_at: new Date().toISOString() }).eq('id', customerId));
}

export async function getSaleUnitRules(): Promise<SaleUnitRules> {
  const row = unwrap(await supabase.from('app_settings').select('value').eq('key', 'sale_unit_rules').maybeSingle()) as { value: SaleUnitRules } | null;
  return row?.value && Object.keys(row.value).length ? row.value : DEFAULT_SALE_UNIT_RULES;
}

// ---------------------------------------------------------------------------
// Pedido de venda (quantidade em kg ou unidade, preço por kg/unidade, desconto financeiro)
// ---------------------------------------------------------------------------
export interface SalesItemInput { product: Pick<Product, 'code' | 'description' | 'reference' | 'units_per_box'>; sale_unit: SaleUnit; quantity: number; unit_price: number }
export interface SalesOrderInput {
  id?: string;
  customer: Pick<Customer, 'id' | 'name' | 'cnpj' | 'seller_name'>;
  order_number: string | null;
  order_date: string | null;
  delivery_date: string | null;
  status: string;
  notes: string | null;
  discount_pct: number;
  allow_other_packaging: boolean | null;
  items: SalesItemInput[];
}

/** Grava o pedido com o retrato do cliente e dos produtos; cadastros alterados depois não mudam o histórico. */
export async function saveSalesOrder(input: SalesOrderInput): Promise<{ id: string }> {
  const t = orderTotals(input.items, input.discount_pct);
  const payload = {
    customer_id: input.customer.id,
    customer_name: input.customer.name,
    customer_cnpj: input.customer.cnpj,
    seller_name: input.customer.seller_name ?? null,
    order_number: input.order_number || null,
    order_date: input.order_date,
    delivery_date: input.delivery_date,
    status: input.status,
    notes: input.notes,
    subtotal_value: t.subtotal,
    discount_pct: input.discount_pct,
    discount_value: t.discount,
    total_value: t.total,
    total_weight: round3(input.items.filter((i) => i.sale_unit === 'kg').reduce((s, i) => s + i.quantity, 0)) || null,
    source: 'manual',
    allow_other_packaging: input.allow_other_packaging,
  };
  let id = input.id;
  try {
    if (id) {
      unwrap(await supabase.from('orders').update(payload).eq('id', id));
      unwrap(await supabase.from('order_items').delete().eq('order_id', id));
    } else {
      id = (unwrap(await supabase.from('orders').insert(payload).select('id').single()) as { id: string }).id;
    }
  } catch (e) {
    if (/duplicate key|orders_number/i.test((e as Error).message)) throw new Error(`Já existe um pedido nº ${input.order_number} para este cliente.`);
    throw e;
  }
  const rows = input.items.map((i, idx) => {
    const upb = i.product.units_per_box > 0 ? i.product.units_per_box : 48;
    // Produção: unidade entra em unidades (como hoje); kg entra em kg, sem conversão.
    const units = i.sale_unit === 'un' ? i.quantity : 0;
    return {
      order_id: id,
      seq: idx + 1,
      client_code: null,
      raw_description: i.product.description,
      product_code: i.product.code,
      product_reference: i.product.reference,
      product_name: i.product.description,
      sale_unit: i.sale_unit,
      quantity: i.quantity,
      quantity_boxes: i.sale_unit === 'un' ? Math.round((i.quantity / upb) * 1000) / 1000 : 0,
      units_per_box: upb,
      quantity_units: units,
      weight_kg: i.sale_unit === 'kg' ? i.quantity : null,
      unit_price: i.unit_price,
      total_price: t.lineTotals[idx],
      match_status: 'manual',
      match_score: 1,
      candidates: [],
    };
  });
  if (rows.length) unwrap(await supabase.from('order_items').insert(rows));
  return { id: id! };
}

/** Pedidos em aberto (aberto ou em produção) do cliente: aviso ao começar um pedido novo para quem já tem pedido. */
export async function openOrdersOf(customerId: string): Promise<Array<{ id: string; order_number: string | null; order_date: string | null; total_value: number }>> {
  return unwrap(await supabase.from('orders').select('id, order_number, order_date, total_value').eq('customer_id', customerId).in('status', ['aberto', 'em_producao']).order('order_date', { ascending: false }).limit(5)) as Array<{ id: string; order_number: string | null; order_date: string | null; total_value: number }>;
}
