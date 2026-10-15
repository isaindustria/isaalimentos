/**
 * Vendas parte 6: dos pedidos para a Produção e o Faturamento.
 *
 * - Item de REVENDA vai direto para o faturamento (Rotas de entrega).
 * - Os demais itens são somados por código. O estoque do próprio produto (unidades × equivalência em kg) atende
 *   primeiro os pedidos com entrega mais próxima; item atendido pelo estoque também vai direto para o faturamento.
 * - Produto alternativo (mesma base, outra embalagem) só é usado se o estoque dele cobrir TODO o restante e
 *   todos esses pedidos tiverem "Se precisar, posso trocar a embalagem?" = SIM.
 * - O que sobra vai para a Produção: desconta o semiacabado em estoque (dividido entre os produtos que usam o
 *   mesmo semiacabado, pela entrega mais próxima) e aplica a produção mínima do semiacabado.
 *   Ex.: 150 kg pedidos − 20 kg em estoque − 100 kg de semiacabado = 30 kg; mínimo 50 ⇒ produzir 50 kg.
 */
import { normalizeKey } from './sales';

export type Etapa = 'aberto' | 'em_producao' | 'faturado' | 'entregue';
export type Fluxo = 'producao' | 'faturamento';

export interface PlanProduct {
  code: string; description: string; reference: string | null; weight_g: number | null;
  equivalence_kg?: number | null; semi_code?: string | null; alt_code?: string | null; min_production_kg?: number | null; is_semi?: boolean | null;
}
export interface PlanItem {
  itemId: string; orderId: string; orderNumber: string | null; customer: string | null;
  productCode: string; productName: string | null; reference: string | null;
  saleUnit: 'kg' | 'un' | null; quantity: number | null; quantityUnits: number | null; weightKg: number | null;
  deliveryDate: string | null; createdAt: string; allowSwap: boolean | null; stage: Etapa;
  unitPrice?: number | null; totalPrice?: number | null;
}
export interface PlanRow {
  code: string; name: string; earliest: string | null;
  pedidoKg: number; estoqueUn: number; estoqueKg: number;
  altCode: string | null; altUn: number; altUsado: boolean;
  semiCode: string | null; semiKg: number;
  necessidadeKg: number; minKg: number | null; produzirKg: number;
  situacao: 'atendido' | 'produzir' | 'sem_cadastro';
}
export interface ItemRoute { fluxo: Fluxo; motivo: 'revenda' | 'estoque' | 'alternativo' | 'producao' | 'etapa' }

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const isRevenda = (ref: string | null | undefined) => normalizeKey(ref).includes('revenda');
export const equivalencia = (p: PlanProduct | undefined) => (p ? (p.equivalence_kg != null && p.equivalence_kg > 0 ? Number(p.equivalence_kg) : p.weight_g ? p.weight_g / 1000 : null) : null);

/** Quilos pedidos no item (kg direto, ou unidades × equivalência). */
export function itemKg(it: PlanItem, p: PlanProduct | undefined): number | null {
  if (it.saleUnit === 'kg') return Number(it.quantity ?? 0);
  const eq = equivalencia(p);
  const un = it.saleUnit === 'un' ? Number(it.quantity ?? 0) : Number(it.quantityUnits ?? 0);
  if (eq == null) return it.saleUnit == null && it.weightKg ? Number(it.weightKg) : null;
  return r3(un * eq);
}

const byDate = (a: { deliveryDate: string | null; createdAt: string }, b: { deliveryDate: string | null; createdAt: string }) =>
  (a.deliveryDate ?? '9999-12-31').localeCompare(b.deliveryDate ?? '9999-12-31') || a.createdAt.localeCompare(b.createdAt);

