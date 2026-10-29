/**
 * Produção 3 (solicitação #21): dados das abas Fórmula, Estoque, Pedido, Produção e Relatório.
 * O cálculo fica em domain/pcp.ts; aqui só leitura e gravação.
 */
import { supabase, unwrap } from '@/lib/supabase';
import { createStockImport } from '@/api/stock';
import { mudarEtapa } from '@/api/planejamento';
import { isRevenda, type Etapa, type PlanItem, type PlanProduct } from '@/domain/planejamento';
import { vincularProduto, type EstoqueLocal, type Formula, type LinhaProducao, type AcabadoItem } from '@/domain/pcp';
import type { StockAggregate } from '@/domain/parsers/stockXlsx';

export type Modo = 'incluir' | 'substituir';
export type ProdutoPcp = PlanProduct & { is_semi?: boolean | null; unit?: string | null };

export async function listarProdutosPcp(): Promise<ProdutoPcp[]> {
  return unwrap(await supabase.from('products').select('code, description, reference, weight_g, equivalence_kg, semi_code, alt_code, min_production_kg, is_semi, unit').order('description')) as ProdutoPcp[];
}

// ---------------------------------------------------------------- Fórmula
export async function listarFormulas(): Promise<Formula[]> {
  const [fs, its] = await Promise.all([
    supabase.from('formulas').select('code, description, product_code, min_production_kg').order('description'),
    supabase.from('formula_items').select('formula_code, seq, input_code, input_description, unit, qty').order('seq').range(0, 9999),
  ]);
  const items = new Map<number, Formula['items']>();
  for (const i of unwrap(its) as Array<{ formula_code: number; input_code: string; input_description: string | null; unit: string | null; qty: number }>) {
    const l = items.get(i.formula_code) ?? []; l.push({ input_code: i.input_code, input_description: i.input_description, unit: i.unit, qty: Number(i.qty) }); items.set(i.formula_code, l);
  }
  return (unwrap(fs) as Array<Omit<Formula, 'items'>>).map((f) => ({ ...f, min_production_kg: f.min_production_kg != null ? Number(f.min_production_kg) : null, items: items.get(f.code) ?? [] }));
}

async function gravar(lista: Formula[], userId?: string | null) {
  if (!lista.length) return;
  for (let i = 0; i < lista.length; i += 200) {
    const parte = lista.slice(i, i + 200);
    unwrap(await supabase.from('formulas').upsert(parte.map((f) => ({ code: f.code, description: f.description, product_code: f.product_code, min_production_kg: f.min_production_kg, updated_at: new Date().toISOString(), updated_by: userId ?? null })), { onConflict: 'code' }));
    unwrap(await supabase.from('formula_items').delete().in('formula_code', parte.map((f) => f.code)));
    const rows = parte.flatMap((f) => f.items.map((it, k) => ({ formula_code: f.code, seq: k + 1, input_code: it.input_code, input_description: it.input_description, unit: it.unit ?? 'KG', qty: it.qty })));
    for (let j = 0; j < rows.length; j += 1000) unwrap(await supabase.from('formula_items').insert(rows.slice(j, j + 1000)));
  }
}

/** Importa as fórmulas. Mantém a ligação ao produto feita à mão; nas novas, liga pelo nome. */
export async function importarFormulas(novas: Formula[], modo: Modo, atuais: Formula[], produtos: ProdutoPcp[], userId?: string | null) {
  const ligadas = new Map(atuais.filter((f) => f.product_code).map((f) => [f.code, f.product_code]));
  const lista = novas.map((f) => ({ ...f, product_code: ligadas.get(f.code) ?? vincularProduto(f.description, produtos) }));
  if (modo === 'substituir') {
    const vieram = new Set(lista.map((f) => f.code));
    const sai = atuais.filter((f) => !vieram.has(f.code)).map((f) => f.code);
    for (let i = 0; i < sai.length; i += 200) unwrap(await supabase.from('formulas').delete().in('code', sai.slice(i, i + 200)));
  }
  await gravar(lista, userId);
  return { gravadas: lista.length, semProduto: lista.filter((f) => !f.product_code).length };
}

export async function salvarFormula(f: Formula, userId?: string | null) { await gravar([f], userId); }
export async function excluirFormula(code: number) { unwrap(await supabase.from('formulas').delete().eq('code', code)); }

// ---------------------------------------------------------------- Estoque
export interface LinhaEstoque { code: string; reference: string | null; description: string; unit: string | null; l1: number; l2: number; l5: number; total: number; erro: boolean }

