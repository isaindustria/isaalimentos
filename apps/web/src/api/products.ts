import { supabase, unwrap } from '@/lib/supabase';
import type { Product, ProductAlias } from '@/lib/types';
import { normalizedKey } from '@/domain/normalize';

export async function listProducts(includeInactive = false): Promise<Product[]> {
  let q = supabase.from('products').select('*').order('description');
  if (!includeInactive) q = q.eq('active', true);
  return unwrap(await q);
}

export type ProductInput = Partial<Product> & { code: string; description: string };

export async function upsertProduct(input: ProductInput): Promise<Product> {
  const payload = {
    code: input.code.trim(),
    description: input.description.trim(),
    reference: input.reference ?? null,
    units_per_box: input.units_per_box ?? 48,
    weight_g: input.weight_g ?? null,
    unit: input.unit ?? 'PT',
    category: input.category ?? null,
    min_stock: input.min_stock ?? 0,
    active: input.active ?? true,
  };
  return unwrap(await supabase.from('products').upsert(payload, { onConflict: 'code' }).select('*').single());
}

export async function deleteProduct(code: string) {
  unwrap(await supabase.from('products').delete().eq('code', code));
}

export async function listAliases(): Promise<ProductAlias[]> {
  return unwrap(await supabase.from('product_aliases').select('*').order('created_at', { ascending: false }));
}

export async function addAlias(input: { product_code: string; client_code?: string | null; description?: string | null }) {
  const normalized = input.description ? normalizedKey(input.description) || null : null;
  const rows: Array<Record<string, unknown>> = [];
  if (input.client_code) rows.push({ product_code: input.product_code, client_code: input.client_code, description: input.description ?? null, normalized: null });
  if (normalized) rows.push({ product_code: input.product_code, client_code: null, description: input.description ?? null, normalized });
  for (const r of rows) {
    // Replace any previous mapping for the same key.
    if (r.client_code) await supabase.from('product_aliases').delete().eq('client_code', r.client_code as string);
    if (r.normalized) await supabase.from('product_aliases').delete().eq('normalized', r.normalized as string);
    unwrap(await supabase.from('product_aliases').insert(r));
  }
}

export async function deleteAlias(id: string) {
  unwrap(await supabase.from('product_aliases').delete().eq('id', id));
}
