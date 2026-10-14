// Prepara o banco fictício do tutorial Produção e Faturamento (Vendas parte 6): o exemplo do documento da páprica.
// Produtos 471 (10 kg, alternativo 264, semiacabado 429), 264 (5 kg), 429 (semiacabado, mínimo 50 kg) e 881 (revenda).
// Estoque: 471 = 2 un (20 kg), 264 = 1 un (5 kg), 429 = 100 kg. Pedidos 7101 (471 120 kg + 881 revenda 20 kg), 7102 (264 5 kg), 7103 (471 30 kg).
export function prepare(D) {
  const base = { units_per_box: 1, unit: 'KG', category: null, min_stock: 0, active: true, created_at: '', updated_at: '' };
  D.products.push(
    { ...base, code: '471', description: 'PAPRICA DEFUMADA - 10 KG - ANDER', reference: 'ANDER SACARIA', weight_g: 10000, equivalence_kg: 10, semi_code: '429', alt_code: '264' },
    { ...base, code: '264', description: 'PAPRICA DEFUMADA - 5 KG - ANDER', reference: 'ANDER SACARIA', weight_g: 5000, equivalence_kg: 5, semi_code: '429' },
    { ...base, code: '429', description: 'MP PAPRICA DEFUMADA - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, min_production_kg: 50, is_semi: true },
    { ...base, code: '881', description: 'ALHO FRESCO NACIONAL N6 CX 10KG', reference: 'REVENDA', weight_g: 10000 });
  D.current_stock = [{ code: '471', location_1: 2, location_5: 0 }, { code: '264', location_1: 1, location_5: 0 }, { code: '429', location_1: 100, location_5: 0 }, { code: '881', location_1: 0, location_5: 0 }]
    .map((s) => ({ ...s, description: '', units_per_box: 1, min_stock: 0, total: s.location_1 }));
  D.orders = []; D.order_items = [];
  const c = D.customers;
  const price = { '471': 52.4, '264': 54.9, '881': 18.5 };
  const mk = (num, cust, entrega, items, extra = {}) => {
    const id = crypto.randomUUID(); let tot = 0;
    items.forEach(([code, kg, ref, stage = 'aberto'], k) => {
      const pr = price[code] ?? 20, t = +(kg * pr).toFixed(2); tot += t;
      D.order_items.push({ id: crypto.randomUUID(), order_id: id, seq: k + 1, product_code: code, product_name: D.products.find((x) => x.code === code)?.description ?? code, product_reference: ref, sale_unit: 'kg', quantity: kg, quantity_units: 0, quantity_boxes: 0, units_per_box: 1, weight_kg: kg, unit_price: pr, total_price: t, stage, raw_description: '', match_status: 'manual', match_score: 1, candidates: [] });
    });
    D.orders.push({ id, order_number: num, customer_id: cust.id, customer_name: cust.name, customer_cnpj: cust.cnpj, seller_name: 'Paula Vendas', delivery_date: entrega, order_date: '2026-10-13', created_at: `2026-10-13T1${num.slice(-1)}:00:00Z`, updated_at: `2026-10-13T1${num.slice(-1)}:00:00Z`, status: 'aberto', allow_other_packaging: false, total_value: +tot.toFixed(2), subtotal_value: +tot.toFixed(2), discount_value: 0, discount_pct: 0, total_weight: 0, payment_terms: '28', source: 'manual', import_id: null, notes: null, stock_posted: false, ...extra });
    return id;
  };
  mk('7101', c[0], '2026-10-14', [['471', 120, 'ANDER SACARIA'], ['881', 20, 'REVENDA']]);
  mk('7102', c[1], '2026-10-16', [['264', 5, 'ANDER SACARIA']]);
  mk('7103', c[2], '2026-10-20', [['471', 30, 'ANDER SACARIA']]);
  return { mk };
}
// status do pedido = etapa menos avançada dos itens (como recalc_order_status no banco)
export function recalc(D, orderId) {
  const o = D.orders.find((x) => x.id === orderId); if (!o || o.status === 'cancelado') return;
  const R = { aberto: 1, em_producao: 2, faturado: 3, entregue: 4 }, N = ['', 'aberto', 'em_producao', 'faturado', 'entregue'];
  const its = D.order_items.filter((i) => i.order_id === orderId); if (its.length) o.status = N[Math.min(...its.map((i) => R[i.stage] ?? 1))];
}
