import { supabase, unwrap } from '@/lib/supabase';
import type { ProdAlias, ProdDemand, ProdPending, ProdPendingCandidate, ProdProduct, ProdStock } from '@/lib/types';
import { DEFAULT_NO_MARGIN, isNoMargin, useGrams } from '@/domain/producao';
import { parseProductDescription } from '@/domain/parsers/weight';

export type ProdImportMode = 'incluir' | 'substituir';

/* ---------------- Leitura ---------------- */
export async function listProdProducts(): Promise<ProdProduct[]> {
  return unwrap(await supabase.from('prod_products').select('*').order('name'));
}
export async function listProdStock(): Promise<ProdStock[]> {
  return unwrap(await supabase.from('prod_stock').select('*'));
}
export async function listProdDemand(): Promise<ProdDemand[]> {
  return unwrap(await supabase.from('prod_demand').select('*').order('imported_at', { ascending: false }));
}
export async function listProdPending(): Promise<ProdPending[]> {
  return unwrap(await supabase.from('prod_pending').select('*').order('created_at'));
}
export async function listProdAliases(): Promise<ProdAlias[]> {
  return unwrap(await supabase.from('prod_aliases').select('*'));
}

/** Lista de produtos sem margem (configuravel em app_settings, chave prod_no_margin). */
export async function getNoMarginList(): Promise<string[]> {
  const row = unwrap(await supabase.from('app_settings').select('value').eq('key', 'prod_no_margin').maybeSingle()) as { value: string[] } | null;
  return Array.isArray(row?.value) && row!.value.length ? row!.value : DEFAULT_NO_MARGIN;
}

/* ---------------- Importar cadastro ---------------- */
export interface ProdCatalogRow { code: string; reference: string | null; description: string }
export interface ProdInconsistency { code: string; current: Pick<ProdProduct, 'name' | 'reference' | 'weight_g' | 'description'>; incoming: Pick<ProdProduct, 'name' | 'reference' | 'weight_g' | 'description'> }
export interface ProdCatalogResult { created: number; unchanged: number; inconsistencies: ProdInconsistency[] }

function buildProduct(r: ProdCatalogRow, noMargin: string[]) {
  const p = parseProductDescription(r.description);
  const nm = isNoMargin(p.name, noMargin);
  const weight_g = p.weightKg != null ? Math.round(p.weightKg * 1000) : null;
  return { code: r.code, reference: r.reference, name: p.name, description: r.description, brand: p.brand, weight_g, use_g: useGrams(weight_g, nm), units_per_box: p.unitsPerBox ?? 48, no_margin: nm, active: true };
}

/** Identifica pelo codigo. Codigo novo: cadastra. Codigo existente igual: ignora. Diferente: vai para ajuste manual (nunca sobrescreve sozinho). */
export async function importProdCatalog(mode: ProdImportMode, rows: ProdCatalogRow[]): Promise<ProdCatalogResult & { removed: number }> {
  const noMargin = await getNoMarginList();
  let removed = 0;
  if (mode === 'substituir') {
    const { count } = await supabase.from('prod_products').delete({ count: 'exact' }).neq('code', '');
    removed = count ?? 0;
  }
  const existing = (await listProdProducts()) as ProdProduct[];
  const byCode = new Map(existing.map((p) => [p.code, p]));
  const seen = new Set<string>();
  const toInsert: ReturnType<typeof buildProduct>[] = [];
  const inconsistencies: ProdInconsistency[] = [];
  let unchanged = 0;
  for (const r of rows) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    const inc = buildProduct(r, noMargin);
    const cur = byCode.get(r.code);
    if (!cur) { toInsert.push(inc); continue; }
    if (cur.name === inc.name && (cur.weight_g ?? null) === inc.weight_g && (cur.reference ?? null) === (inc.reference ?? null)) { unchanged++; continue; }
    inconsistencies.push({ code: r.code, current: { name: cur.name, reference: cur.reference, weight_g: cur.weight_g, description: cur.description }, incoming: { name: inc.name, reference: inc.reference, weight_g: inc.weight_g, description: inc.description } });
  }
  for (let i = 0; i < toInsert.length; i += 200) unwrap(await supabase.from('prod_products').insert(toInsert.slice(i, i + 200)));
  return { created: toInsert.length, unchanged, inconsistencies, removed };
}

/** Ajuste manual: aplica a versao da planilha por cima do cadastro atual. */
export async function applyProdInconsistency(code: string, description: string, reference: string | null) {
  const noMargin = await getNoMarginList();
  const p = buildProduct({ code, reference, description }, noMargin);
  unwrap(await supabase.from('prod_products').update({ ...p, updated_at: new Date().toISOString() }).eq('code', code));
}

