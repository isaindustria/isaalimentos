import { supabase, unwrap } from '@/lib/supabase';
import type { ProductionRun, ProductionRunItem, RunStatus } from '@/lib/types';
import type { ProductionRow } from '@/domain/production';

export async function listRuns(limit = 50): Promise<ProductionRun[]> {
  return unwrap(await supabase.from('production_runs').select('*').order('created_at', { ascending: false }).limit(limit));
}

export async function getRun(id: string): Promise<ProductionRun & { items: ProductionRunItem[] }> {
  const run = unwrap(await supabase.from('production_runs').select('*').eq('id', id).single()) as ProductionRun;
  const items = unwrap(
    await supabase.from('production_run_items').select('*').eq('run_id', id).order('production_need', { ascending: false }),
  ) as ProductionRunItem[];
  return { ...run, items };
}

export async function saveRun(input: {
  name: string;
  stockImportId: string | null;
  orderIds: string[];
  notes?: string | null;
  rows: ProductionRow[];
  userId?: string | null;
}): Promise<ProductionRun> {
  const run = unwrap(
    await supabase
      .from('production_runs')
      .insert({ name: input.name, stock_import_id: input.stockImportId, order_ids: input.orderIds, notes: input.notes ?? null, created_by: input.userId ?? null })
      .select('*')
      .single(),
  ) as ProductionRun;
  const items = input.rows
    .filter((r) => r.ordered > 0 || r.need > 0)
    .map((r) => ({
      run_id: run.id,
      product_code: r.code,
      description: r.description,
      stock_available: r.stockTotal,
      ordered_units: r.ordered,
      production_need: r.need,
      remaining: r.remaining,
    }));
  if (items.length) unwrap(await supabase.from('production_run_items').insert(items));
  return run;
}

export async function setRunStatus(id: string, status: RunStatus) {
  unwrap(await supabase.from('production_runs').update({ status }).eq('id', id));
}

export async function setProduced(itemId: string, produced: number) {
  unwrap(await supabase.from('production_run_items').update({ produced_units: produced }).eq('id', itemId));
}

export async function deleteRun(id: string) {
  unwrap(await supabase.from('production_runs').delete().eq('id', id));
}
