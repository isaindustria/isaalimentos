import { supabase, unwrap } from '@/lib/supabase';
import { getCurrentStock } from '@/api/stock';
import { itemKg, planejar, type Etapa, type PlanItem, type PlanProduct } from '@/domain/planejamento';
import { normalizeHeader, pick, toNumber } from '@/domain/parsers/sheet';

export interface PedidoNoFluxo {
  orderId: string; orderNumber: string | null; customer: string | null; deliveryDate: string | null; orderStatus: string;
  customerCode: string | null; cnpj: string | null; seller: string | null;
  /** itens deste fluxo */
  itens: Array<PlanItem & { motivo: string }>;
  /** todos os itens do pedido, com o fluxo de cada um (o faturamento vê o pedido inteiro) */
  todos: Array<PlanItem & { motivo: string; fluxo: 'producao' | 'faturamento' }>;
}

/** Pedidos em aberto (não cancelados, não entregues) com os itens, o cadastro e o estoque, já roteados. */
export async function carregarPlanejamento() {
  const [orders, products, stock] = await Promise.all([
    supabase.from('orders').select('id, order_number, customer_name, customer_cnpj, seller_name, delivery_date, created_at, allow_other_packaging, status, customer:customers(name, code, cnpj), items:order_items(id, product_code, product_name, product_reference, sale_unit, quantity, quantity_units, weight_kg, stage)')
      .not('status', 'in', '(cancelado,entregue)').order('delivery_date', { ascending: true, nullsFirst: false }),
    supabase.from('products').select('code, description, reference, weight_g, equivalence_kg, semi_code, alt_code, min_production_kg, is_semi'),
    getCurrentStock(),
  ]);
  const ords = unwrap(orders) as unknown as Array<{ id: string; order_number: string | null; customer_name: string | null; delivery_date: string | null; created_at: string; allow_other_packaging: boolean | null; status: string; customer_cnpj: string | null; seller_name: string | null; customer: { name: string; code: string | null; cnpj: string | null } | null;
    items: Array<{ id: string; product_code: string | null; product_name: string | null; product_reference: string | null; sale_unit: 'kg' | 'un' | null; quantity: number | null; quantity_units: number | null; weight_kg: number | null; stage: Etapa }> }>;
  const prods = new Map((unwrap(products) as PlanProduct[]).map((p) => [p.code, p]));
  const est = new Map(stock.map((s) => [s.code, Number(s.location_1 ?? 0) + Number(s.location_5 ?? 0)]));
  const items: PlanItem[] = [];
  for (const o of ords) for (const it of o.items) {
    if (!it.product_code || it.stage === 'entregue') continue;
    items.push({
      itemId: it.id, orderId: o.id, orderNumber: o.order_number, customer: o.customer?.name ?? o.customer_name, productCode: it.product_code, productName: it.product_name,
      reference: it.product_reference, saleUnit: it.sale_unit, quantity: it.quantity, quantityUnits: it.quantity_units, weightKg: it.weight_kg,
      deliveryDate: o.delivery_date, createdAt: o.created_at, allowSwap: o.allow_other_packaging, stage: it.stage,
    });
  }
  const plan = planejar(items, prods, est);
  const porFluxo = (fluxo: 'producao' | 'faturamento'): PedidoNoFluxo[] => {
    const m = new Map<string, PedidoNoFluxo>();
    for (const it of items) {
      const r = plan.routes.get(it.itemId); if (r?.fluxo !== fluxo) continue;
      const o = ords.find((x) => x.id === it.orderId)!;
      const cur = m.get(o.id) ?? {
        orderId: o.id, orderNumber: o.order_number, customer: it.customer, deliveryDate: o.delivery_date, orderStatus: o.status,
        customerCode: o.customer?.code ?? null, cnpj: o.customer?.cnpj ?? o.customer_cnpj, seller: o.seller_name, itens: [],
        todos: items.filter((x) => x.orderId === o.id).map((x) => { const rr = plan.routes.get(x.itemId); return { ...x, motivo: rr?.motivo ?? 'producao', fluxo: rr?.fluxo ?? 'producao' }; }),
      };
      cur.itens.push({ ...it, motivo: r.motivo }); m.set(o.id, cur);
    }
    return [...m.values()].sort((a, b) => (a.deliveryDate ?? '9999').localeCompare(b.deliveryDate ?? '9999'));
  };
  return { rows: plan.rows, producao: porFluxo('producao'), faturamento: porFluxo('faturamento'), products: prods };
}

/** Muda a etapa dos itens (o banco confere a permissão: PCP só até Faturamento; faturamento até Entregue). */
export async function mudarEtapa(itemIds: string[], etapa: Etapa) {
  const n = unwrap(await supabase.rpc('set_item_stage', { p_item_ids: itemIds, p_stage: etapa })) as number;
  if (!n) throw new Error('Nenhum item foi alterado.');
}

/**
 * Cadastro da produção (planilha da aba Produção): Código, Referência, Descrição, Und venda, Equivalência,
 * Código semiacabado, Descrição (do semiacabado), Estoque alternativo (código do produto alternativo), Quantidade mínima a produzir.
 * Produtos de venda recebem equivalência, semiacabado e alternativo; semiacabados novos entram com referência SEMIACABADO.
 * Incluir: só preenche e acrescenta. Substituir: antes limpa os campos de produção de todos os produtos (nada é apagado).
 */
