import type { ProdDemand, ProdProduct, ProdStock } from '@/lib/types';

/** Produtos sem margem de erro (regra do gestor: oregano, cravo e bicarbonato). Comparado sem acento, em minusculas. */
export const DEFAULT_NO_MARGIN = ['oregano', 'cravo', 'bicarbonato'];

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function isNoMargin(name: string, list: string[] = DEFAULT_NO_MARGIN): boolean {
  const n = fold(name);
  return list.some((w) => n.includes(fold(w)));
}

/** Margem de erro: potes +1 g (60 g -> 61 g); sacarias (1 kg ou mais) +10 g (10 kg -> 10,010 kg). Excecoes sem margem. */
export function marginGrams(weightG: number): number {
  return weightG >= 1000 ? 10 : 1;
}

/** Gr de uso (peso para producao) = peso + margem de erro. */
export function useGrams(weightG: number | null, noMargin: boolean): number | null {
  if (weightG == null) return null;
  return noMargin ? weightG : weightG + marginGrams(weightG);
}

export type NeedStatus = 'produzir' | 'atendido' | 'sem_pedido';

export interface NeedRow {
  code: string;
  name: string;
  useG: number | null;
  unitsPerBox: number;
  stock1: number;
  stock5: number;
  available: number;
  ordered: number;
  orderedBoxes: number;
  need: number;
  needBoxes: number;
  remaining: number;
  /** Quilos a produzir = necessidade x gr de uso / 1000. */
  kg: number;
  status: NeedStatus;
}

export interface NeedInfo {
  orderedUnits: number;
  servedUnits: number;
  produceUnits: number;
  produceKg: number;
  produceBoxes: number;
  productsOrdered: number;
  productsToProduce: number;
}

/** Necessidade = total pedido − estoque disponivel (estoque 1 + estoque 5). Nunca negativa; a sobra vai para "saldo restante". */
export function computeNeed(products: ProdProduct[], stock: ProdStock[], demand: ProdDemand[]): { rows: NeedRow[]; info: NeedInfo } {
  const stockBy = new Map(stock.map((s) => [s.code, s]));
  const demandBy = new Map<string, { units: number; boxes: number }>();
  for (const d of demand) {
    const cur = demandBy.get(d.code) ?? { units: 0, boxes: 0 };
    cur.units += Number(d.units);
    cur.boxes += Number(d.boxes);
    demandBy.set(d.code, cur);
  }
  const rows: NeedRow[] = products
    .filter((p) => p.active)
    .map((p) => {
      const s = stockBy.get(p.code);
      const stock1 = Number(s?.stock1 ?? 0);
      const stock5 = Number(s?.stock5 ?? 0);
      const available = stock1 + stock5;
      const d = demandBy.get(p.code);
      const ordered = d?.units ?? 0;
      const unitsPerBox = p.units_per_box > 0 ? p.units_per_box : 48;
      const diff = ordered - available;
      const need = Math.max(0, diff);
      const remaining = Math.max(0, -diff);
      const useG = p.use_g ?? useGrams(p.weight_g, p.no_margin);
      const status: NeedStatus = ordered > 0 ? (need > 0 ? 'produzir' : 'atendido') : 'sem_pedido';
      return { code: p.code, name: p.name, useG, unitsPerBox, stock1, stock5, available, ordered, orderedBoxes: d?.boxes ?? ordered / unitsPerBox, need, needBoxes: need / unitsPerBox, remaining, kg: useG != null ? (need * useG) / 1000 : 0, status };
    })
    .sort((a, b) => (b.need - a.need) || (b.ordered - a.ordered) || a.name.localeCompare(b.name, 'pt-BR'));
  const withOrder = rows.filter((r) => r.ordered > 0);
  const info: NeedInfo = {
    orderedUnits: withOrder.reduce((t, r) => t + r.ordered, 0),
    servedUnits: withOrder.reduce((t, r) => t + Math.min(r.ordered, r.available), 0),
    produceUnits: withOrder.reduce((t, r) => t + r.need, 0),
    produceKg: withOrder.reduce((t, r) => t + r.kg, 0),
    produceBoxes: withOrder.reduce((t, r) => t + r.needBoxes, 0),
    productsOrdered: withOrder.length,
    productsToProduce: withOrder.filter((r) => r.need > 0).length,
  };
  return { rows, info };
}