export async function estoquePorLocal(produtos: ProdutoPcp[]): Promise<{ linhas: LinhaEstoque[]; mapa: Map<string, EstoqueLocal>; importadoEm: string | null }> {
  const [loc, imp] = await Promise.all([
    supabase.from('current_stock_locations').select('code, location, quantity').range(0, 19999),
    supabase.from('stock_imports').select('imported_at').eq('is_current', true).maybeSingle(),
  ]);
  const mapa = new Map<string, EstoqueLocal>();
  for (const r of unwrap(loc) as Array<{ code: string; location: number; quantity: number }>) {
    const e = mapa.get(r.code) ?? { l1: 0, l2: 0, l5: 0 };
    if (r.location === 1) e.l1 += Number(r.quantity); else if (r.location === 2) e.l2 += Number(r.quantity); else if (r.location === 5) e.l5 += Number(r.quantity);
    mapa.set(r.code, e);
  }
  const porCod = new Map(produtos.map((p) => [p.code, p]));
  const linhas: LinhaEstoque[] = [...mapa.entries()].map(([code, e]) => {
    const p = porCod.get(code);
    const unit = p?.unit ?? null;
    // unidade e pote (UN/PT) são de venda: ficam nos locais 1 e 5; no local 2 (MP e semiacabado) é erro
    const erro = Math.abs(e.l2) > 0 && !p?.is_semi && /^(UN|PT|CX)$/i.test(unit ?? '');
    return { code, reference: p?.reference ?? null, description: p?.description ?? code, unit, l1: e.l1, l2: e.l2, l5: e.l5, total: e.l1 + e.l2 + e.l5, erro };
  }).sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'));
  const importadoEm = (unwrap(imp) as { imported_at: string } | null)?.imported_at ?? null;
  return { linhas, mapa, importadoEm };
}

export interface DiffEstoque { codigo: string; descricao: string; antes: EstoqueLocal; depois: EstoqueLocal }

/** O que muda no estoque com a planilha (Incluir: só os códigos da planilha; Substituir: o resto zera). */
export function compararEstoque(atual: Map<string, EstoqueLocal>, novo: StockAggregate[], modo: Modo): { mudam: DiffEstoque[]; zerados: number } {
  const mudam: DiffEstoque[] = [];
  const vieram = new Set<string>();
  for (const a of novo) {
    vieram.add(a.code);
    const antes = atual.get(a.code) ?? { l1: 0, l2: 0, l5: 0 };
    const depois = { l1: a.byLocation[1] ?? 0, l2: a.byLocation[2] ?? 0, l5: a.byLocation[5] ?? 0 };
    if (antes.l1 !== depois.l1 || antes.l2 !== depois.l2 || antes.l5 !== depois.l5) mudam.push({ codigo: a.code, descricao: a.description, antes, depois });
  }
  const zerados = modo === 'substituir' ? [...atual.entries()].filter(([c, e]) => !vieram.has(c) && (e.l1 || e.l2 || e.l5)).length : 0;
  return { mudam, zerados };
}

/**
 * Importa o estoque (locais 1, 2 e 5). Semiacabado que ainda não está no cadastro entra como SEMIACABADO;
 * matéria-prima e código desconhecido ficam de fora (nesta etapa a produção não usa MP).
 */
export async function importarEstoque(input: { fileName: string; aggregates: StockAggregate[]; rowsTotal: number; modo: Modo; atual: Map<string, EstoqueLocal>; userId?: string | null }) {
  const codes = input.aggregates.map((a) => a.code);
  const existentes = new Set<string>();
  for (let i = 0; i < codes.length; i += 500) for (const p of unwrap(await supabase.from('products').select('code').in('code', codes.slice(i, i + 500))) as Array<{ code: string }>) existentes.add(p.code);
  const semisNovos = input.aggregates.filter((a) => !existentes.has(a.code) && /SEMI\s*-?\s*ACABADO/i.test(a.description));
  if (semisNovos.length) unwrap(await supabase.from('products').insert(semisNovos.map((s) => ({ code: s.code, description: s.description, reference: 'SEMIACABADO', is_semi: true, equivalence_kg: 1, unit: 'KG', units_per_box: 1, active: true }))));
  semisNovos.forEach((s) => existentes.add(s.code));
  let lista = input.aggregates.filter((a) => existentes.has(a.code));
  const ignorados = input.aggregates.filter((a) => !existentes.has(a.code)).map((a) => a.code);
  if (input.modo === 'incluir') {
    const vieram = new Set(lista.map((a) => a.code));
    const resto: StockAggregate[] = [...input.atual.entries()].filter(([c]) => !vieram.has(c)).map(([code, e]) => ({ code, description: code, reference: null, byLocation: { 1: e.l1, 2: e.l2, 5: e.l5 }, total: e.l1 + e.l2 + e.l5 }));
    lista = [...lista, ...resto];
  }
  const r = await createStockImport({ fileName: input.fileName, locations: [1, 2, 5], aggregates: lista, rowsTotal: input.rowsTotal, createMissing: false, userId: input.userId });
  return { ...r, semisCriados: semisNovos.length, ignorados };
}

// ---------------------------------------------------------------- Pedido
export type ItemPcp = PlanItem & { pcpStatus: 'aberto' | 'firmado' };

