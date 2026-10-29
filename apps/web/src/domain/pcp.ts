/**
 * Produção 3 (solicitação #21): Fórmula, Estoque, Pedido, Produção e Relatório.
 *
 * Produção 4 e 5 (solicitações #22 e #23). Nesta fase só a fórmula do SEMIACABADO (insumos → semiacabado);
 * a fórmula do acabado (fracionamento e envase) fica para depois. Sem matéria-prima; nada baixa estoque.
 * 1. Estoque do acabado (locais 1 e 5, em unidades) atende os itens pela entrega mais próxima, sem usar o mesmo
 *    saldo duas vezes. Só a falta segue; ela vira kg (unidades × kg da apresentação cadastrada).
 * 2. Acabado → semiacabado pelo cadastro do produto (ou pelo semiacabado da fórmula do acabado): kg = kg.
 * 3. Cada semiacabado soma os pedidos firmados e o que outros semiacabados pedem e desconta o estoque do
 *    semiacabado (local 2): necessidade líquida. Falta menor que o lote mínimo produz o lote mínimo; igual ou
 *    maior produz a falta (não arredonda para múltiplos). Os semiacabados da fórmula saem da quantidade programada.
 * 4. Datas diferentes somam na mais próxima; os pedidos de origem continuam ligados à linha.
 */
import { equivalencia, itemKg, type PlanItem, type PlanProduct } from './planejamento';

export interface FormulaItem { input_code: string; input_description: string | null; unit: string | null; qty: number }
export interface Formula { code: number; description: string; product_code: string | null; min_production_kg: number | null; items: FormulaItem[] }

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

// ---------------------------------------------------------------------------
// Ligação fórmula → produto pelo nome (o código da fórmula não é o código do produto)
// ---------------------------------------------------------------------------
const STOP = new Set(['MP', 'SEMI', 'ACABADO', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'COM', 'C', 'ST', 'A', 'O', 'EM', 'PARA',
  'AZUL', 'CLARO', 'ROYAL', 'VERDE', 'AMARELO', 'TRANSLUCIDO', 'ROXO', 'VERMELHO', 'LARANJA', 'BRANCO', 'ROSA']);

/** Palavras do nome sem acento, sem "MP / SEMI ACABADO", sem a caixa (CX 48) e com o peso junto (10 KG → 10KG). */
export function chaveNome(desc: string): Set<string> {
  let s = desc.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  s = s.replace(/\bCX\s*\d+/g, ' ').replace(/(\d+(?:[.,]\d+)?)\s*(KG|GR|G|ML|L)\b/g, (_m, n: string, u: string) => `${n.replace(',', '.')}${u === 'GR' ? 'G' : u}`);
  const t = new Set(s.split(/[^A-Z0-9.]+/).filter((w) => w && !STOP.has(w)));
  if (!t.has('ISA') && !t.has('ANDER')) t.add('ISA');
  return t;
}
const ehSemiNome = (desc: string) => /SEMI\s*-?\s*ACABADO/i.test(desc.normalize('NFD').replace(/[̀-ͯ]/g, ''));

/** Produto que a fórmula fabrica: nome igual (ou quase) entre os produtos do mesmo tipo (acabado × semiacabado). */
export function vincularProduto(descFormula: string, produtos: Array<{ code: string; description: string; is_semi?: boolean | null }>): string | null {
  const k = chaveNome(descFormula);
  const semi = ehSemiNome(descFormula);
  const pool = produtos.filter((p) => !!p.is_semi === semi || ehSemiNome(p.description) === semi);
  const iguais = pool.filter((p) => { const pk = chaveNome(p.description); return pk.size === k.size && [...k].every((w) => pk.has(w)); });
  if (iguais.length === 1) return iguais[0].code;
  if (iguais.length > 1) return null;
  let best: { code: string; s: number } | null = null; let empate = false;
  for (const p of pool) {
    const pk = chaveNome(p.description);
    const inter = [...k].filter((w) => pk.has(w)).length;
    const s = inter / (k.size + pk.size - inter);
    if (!best || s > best.s) { best = { code: p.code, s }; empate = false; } else if (s === best.s) empate = true;
  }
  return best && best.s >= 0.75 && !empate ? best.code : null;
}

// ---------------------------------------------------------------------------
// Importação da planilha de fórmulas
// ---------------------------------------------------------------------------
const normH = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim(); if (!s) return NaN;
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
};