export function planejar(items: PlanItem[], products: Map<string, PlanProduct>, estoque: Map<string, number>) {
  const stockUnits = new Map(estoque); // cópia: o alternativo reserva unidades
  const routes = new Map<string, ItemRoute>();
  // itens já movidos pelo PCP/faturamento ficam onde estão
  for (const it of items) {
    if (it.stage === 'faturado' || it.stage === 'entregue') routes.set(it.itemId, { fluxo: 'faturamento', motivo: 'etapa' });
    else if (isRevenda(it.reference ?? products.get(it.productCode)?.reference)) routes.set(it.itemId, { fluxo: 'faturamento', motivo: 'revenda' });
  }
  const ativos = items.filter((it) => !routes.has(it.itemId)).sort(byDate);
  const porCodigo = new Map<string, PlanItem[]>();
  for (const it of ativos) { const l = porCodigo.get(it.productCode) ?? []; l.push(it); porCodigo.set(it.productCode, l); }

  const rows: PlanRow[] = [];
  const semiLivre = new Map<string, number>(); // kg de semiacabado ainda não usado
  const pendentes: Array<{ row: PlanRow; restante: number }> = [];
  for (const [code, lista] of porCodigo) {
    const p = products.get(code);
    const eq = equivalencia(p);
    const kgs = lista.map((it) => itemKg(it, p));
    const row: PlanRow = {
      code, name: p?.description ?? lista[0].productName ?? code, earliest: lista[0].deliveryDate,
      pedidoKg: r3(kgs.reduce<number>((s, k) => s + (k ?? 0), 0)), estoqueUn: stockUnits.get(code) ?? 0, estoqueKg: 0,
      altCode: p?.alt_code || null, altUn: 0, altUsado: false, semiCode: p?.semi_code || null, semiKg: 0,
      necessidadeKg: 0, minKg: null, produzirKg: 0, situacao: 'produzir',
    };
    if (eq == null || kgs.some((k) => k == null)) {
      row.situacao = 'sem_cadastro';
      lista.forEach((it) => routes.set(it.itemId, { fluxo: 'producao', motivo: 'producao' }));
      rows.push(row); continue;
    }
    row.estoqueKg = r3(Math.max(0, row.estoqueUn) * eq);
    // 1) estoque do próprio produto, pela entrega mais próxima (item só sai se for atendido inteiro)
    let livre = row.estoqueKg;
    const faltam: PlanItem[] = [];
    lista.forEach((it, i) => {
      const k = kgs[i]!;
      if (it.stage === 'aberto' && k <= livre + 1e-9) { livre = r3(livre - k); routes.set(it.itemId, { fluxo: 'faturamento', motivo: 'estoque' }); }
      else faltam.push(it);
    });
    // o estoque abate do total (150 kg − 20 kg = 130 kg), mesmo quando não cobre um pedido inteiro
    let restante = r3(Math.max(0, row.pedidoKg - row.estoqueKg));
    if (!faltam.length) restante = 0;
    // 2) produto alternativo: só se cobrir tudo e todos aceitarem trocar a embalagem
    if (restante > 0 && row.altCode) {
      const ap = products.get(row.altCode); const aeq = equivalencia(ap);
      // estoque do alternativo que sobra depois dos pedidos do próprio alternativo
      const doAlt = (porCodigo.get(row.altCode) ?? []).reduce((s2, x) => s2 + (itemKg(x, ap) ?? 0), 0);
      row.altUn = Math.max(0, (stockUnits.get(row.altCode) ?? 0) - (aeq ? Math.ceil(doAlt / aeq) : 0));
      const altKg = aeq ? row.altUn * aeq : 0;
      if (altKg + 1e-9 >= restante && faltam.every((it) => it.allowSwap === true && it.stage === 'aberto')) {
        stockUnits.set(row.altCode, Math.max(0, row.altUn - Math.ceil(restante / aeq!))); // reserva as unidades usadas
        row.altUsado = true; restante = 0;
        faltam.forEach((it) => routes.set(it.itemId, { fluxo: 'faturamento', motivo: 'alternativo' }));
      }
    }
    if (restante <= 0) { row.situacao = 'atendido'; rows.push(row); continue; }
    faltam.forEach((it) => routes.set(it.itemId, { fluxo: 'producao', motivo: it.stage === 'em_producao' ? 'etapa' : 'producao' }));
    if (row.semiCode && !semiLivre.has(row.semiCode)) {
      const sp = products.get(row.semiCode);
      semiLivre.set(row.semiCode, Math.max(0, stockUnits.get(row.semiCode) ?? 0) * (equivalencia(sp) ?? 1));
    }
    rows.push(row); pendentes.push({ row, restante });
  }
  // 3) semiacabado: dividido pela entrega mais próxima; depois a produção mínima
  pendentes.sort((a, b) => (a.row.earliest ?? '9999').localeCompare(b.row.earliest ?? '9999'));
  for (const { row, restante } of pendentes) {
    const disp = row.semiCode ? semiLivre.get(row.semiCode) ?? 0 : 0;
    row.semiKg = r3(Math.min(disp, restante));
    if (row.semiCode) semiLivre.set(row.semiCode, r3(disp - row.semiKg));
    row.necessidadeKg = r3(restante - row.semiKg);
    const sp = row.semiCode ? products.get(row.semiCode) : undefined;
    row.minKg = sp?.min_production_kg != null ? Number(sp.min_production_kg) : null;
    row.produzirKg = row.necessidadeKg > 0 ? Math.max(row.necessidadeKg, row.minKg ?? 0) : 0;
  }
  rows.sort((a, b) => (a.earliest ?? '9999').localeCompare(b.earliest ?? '9999') || a.code.localeCompare(b.code));
  return { rows, routes };
}
