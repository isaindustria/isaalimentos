import { supabase, unwrap } from '@/lib/supabase';
import type { CurrentStock, StockBalance, StockImport } from '@/lib/types';
import type { StockAggregate } from '@/domain/parsers/stockXlsx';

export async function getCurrentStock(): Promise<CurrentStock[]> {
  return unwrap(await supabase.from('current_stock').select('*').order('description'));
}

export async function listStockImports(limit = 30): Promise<StockImport[]> {
  return unwrap(await supabase.from('stock_imports').select('*').order('imported_at', { ascending: false }).limit(limit));
}

export async function getImportBalances(importId: string): Promise<StockBalance[]> {
  return unwrap(await supabase.from('stock_balances').select('*').eq('import_id', importId));
}

export interface StockImportResult {
  importId: string;
  inserted: number;
  createdProducts: string[];
  skippedCodes: string[];
}

/**
 * Persists a parsed workbook as the new current stock.
 * Products missing from the catalog are created when `createMissing` is true; otherwise skipped.
 */
export async function createStockImport(input: {
  fileName: string;
  locations: number[];
  aggregates: StockAggregate[];
  rowsTotal: number;
  createMissing: boolean;
  userId?: string | null;
}): Promise<StockImportResult> {
  const codes = input.aggregates.map((a) => a.code);
  const existing = unwrap(await supabase.from('products').select('code').in('code', codes)) as Array<{ code: string }>;
  const known = new Set(existing.map((p) => p.code));
  const missing = input.aggregates.filter((a) => !known.has(a.code));

  const createdProducts: string[] = [];
  if (input.createMissing && missing.length) {
    unwrap(
      await supabase.from('products').insert(
        missing.map((m) => ({
          code: m.code,
          description: m.description,
          reference: m.reference,
          units_per_box: Number(m.description.match(/CX\s*(\d+)/i)?.[1] ?? 48),
          weight_g: Number(m.description.match(/-\s*(\d+)\s*g\s*-/i)?.[1]) || null,
        })),
      ),
    );
    for (const m of missing) {
      known.add(m.code);
      createdProducts.push(m.code);
    }
  }

  const usable = input.aggregates.filter((a) => known.has(a.code));
  const imp = unwrap(
    await supabase
      .from('stock_imports')
      .insert({
        file_name: input.fileName,
        locations: input.locations,
        rows_total: input.rowsTotal,
        products_count: usable.length,
        total_units: usable.reduce((s, a) => s + a.total, 0),
        imported_by: input.userId ?? null,
        is_current: true,
      })
      .select('*')
      .single(),
  ) as StockImport;

  const balances: Array<Omit<StockBalance, 'id'>> = [];
  for (const a of usable) {
    for (const loc of input.locations) {
      balances.push({ import_id: imp.id, product_code: a.code, location: loc, quantity: a.byLocation[loc] ?? 0 });
    }
  }
  if (balances.length) unwrap(await supabase.from('stock_balances').insert(balances));

  return {
    importId: imp.id,
    inserted: balances.length,
    createdProducts,
    skippedCodes: missing.filter((m) => !known.has(m.code)).map((m) => m.code),
  };
}

export async function setCurrentImport(importId: string) {
  unwrap(await supabase.from('stock_imports').update({ is_current: true }).eq('id', importId));
}

export async function deleteStockImport(importId: string) {
  unwrap(await supabase.from('stock_imports').delete().eq('id', importId));
}

// ---------------------------------------------------------------------------
// Movimentacoes manuais (entrada, saida, ajuste, producao, venda...)
// ---------------------------------------------------------------------------
import type { MovementKind, StockMovement } from '@/lib/types';

export async function listMovements(limit = 100, productCode?: string): Promise<StockMovement[]> {
  let q = supabase
    .from('stock_movements')
    .select('*, product:products(code, description), author:profiles(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (productCode) q = q.eq('product_code', productCode);
  return unwrap(await q);
}

export interface MovementInput {
  product_code: string;
  location: number;
  quantity: number; // sempre positivo; o sinal vem do tipo
  kind: MovementKind;
  reason?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  created_by?: string | null;
}

const NEGATIVE: MovementKind[] = ['saida', 'venda', 'perda'];

export async function addMovements(inputs: MovementInput[]) {
  const rows = inputs
    .filter((i) => i.quantity !== 0)
    .map((i) => ({
      product_code: i.product_code,
      location: i.location,
      quantity: NEGATIVE.includes(i.kind) ? -Math.abs(i.quantity) : i.kind === 'ajuste' || i.kind === 'inventario' ? i.quantity : Math.abs(i.quantity),
      kind: i.kind,
      reason: i.reason ?? null,
      reference_type: i.reference_type ?? null,
      reference_id: i.reference_id ?? null,
      created_by: i.created_by ?? null,
    }));
  if (!rows.length) return [];
  return unwrap(await supabase.from('stock_movements').insert(rows).select('*')) as StockMovement[];
}

/** Inventario: define o saldo absoluto de um produto/local (gera o ajuste necessario). */
export async function setInventory(input: { product_code: string; location: number; target: number; current: number; reason?: string; created_by?: string | null }) {
  const diff = input.target - input.current;
  if (diff === 0) return null;
  return addMovements([{ ...input, quantity: diff, kind: 'inventario', reason: input.reason ?? 'Contagem de inventário' }]);
}

export async function deleteMovement(id: string) {
  unwrap(await supabase.from('stock_movements').delete().eq('id', id));
}