/** Linhas da planilha (matriz) → fórmulas. Colunas: Cód Fórmula, Descrição da Fórmula, Cód do Insumo, Descrição do Insumo, Cód Unidade, Qtd Unitária Prevista, Produção mínima. */
export function lerFormulas(matrix: unknown[][]): { formulas: Formula[]; ignoradas: number } {
  const hi = matrix.findIndex((r) => (r ?? []).some((c) => normH(c).startsWith('cod formula')));
  if (hi < 0) throw new Error('Não achei a coluna "Cód Fórmula" na planilha.');
  const h = (matrix[hi] ?? []).map(normH);
  const col = (...names: string[]) => { for (const n of names) { const i = h.findIndex((c) => c.startsWith(n)); if (i >= 0) return i; } return -1; };
  const c = { code: col('cod formula'), desc: col('descricao da formula'), in: col('cod do insumo', 'cod insumo'), inDesc: col('descricao do insumo'), un: col('cod unidade', 'unidade'), qty: col('qtd unitaria', 'quantidade'), min: col('producao minima', 'produc minima', 'prod minima', 'minima') };
  if (c.in < 0 || c.qty < 0) throw new Error('Faltam as colunas "Cód do Insumo" ou "Qtd Unitária Prevista".');
  const m = new Map<number, Formula>(); let ignoradas = 0;
  for (const r of matrix.slice(hi + 1)) {
    const code = num(r?.[c.code]);
    const inp = String(r?.[c.in] ?? '').replace(/\.0+$/, '').trim();
    const qty = num(r?.[c.qty]);
    if (!Number.isFinite(code) || !inp || !Number.isFinite(qty)) { if (r?.some((x) => x != null && x !== '')) ignoradas++; continue; }
    const f = m.get(code) ?? { code, description: String(r?.[c.desc] ?? '').replace(/\s+/g, ' ').trim() || `FÓRMULA ${code}`, product_code: null, min_production_kg: null, items: [] };
    const min = c.min >= 0 ? num(r?.[c.min]) : NaN;
    if (Number.isFinite(min) && min > 0) f.min_production_kg = Math.max(f.min_production_kg ?? 0, min);
    f.items.push({ input_code: inp, input_description: r?.[c.inDesc] != null ? String(r[c.inDesc]).replace(/\s+/g, ' ').trim() : null, unit: r?.[c.un] != null ? String(r[c.un]).trim() : 'KG', qty });
    m.set(code, f);
  }
  return { formulas: [...m.values()], ignoradas };
}

export interface DiffFormulas { novas: Formula[]; alteradas: Array<{ antes: Formula; depois: Formula; mudancas: string[] }>; iguais: number; removidas: Formula[] }