/** Itens fabricados (sem revenda) de pedidos em aberto que ainda não foram para o faturamento. */
export async function listarItensPcp(): Promise<ItemPcp[]> {
  const rows = unwrap(await supabase.from('order_items')
    .select('id, product_code, product_name, product_reference, sale_unit, quantity, quantity_units, weight_kg, unit_price, total_price, stage, pcp_status, order:orders!inner(id, order_number, customer_name, delivery_date, created_at, allow_other_packaging, status, customer:customers(name))')
    .in('stage', ['aberto', 'em_producao']).not('order.status', 'in', '(cancelado,entregue)').not('product_code', 'is', null).range(0, 9999)) as unknown as Array<{
      id: string; product_code: string; product_name: string | null; product_reference: string | null; sale_unit: 'kg' | 'un' | null; quantity: number | null; quantity_units: number | null; weight_kg: number | null;
      unit_price: number | null; total_price: number | null; stage: Etapa; pcp_status: 'aberto' | 'firmado';
      order: { id: string; order_number: string | null; customer_name: string | null; delivery_date: string | null; created_at: string; allow_other_packaging: boolean | null; status: string; customer: { name: string } | null };
    }>;
  return rows.filter((r) => !isRevenda(r.product_reference)).map((r) => ({
    itemId: r.id, orderId: r.order.id, orderNumber: r.order.order_number, customer: r.order.customer?.name ?? r.order.customer_name, productCode: r.product_code, productName: r.product_name,
    reference: r.product_reference, saleUnit: r.sale_unit, quantity: r.quantity, quantityUnits: r.quantity_units, weightKg: r.weight_kg, deliveryDate: r.order.delivery_date, createdAt: r.order.created_at,
    allowSwap: r.order.allow_other_packaging, stage: r.stage, unitPrice: r.unit_price, totalPrice: r.total_price, pcpStatus: r.pcp_status ?? 'aberto',
  }));
}

export async function mudarPcp(ids: string[], status: 'aberto' | 'firmado') {
  const n = unwrap(await supabase.rpc('set_item_pcp', { p_item_ids: ids, p_status: status })) as number;
  if (!n) throw new Error('Nenhum item foi alterado.');
}

// ---------------------------------------------------------------- Produção
export interface OrdemProducao { id: string; numero: number; formula_code: number | null; product_code: string | null; description: string | null; quantity_kg: number; need_kg: number | null; due_date: string | null; item_ids: string[]; status: 'em_producao' | 'concluida'; created_by_name: string | null; created_at: string; done_at: string | null }

export async function listarOPs(): Promise<OrdemProducao[]> {
  return unwrap(await supabase.from('production_orders').select('*').order('created_at', { ascending: false }).limit(300)) as OrdemProducao[];
}

/** Botão Em produção: abre a ordem de produção e passa os itens dos pedidos para Em produção. */
export async function colocarEmProducao(l: LinhaProducao, itens: ItemPcp[], quem: { id?: string | null; nome?: string | null }) {
  unwrap(await supabase.from('production_orders').insert({ formula_code: l.formulaCode, product_code: l.code, description: l.description, quantity_kg: l.produzirKg, need_kg: -l.necessidadeKg, due_date: l.earliest, item_ids: l.itemIds, created_by: quem.id ?? null, created_by_name: quem.nome ?? null }));
  const abertos = itens.filter((i) => l.itemIds.includes(i.itemId) && i.stage === 'aberto').map((i) => i.itemId);
  if (abertos.length) await mudarEtapa(abertos, 'em_producao');
}

export async function concluirOP(id: string) {
  unwrap(await supabase.from('production_orders').update({ status: 'concluida', done_at: new Date().toISOString() }).eq('id', id));
}

/** Botão Pronto: Faturamento: o estoque atende; os itens vão para o Faturamento (Rotas de entrega) e ficam no Relatório. */
export async function prontoFaturamento(acabados: AcabadoItem[], ops: OrdemProducao[], quem: { id?: string | null; nome?: string | null }) {
  const ok = acabados.filter((a) => a.atendido);
  if (!ok.length) throw new Error('O estoque ainda não atende este pedido.');
  await mudarEtapa(ok.map((a) => a.item.itemId), 'faturado');
  unwrap(await supabase.from('production_reports').insert(ok.map((a) => {
    const daOp = ops.filter((o) => o.item_ids.includes(a.item.itemId));
    return {
      order_id: a.item.orderId, order_number: a.item.orderNumber, customer_name: a.item.customer, item_ids: [a.item.itemId], product_code: a.item.productCode, product_name: a.item.productName,
      quantity_kg: a.kg, delivery_date: a.item.deliveryDate, created_by: quem.id ?? null, created_by_name: quem.nome ?? null,
      details: { ops: daOp.map((o) => ({ numero: o.numero, formula: o.formula_code, descricao: o.description, kg: Number(o.quantity_kg), status: o.status, inicio: o.created_at, fim: o.done_at })) },
    };
  })));
}

// ---------------------------------------------------------------- Relatório
export interface LinhaRelatorio { id: string; order_number: string | null; customer_name: string | null; product_code: string | null; product_name: string | null; quantity_kg: number | null; delivery_date: string | null; created_by_name: string | null; created_at: string; details: { ops?: Array<{ numero: number; formula: number | null; descricao: string | null; kg: number; status: string; inicio: string; fim: string | null }> } }

export async function listarRelatorio(): Promise<LinhaRelatorio[]> {
  return unwrap(await supabase.from('production_reports').select('*').order('created_at', { ascending: false }).limit(500)) as LinhaRelatorio[];
}