export async function saveProdProduct(p: Partial<ProdProduct> & { code: string; name: string }) {
  const noMargin = await getNoMarginList();
  const nm = p.no_margin ?? isNoMargin(p.name, noMargin);
  const weight_g = p.weight_g ?? null;
  const payload = { reference: p.reference ?? null, name: p.name, description: p.description ?? p.name, brand: p.brand ?? null, weight_g, use_g: useGrams(weight_g, nm), units_per_box: p.units_per_box ?? 48, no_margin: nm, active: p.active ?? true, updated_at: new Date().toISOString() };
  unwrap(await supabase.from('prod_products').upsert({ code: p.code, ...payload }, { onConflict: 'code' }));
}
export async function deleteProdProduct(code: string) {
  unwrap(await supabase.from('prod_products').delete().eq('code', code));
}

/* ---------------- Importar estoque atual ---------------- */
/** Formato longo (location + qty, uma linha por local) ou largo (stock1/stock5 na mesma linha, modelo do gestor). */
export interface ProdStockRow { code: string; location?: number; qty?: number; stock1?: number; stock5?: number }
export interface ProdStockResult { updated: number; unmatched: string[]; ignored: number }

/** Soma os locais 1 e 5 por codigo. So atualiza quem existe no cadastro; codigo desconhecido fica para conferencia. Nao mexe na base de calculo. */
export async function importProdStock(mode: ProdImportMode, rows: ProdStockRow[]): Promise<ProdStockResult> {
  const products = (await listProdProducts()) as ProdProduct[];
  if (mode === 'substituir') unwrap(await supabase.from('prod_stock').update({ stock1: 0, stock5: 0, updated_at: new Date().toISOString() }).neq('code', ''));
  const known = new Set(products.map((p) => p.code));
  const totals = new Map<string, { stock1: number; stock5: number }>();
  const unmatched = new Set<string>();
  let ignored = 0;
  for (const r of rows) {
    const wide = r.stock1 != null || r.stock5 != null;
    if (!wide && r.location !== 1 && r.location !== 5) { ignored++; continue; }
    if (!known.has(r.code)) { unmatched.add(r.code); continue; }
    const t = totals.get(r.code) ?? { stock1: 0, stock5: 0 };
    if (wide) { t.stock1 += Number(r.stock1 ?? 0); t.stock5 += Number(r.stock5 ?? 0); }
    else if (r.location === 1) t.stock1 += Number(r.qty ?? 0); else t.stock5 += Number(r.qty ?? 0);
    totals.set(r.code, t);
  }
  const payload = [...totals.entries()].map(([code, t]) => ({ code, stock1: t.stock1, stock5: t.stock5, updated_at: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 200) unwrap(await supabase.from('prod_stock').upsert(payload.slice(i, i + 200), { onConflict: 'code' }));
  return { updated: payload.length, unmatched: [...unmatched], ignored };
}

/* ---------------- Importar pedido ---------------- */
export interface ProdDemandInput { code: string; raw_description: string | null; store: string | null; boxes: number; units: number }
export interface ProdPendingInput { raw_description: string; client_code: string | null; store: string | null; boxes: number; units: number; candidates: ProdPendingCandidate[] }

export async function importProdDemand(mode: ProdImportMode, source: string, matched: ProdDemandInput[], pending: ProdPendingInput[]) {
  if (mode === 'substituir') await clearProdDemand();
  if (matched.length) unwrap(await supabase.from('prod_demand').insert(matched.map((m) => ({ ...m, source }))));
  if (pending.length) unwrap(await supabase.from('prod_pending').insert(pending.map((p) => ({ ...p, source }))));
  return { matched: matched.length, pending: pending.length };
}

/** Ajuste manual de um item do pedido: vira demanda do produto escolhido e o sistema aprende o apelido. */
export async function resolveProdPending(p: ProdPending, code: string) {
  unwrap(await supabase.from('prod_demand').insert({ code, raw_description: p.raw_description, store: p.store, boxes: p.boxes, units: p.units, source: p.source }));
  unwrap(await supabase.from('prod_aliases').upsert({ raw: p.raw_description, client_code: p.client_code, code }, { onConflict: 'raw' }));
  unwrap(await supabase.from('prod_pending').delete().eq('id', p.id));
}
export async function discardProdPending(id: string) {
  unwrap(await supabase.from('prod_pending').delete().eq('id', id));
}
/** Zera o pedido atual (demanda e itens pendentes) para importar um pedido novo. */
export async function clearProdDemand() {
  unwrap(await supabase.from('prod_demand').delete().neq('units', -1));
  unwrap(await supabase.from('prod_pending').delete().neq('units', -1));
}

/** Apaga o cadastro inteiro da Producao (produtos, estoque, pedido, pendencias e apelidos). So administrador. */
export async function clearProdAll() {
  unwrap(await supabase.from('prod_pending').delete().neq('units', -1));
  unwrap(await supabase.from('prod_products').delete().neq('code', ''));
}