/** O que muda ao importar (Incluir mantém as que não vieram; Substituir remove). */
export function compararFormulas(atuais: Formula[], novas: Formula[], modo: 'incluir' | 'substituir'): DiffFormulas {
  const porCod = new Map(atuais.map((f) => [f.code, f]));
  const out: DiffFormulas = { novas: [], alteradas: [], iguais: 0, removidas: [] };
  for (const f of novas) {
    const a = porCod.get(f.code);
    if (!a) { out.novas.push(f); continue; }
    const mud: string[] = [];
    if (a.description !== f.description) mud.push(`nome: ${a.description} → ${f.description}`);
    if ((a.min_production_kg ?? null) !== (f.min_production_kg ?? null)) mud.push(`produção mínima: ${a.min_production_kg ?? '—'} → ${f.min_production_kg ?? '—'}`);
    const ai = new Map(a.items.map((i) => [i.input_code, i.qty]));
    const fi = new Map(f.items.map((i) => [i.input_code, i.qty]));
    for (const [k, q] of fi) { if (!ai.has(k)) mud.push(`+ insumo ${k} (${q})`); else if (Number(ai.get(k)) !== q) mud.push(`insumo ${k}: ${ai.get(k)} → ${q}`); }
    for (const k of ai.keys()) if (!fi.has(k)) mud.push(`− insumo ${k}`);
    if (mud.length) out.alteradas.push({ antes: a, depois: f, mudancas: mud }); else out.iguais++;
  }
  if (modo === 'substituir') { const vieram = new Set(novas.map((f) => f.code)); out.removidas = atuais.filter((f) => !vieram.has(f.code)); }
  return out;
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------
export interface EstoqueLocal { l1: number; l2: number; l5: number }

export interface AcabadoItem {
  item: PlanItem;
  /** kg de uma unidade da apresentação cadastrada */
  kgUn: number | null;
  pedidoUn: number; pedidoKg: number;
  /** unidades do estoque acabado que atendem este item */
  estoqueUn: number;
  faltaUn: number; faltaKg: number;
  atendido: boolean;
}

/** Quantidade do item em unidades (o kg vendido vira unidades pela apresentação). */
export function unidadesDoItem(it: PlanItem, p: PlanProduct | undefined): number {
  const eq = equivalencia(p);
  if (it.saleUnit === 'un') return Number(it.quantity ?? 0);
  if (it.saleUnit === 'kg') return eq ? Number(it.quantity ?? 0) / eq : Number(it.quantity ?? 0);
  return Number(it.quantityUnits ?? 0);
}

/** Estoque acabado (locais 1 e 5) pelos itens, na ordem da entrega e do número do pedido; o mesmo saldo não é usado duas vezes. */
export function alocarAcabados(itens: PlanItem[], produtos: Map<string, PlanProduct>, estoque: Map<string, EstoqueLocal>): Map<string, AcabadoItem> {
  const livre = new Map<string, number>();
  const out = new Map<string, AcabadoItem>();
  const ord = [...itens].sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') || String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), undefined, { numeric: true }) || a.itemId.localeCompare(b.itemId));
  for (const it of ord) {
    const p = produtos.get(it.productCode);
    const eq = equivalencia(p);
    const un = r3(unidadesDoItem(it, p));
    if (!livre.has(it.productCode)) { const e = estoque.get(it.productCode); livre.set(it.productCode, Math.max(0, (e?.l1 ?? 0) + (e?.l5 ?? 0))); }
    const disp = livre.get(it.productCode)!;
    const usa = Math.min(disp, un);
    livre.set(it.productCode, r3(disp - usa));
    const faltaUn = r3(un - usa);
    const kg = itemKg(it, p) ?? 0;
    out.set(it.itemId, { item: it, kgUn: eq, pedidoUn: un, pedidoKg: kg, estoqueUn: r3(usa), faltaUn, faltaKg: r3(eq ? faltaUn * eq : (un ? (kg * faltaUn) / un : 0)), atendido: faltaUn <= 1e-9 });
  }
  return out;
}

export interface OrigemProducao { itemId: string; orderNumber: string | null; customer: string | null; productCode: string; productName: string | null; pedidoUn: number; estoqueUn: number; faltaUn: number; faltaKg: number; deliveryDate: string | null }
export interface LinhaProducao {
  /** semiacabado (código do produto) */
  code: string; formulaCode: number | null; description: string; earliest: string | null;
  /** kg pedidos (falta dos acabados + o que outros semiacabados pedem) e a parte que vem de outros semiacabados */
  pedidoKg: number; deOutrosKg: number;
  estoqueKg: number; necessidadeKg: number; minKg: number | null; produzirKg: number;
  /** o semiacabado em estoque cobre: falta só fracionar/envasar o acabado */
  soFracionar: boolean;
  itemIds: string[]; origens: OrigemProducao[]; usadoEm: Array<{ code: string; kg: number }>;
}

/** Semiacabado do acabado: cadastro do produto ou o semiacabado da fórmula do acabado. */
export function semiDoAcabado(code: string, produtos: Map<string, PlanProduct & { is_semi?: boolean | null }>, formulas: Formula[]): string | null {
  const p = produtos.get(code);
  if (p?.semi_code) return p.semi_code;
  const f = formulas.find((x) => x.product_code === code);
  const s = f?.items.find((i) => produtos.get(i.input_code)?.is_semi || ehSemiNome(i.input_description ?? ''));
  return s?.input_code ?? null;
}

export function planejarProducao(
  acabados: AcabadoItem[],
  produtos: Map<string, PlanProduct & { is_semi?: boolean | null }>,
  formulas: Formula[],
  estoque: Map<string, EstoqueLocal>,
): { producao: LinhaProducao[]; semSemi: string[] } {
  // só a fórmula do semiacabado (a do acabado é fracionamento, fase posterior)
  const formulaDoSemi = new Map<string, Formula>();
  for (const f of formulas) if (f.product_code && (produtos.get(f.product_code)?.is_semi || ehSemiNome(f.description)) && !formulaDoSemi.has(f.product_code)) formulaDoSemi.set(f.product_code, f);
  const ehSemi = (code: string) => !!produtos.get(code)?.is_semi || formulaDoSemi.has(code);
  const filhos = (code: string) => (formulaDoSemi.get(code)?.items ?? []).filter((i) => ehSemi(i.input_code)).map((i) => ({ code: i.input_code, qty: i.qty }));

  type Dem = { kg: number; deOutros: number; earliest: string | null; itemIds: Set<string>; origens: OrigemProducao[]; usadoEm: Map<string, number> };
  const dem = new Map<string, Dem>();
  const get = (code: string) => { let d = dem.get(code); if (!d) { d = { kg: 0, deOutros: 0, earliest: null, itemIds: new Set(), origens: [], usadoEm: new Map() }; dem.set(code, d); } return d; };
  const data = (d: Dem, date: string | null) => { if (date && (!d.earliest || date < d.earliest)) d.earliest = date; };
  const semSemi = new Set<string>();
  for (const a of acabados) {
    if (a.faltaKg <= 0) continue;
    const semi = semiDoAcabado(a.item.productCode, produtos, formulas);
    if (!semi) { semSemi.add(a.item.productCode); continue; }
    const d = get(semi);
    d.kg = r3(d.kg + a.faltaKg); data(d, a.item.deliveryDate); d.itemIds.add(a.item.itemId);
    d.origens.push({ itemId: a.item.itemId, orderNumber: a.item.orderNumber, customer: a.item.customer, productCode: a.item.productCode, productName: a.item.productName, pedidoUn: a.pedidoUn, estoqueUn: a.estoqueUn, faltaUn: a.faltaUn, faltaKg: a.faltaKg, deliveryDate: a.item.deliveryDate });
  }

  // pai antes do filho (fórmula dentro de fórmula, vários níveis)
  const nivel = new Map<string, number>();
  const visit = (code: string, n: number, path: Set<string>) => {
    if (path.has(code) || (nivel.get(code) ?? -1) >= n) return;
    nivel.set(code, n); path.add(code);
    for (const c of filhos(code)) visit(c.code, n + 1, path);
    path.delete(code);
  };
  for (const code of [...dem.keys()]) visit(code, 0, new Set());
  const ordem = [...nivel.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);

  const producao: LinhaProducao[] = [];
  for (const code of ordem) {
    const d = dem.get(code); if (!d || d.kg <= 0) continue;
    const estoqueKg = r3(Math.max(0, estoque.get(code)?.l2 ?? 0));
    const necessidade = r3(estoqueKg - d.kg);
    const f = formulaDoSemi.get(code); const p = produtos.get(code);
    const minKg = f?.min_production_kg ?? (p?.min_production_kg != null && Number(p.min_production_kg) > 0 ? Number(p.min_production_kg) : null);
    const falta = necessidade < 0 ? -necessidade : 0;
    const produzir = falta > 0 ? r3(Math.max(falta, minKg ?? 0)) : 0;
    producao.push({
      code, formulaCode: f?.code ?? null, description: f?.description ?? p?.description ?? code, earliest: d.earliest,
      pedidoKg: d.kg, deOutrosKg: d.deOutros, estoqueKg, necessidadeKg: necessidade, minKg, produzirKg: produzir,
      soFracionar: falta === 0 && d.origens.length > 0, itemIds: [...d.itemIds], origens: d.origens,
      usadoEm: [...d.usadoEm.entries()].map(([c, kg]) => ({ code: c, kg })),
    });
    if (produzir > 0) for (const c of filhos(code)) {
      const kg = r3(produzir * c.qty);
      if (kg <= 0) continue;
      const dc = get(c.code);
      dc.kg = r3(dc.kg + kg); dc.deOutros = r3(dc.deOutros + kg); data(dc, d.earliest);
      d.itemIds.forEach((i) => dc.itemIds.add(i));
      dc.usadoEm.set(code, r3((dc.usadoEm.get(code) ?? 0) + kg));
    }
  }
  producao.sort((a, b) => (a.earliest ?? '9999').localeCompare(b.earliest ?? '9999') || a.description.localeCompare(b.description));
  return { producao, semSemi: [...semSemi] };
}

/** Pedido completo: todos os itens que ainda não foram para o faturamento estão atendidos pelo estoque acabado (ou são revenda). */
export function pedidoCompleto(itensDoPedido: Array<{ itemId: string; revenda: boolean; faturado: boolean }>, aloc: Map<string, AcabadoItem>): boolean {
  const pend = itensDoPedido.filter((i) => !i.faturado);
  return pend.length > 0 && pend.every((i) => i.revenda || aloc.get(i.itemId)?.atendido === true);
}
