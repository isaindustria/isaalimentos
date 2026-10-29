/**
 * Produção 3 (solicitação #21): Fórmula, Estoque, Pedido, Produção e Relatório.
 *
 * Cálculo da aba Produção (sem matéria-prima, só acabados e semiacabados; nada baixa estoque):
 * 1. Pedidos firmados, por produto, pela entrega mais próxima. O estoque do próprio acabado (locais 1 e 5,
 *    unidades × equivalência em kg) atende primeiro; o mesmo saldo não é usado duas vezes. Item atendido por
 *    inteiro fica liberado para o faturamento; do resto, só o que falta vai para a produção.
 * 2. O que falta do acabado vira semiacabado pela fórmula do acabado (kg de semiacabado por unidade) ou,
 *    sem fórmula, pelo semiacabado do cadastro (1 kg = 1 kg).
 * 3. Cada semiacabado soma o que vem dos acabados e de outros semiacabados (fórmula dentro de fórmula),
 *    desconta o próprio estoque (local 2) e, se faltar, produz o maior entre a falta e a produção mínima
 *    (sem mínimo informado, produz a falta). O que for produzido pede os semiacabados da fórmula dele.
 * 4. Necessidades em datas diferentes somam e ficam na data mais próxima.
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
// Cálculo da aba Produção
// ---------------------------------------------------------------------------
export interface EstoqueLocal { l1: number; l2: number; l5: number }

export interface AcabadoItem {
  item: PlanItem; kg: number; atendidoKg: number; faltaKg: number; atendido: boolean;
}
export interface LinhaProducao {
  /** produto semiacabado (código do produto) */
  code: string; formulaCode: number | null; description: string; earliest: string | null;
  pedidoKg: number; estoqueKg: number; necessidadeKg: number; minKg: number | null; produzirKg: number;
  itemIds: string[];
}

export function planejarProducao(
  firmados: PlanItem[],
  produtos: Map<string, PlanProduct & { is_semi?: boolean | null }>,
  formulas: Formula[],
  estoque: Map<string, EstoqueLocal>,
): { acabados: AcabadoItem[]; producao: LinhaProducao[]; semFormula: string[] } {
  const porProduto = new Map<string, Formula>();
  for (const f of formulas) if (f.product_code && !porProduto.has(f.product_code)) porProduto.set(f.product_code, f);
  const ehSemi = (code: string) => !!produtos.get(code)?.is_semi || (porProduto.has(code) && ehSemiNome(porProduto.get(code)!.description));

  // 1) acabados: estoque do próprio produto pela entrega mais próxima
  const byDate = (a: PlanItem, b: PlanItem) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999') || String(a.orderNumber ?? '').localeCompare(String(b.orderNumber ?? ''), undefined, { numeric: true });
  const livre = new Map<string, number>();
  const acabados: AcabadoItem[] = [];
  for (const it of [...firmados].sort(byDate)) {
    const p = produtos.get(it.productCode);
    const kg = itemKg(it, p) ?? 0;
    if (!livre.has(it.productCode)) { const e = estoque.get(it.productCode); const eq = equivalencia(p) ?? 1; livre.set(it.productCode, r3(((e?.l1 ?? 0) + (e?.l5 ?? 0)) * eq)); }
    const disp = livre.get(it.productCode)!;
    const usa = Math.min(disp, kg);
    livre.set(it.productCode, r3(disp - usa));
    acabados.push({ item: it, kg, atendidoKg: r3(usa), faltaKg: r3(kg - usa), atendido: kg - usa <= 1e-9 });
  }

  // 2) falta dos acabados → semiacabados
  type Dem = { kg: number; earliest: string | null; itemIds: Set<string> };
  const dem = new Map<string, Dem>();
  const filhos = new Map<string, Array<{ code: string; qty: number }>>(); // semi → semis da fórmula (por kg)
  const add = (code: string, kg: number, date: string | null, ids: Iterable<string>) => {
    if (kg <= 0) return;
    const d = dem.get(code) ?? { kg: 0, earliest: null, itemIds: new Set<string>() };
    d.kg = r3(d.kg + kg);
    if (date && (!d.earliest || date < d.earliest)) d.earliest = date;
    for (const i of ids) d.itemIds.add(i);
    dem.set(code, d);
  };
  const semFormula = new Set<string>();
  for (const a of acabados) {
    if (a.faltaKg <= 0) continue;
    const code = a.item.productCode; const p = produtos.get(code);
    const f = porProduto.get(code);
    const semisDaFormula = f?.items.filter((i) => ehSemi(i.input_code)) ?? [];
    if (f && semisDaFormula.length) {
      const eq = equivalencia(p) ?? 1;
      const un = a.faltaKg / eq; // unidades que faltam (fórmula do acabado é por unidade)
      for (const i of semisDaFormula) add(i.input_code, r3(un * i.qty), a.item.deliveryDate, [a.item.itemId]);
    } else if (p?.semi_code) {
      add(p.semi_code, a.faltaKg, a.item.deliveryDate, [a.item.itemId]);
    } else semFormula.add(code);
  }

  // 3) semiacabados em ordem (pai antes do filho), descontando o estoque do local 2
  for (const f of formulas) if (f.product_code) filhos.set(f.product_code, f.items.filter((i) => ehSemi(i.input_code)).map((i) => ({ code: i.input_code, qty: i.qty })));
  const nivel = new Map<string, number>();
  const visit = (code: string, d: number, path: Set<string>) => {
    if (path.has(code)) return; // ciclo na fórmula: ignora a volta
    if ((nivel.get(code) ?? -1) >= d) return;
    nivel.set(code, d);
    path.add(code);
    for (const c of filhos.get(code) ?? []) visit(c.code, d + 1, path);
    path.delete(code);
  };
  for (const code of dem.keys()) visit(code, 0, new Set());
  const ordem = [...nivel.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
  const producao: LinhaProducao[] = [];
  for (const code of ordem) {
    const d = dem.get(code); if (!d || d.kg <= 0) continue;
    const e = estoque.get(code);
    const estoqueKg = r3((e?.l2 ?? 0) + (ehSemi(code) ? 0 : ((e?.l1 ?? 0) + (e?.l5 ?? 0)) * (equivalencia(produtos.get(code)) ?? 1)));
    const necessidade = r3(estoqueKg - d.kg);
    const f = porProduto.get(code); const p = produtos.get(code);
    const minKg = f?.min_production_kg ?? (p?.min_production_kg != null ? Number(p.min_production_kg) : null);
    const falta = necessidade < 0 ? -necessidade : 0;
    const produzir = falta > 0 ? r3(Math.max(falta, minKg ?? 0)) : 0;
    producao.push({ code, formulaCode: f?.code ?? null, description: f?.description ?? p?.description ?? code, earliest: d.earliest, pedidoKg: d.kg, estoqueKg, necessidadeKg: necessidade, minKg, produzirKg: produzir, itemIds: [...d.itemIds] });
    if (produzir > 0) for (const c of filhos.get(code) ?? []) add(c.code, r3(produzir * c.qty), d.earliest, d.itemIds);
  }
  // semis que entraram por filhos depois de calculados (ciclo raro) já ficaram de fora; ordena pela data
  producao.sort((a, b) => (a.earliest ?? '9999').localeCompare(b.earliest ?? '9999') || a.description.localeCompare(b.description));
  return { acabados, producao, semFormula: [...semFormula] };
}
