/**
 * Production need = total ordered (all stores) − available stock (locations 1 + 5).
 * Positive "need" means the factory must produce; "remaining" is the leftover when stock covers demand.
 */

export interface StockLine {
  code: string;
  description: string;
  location_1: number;
  location_5: number;
  total: number;
  units_per_box?: number;
  min_stock?: number;
}

export interface DemandLine {
  productCode: string;
  units: number;
  boxes?: number;
  ordersCount?: number;
}

export type RowStatus = 'produzir' | 'atende' | 'sem_pedido' | 'critico';

export interface ProductionRow {
  code: string;
  description: string;
  unitsPerBox: number;
  stock1: number;
  stock5: number;
  stockTotal: number;
  ordered: number;
  orderedBoxes: number;
  ordersCount: number;
  /** ordered − stock, signed (negative = stock covers with leftover) */
  difference: number;
  need: number;
  needBoxes: number;
  remaining: number;
  status: RowStatus;
}

export interface ProductionSummary {
  products: number;
  toProduce: number;
  totalNeedUnits: number;
  totalNeedBoxes: number;
  totalOrderedUnits: number;
  totalStockUnits: number;
}

export interface ProductionOptions {
  /** Just-in-time: keep the minimum stock after serving orders (safety stock). */
  includeMinStock?: boolean;
}

export function computeProduction(stock: StockLine[], demand: DemandLine[], options: ProductionOptions = {}): ProductionRow[] {
  const byCode = new Map<string, DemandLine>();
  for (const d of demand) {
    const cur = byCode.get(d.productCode);
    if (cur) {
      cur.units += d.units;
      cur.boxes = (cur.boxes ?? 0) + (d.boxes ?? 0);
      cur.ordersCount = (cur.ordersCount ?? 0) + (d.ordersCount ?? 0);
    } else byCode.set(d.productCode, { ...d, boxes: d.boxes ?? 0, ordersCount: d.ordersCount ?? 0 });
  }

  return stock
    .map<ProductionRow>((s) => {
      const d = byCode.get(s.code);
      const ordered = d?.units ?? 0;
      const unitsPerBox = s.units_per_box && s.units_per_box > 0 ? s.units_per_box : 48;
      const stockTotal = Number(s.total ?? 0);
      const safety = options.includeMinStock ? Number(s.min_stock ?? 0) : 0;
      const difference = ordered + safety - stockTotal;
      const need = Math.max(0, difference);
      const remaining = Math.max(0, -difference);
      let status: RowStatus = 'sem_pedido';
      if (ordered > 0 || need > 0) status = need > 0 ? 'produzir' : 'atende';
      if (ordered > 0 && need > 0 && stockTotal === 0) status = 'critico';
      return {
        code: s.code,
        description: s.description,
        unitsPerBox,
        stock1: Number(s.location_1 ?? 0),
        stock5: Number(s.location_5 ?? 0),
        stockTotal,
        ordered,
        orderedBoxes: d?.boxes ?? Math.round(ordered / unitsPerBox),
        ordersCount: d?.ordersCount ?? 0,
        difference,
        need,
        needBoxes: Math.ceil(need / unitsPerBox),
        remaining,
        status,
      };
    })
    .sort((a, b) => b.need - a.need || b.ordered - a.ordered || a.description.localeCompare(b.description));
}

export function summarize(rows: ProductionRow[]): ProductionSummary {
  return rows.reduce<ProductionSummary>(
    (acc, r) => {
      acc.products += 1;
      if (r.need > 0) acc.toProduce += 1;
      acc.totalNeedUnits += r.need;
      acc.totalNeedBoxes += r.needBoxes;
      acc.totalOrderedUnits += r.ordered;
      acc.totalStockUnits += r.stockTotal;
      return acc;
    },
    { products: 0, toProduce: 0, totalNeedUnits: 0, totalNeedBoxes: 0, totalOrderedUnits: 0, totalStockUnits: 0 },
  );
}