export async function importarCadastroProducao(rows: Record<string, string>[], modo: 'incluir' | 'substituir') {
  const existentes = new Map((unwrap(await supabase.from('products').select('code, description, reference')) as Array<{ code: string; description: string; reference: string | null }>).map((p) => [p.code, p]));
  if (modo === 'substituir') unwrap(await supabase.from('products').update({ equivalence_kg: null, semi_code: null, alt_code: null, min_production_kg: null }).neq('code', ''));
  const semis = new Map<string, { description: string; min: number | null }>();
  let atualizados = 0, criados = 0; const ignorados: string[] = [];
  for (const r of rows) {
    const code = pick(r, ['codigo', 'cod', 'código']).replace(/\.0+$/, '').trim();
    if (!code) continue;
    const desc = pick(r, ['descricao do produto', 'descricao', 'produto']).trim();
    const eq = toNumber(pick(r, ['equivalencia', 'equivalência']), NaN);
    const semi = pick(r, ['codigo semiacabado', 'codigo semi', 'cod semi']).replace(/\.0+$/, '').trim();
    // a planilha tem duas descrições: "Descrição do Produto" (coluna C) e "descrição" (do semiacabado, coluna G)
    const semiDesc = ('descricao do produto' in r ? r[normalizeHeader('descricao')] ?? '' : '').trim();
    const alt = pick(r, ['estoque alternativo', 'produto alternativo', 'alternativo']).replace(/\.0+$/, '').trim();
    const min = toNumber(pick(r, ['quantidade minima a produzir', 'quantidade minima', 'producao minima', 'minimo']), NaN);
    const ehSemi = /semi\s*-?\s*acabado/i.test(desc) || (!semi && Number.isFinite(min));
    if (ehSemi) { semis.set(code, { description: desc || code, min: Number.isFinite(min) ? min : null }); continue; }
    if (!existentes.has(code)) { ignorados.push(code); continue; }
    const patch: Record<string, unknown> = {};
    if (Number.isFinite(eq) && eq > 0) patch.equivalence_kg = eq;
    if (semi) { patch.semi_code = semi; if (!semis.has(semi)) semis.set(semi, { description: semiDesc || `SEMIACABADO ${semi}`, min: null }); }
    if (alt) patch.alt_code = alt;
    if (Object.keys(patch).length) { unwrap(await supabase.from('products').update(patch).eq('code', code)); atualizados++; }
  }
  for (const [code, s] of semis) {
    if (existentes.has(code)) {
      unwrap(await supabase.from('products').update({ is_semi: true, ...(s.min != null ? { min_production_kg: s.min } : {}) }).eq('code', code));
    } else {
      unwrap(await supabase.from('products').insert({ code, description: s.description, reference: 'SEMIACABADO', is_semi: true, equivalence_kg: 1, unit: 'KG', units_per_box: 1, min_production_kg: s.min, active: true }));
      criados++;
    }
  }
  return { atualizados, semiacabados: semis.size, criados, ignorados };
}

/** Peso da carga de cada pedido em aberto (kg), pelo cadastro: kg vendidos ou unidades × equivalência/peso. */
export async function pesoPorPedido(): Promise<Map<string, number>> {
  const [its, prods] = await Promise.all([
    supabase.from('order_items').select('order_id, product_code, sale_unit, quantity, quantity_units, weight_kg, order:orders!inner(status)').not('order.status', 'in', '(cancelado,entregue)'),
    supabase.from('products').select('code, description, reference, weight_g, equivalence_kg'),
  ]);
  const pm = new Map((unwrap(prods) as PlanProduct[]).map((p) => [p.code, p]));
  const m = new Map<string, number>();
  for (const it of unwrap(its) as unknown as Array<{ order_id: string; product_code: string | null; sale_unit: 'kg' | 'un' | null; quantity: number | null; quantity_units: number | null; weight_kg: number | null }>) {
    const kg = it.product_code ? itemKg({ saleUnit: it.sale_unit, quantity: it.quantity, quantityUnits: it.quantity_units, weightKg: it.weight_kg } as PlanItem, pm.get(it.product_code)) : Number(it.weight_kg ?? 0);
    m.set(it.order_id, (m.get(it.order_id) ?? 0) + (kg ?? 0));
  }
  return m;
}

export interface Vehicle { id: string; model: string; plate: string; capacity_kg: number | null; active: boolean }
export async function listVehicles(): Promise<Vehicle[]> {
  return unwrap(await supabase.from('vehicles').select('*').eq('active', true).order('model')) as Vehicle[];
}
export async function saveVehicle(v: { model: string; plate: string; capacity_kg: number | null }) {
  unwrap(await supabase.from('vehicles').upsert({ model: v.model.trim(), plate: v.plate.trim().toUpperCase().replace(/\s+/g, ''), capacity_kg: v.capacity_kg, active: true }, { onConflict: 'plate' }));
}
export async function removeVehicle(id: string) {
  unwrap(await supabase.from('vehicles').update({ active: false }).eq('id', id));
}
