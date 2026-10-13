// Prepara o banco fictício para o tutorial do vendedor (Vendas parte 4): a sessão vira a vendedora Paula,
// que só enxerga os clientes dela (como faz a RLS no banco real), com último pedido em dias variados e um pedido em aberto.
export const OPEN_FOR = 'Empório Boa Vista Ltda'; // cliente com pedido em aberto (aparece o aviso no pedido novo)
// [nome fantasia, cidade, dias desde o último pedido (null = nunca pediu), descontos autorizados]
const MINE = [
  ['Mercadinho São José', 'Ferraz de Vasconcelos', 52, [2]],
  ['Super Família', 'Suzano', 38, []],
  ['Hortifruti Vale Verde', 'São Paulo', 23, [3, 1]],
  ['Empório Primavera', 'Arujá', 11, [2]],
  ['Mercado Estrela', 'São Paulo', 6, []],
  ['Empório Boa Vista', 'Mogi das Cruzes', 2, [3, 1]],
  ['Mercearia Santa Luzia', 'Mogi das Cruzes', null, [2]],
  ['Padaria Pão Dourado', 'Suzano', null, []],
];
const uid = () => crypto.randomUUID();
const day = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const ago = (d, h = 3) => new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();
export function prepare(D, ME) {
  // sessão = vendedora (isSeller: ativo, role vendedor, access editor, não superadmin)
  Object.assign(ME, { name: 'Paula Vendas', email: 'paula@exemplo.com', role: 'vendedor', access: 'editor', is_superadmin: false, status: 'ativo' });
  // produtos com referência que tem regra de unidade de venda: sacarias em kg (ISA), potes em unidade (POTE TEMP)
  for (const p of D.products) p.reference = p.category === 'Sacarias' ? 'ISA' : 'POTE TEMP';
  const base = D.customers[0];
  const cnpjs = ['23481576000140', '31952648000177', '40618273000155', '17364920000183', '52837164000102', '28475031000169', '45612378000190', '38291745000162'];
  D.customers = MINE.map(([nm, city, , disc], i) => ({ ...base, id: uid(), code: String(120 + i * 7).padStart(5, '0'), cnpj: cnpjs[i], name: `${nm} Ltda`, trade_name: nm, group_name: 'Independentes', city, district: 'Centro', active: true, seller_id: ME.id, seller_name: ME.name, financial_discounts: disc, created_at: ago(200 - i) }));
  const P = D.products, bag = (n) => P.filter((p) => p.category === 'Sacarias')[n], pot = (n) => P.filter((p) => p.category === 'Potes')[n];
  D.orders = []; D.order_items = [];
  const status = ['entregue', 'entregue', 'faturado', 'entregue', 'em_producao', 'aberto'];
  let num = 7031;
  D.customers.forEach((c, i) => {
    const d = MINE[i][2]; if (d == null) return;
    const items = [[bag(i % 6), 10 + (i % 3) * 5, 36.9 + i], [pot(i), 48 + 24 * (i % 2), 4.9 + (i % 3) * 0.3]];
    const pdf = i === 1;
    const o = { id: uid(), import_id: pdf ? D.order_imports[0].id : null, customer_id: c.id, customer_name: c.name, customer_cnpj: c.cnpj, seller_name: ME.name, order_number: String(num++), order_date: day(d), delivery_date: day(d - 5), buyer: c.contact_name, payment_terms: '28', status: status[i], source: pdf ? 'pdf' : 'manual', notes: null, discount_pct: 0, allow_other_packaging: i % 2 === 0, created_at: ago(d), updated_at: ago(d), stock_posted: false, total_value: 0, subtotal_value: 0, discount_value: 0, total_weight: 0 };
    items.forEach(([p, q, pr], j) => {
      const kg = p.category === 'Sacarias', tot = +(q * pr).toFixed(2);
      D.order_items.push({ id: uid(), order_id: o.id, seq: j + 1, client_code: null, raw_description: p.description, product_code: p.code, product_reference: p.reference, product_name: p.description, sale_unit: kg ? 'kg' : 'un', quantity: q, quantity_boxes: kg ? 0 : q / 48, units_per_box: kg ? 1 : 48, quantity_units: kg ? 0 : q, weight_kg: kg ? q : null, unit_price: +pr.toFixed(2), total_price: tot, match_status: 'manual', match_score: 1, candidates: [], lot_number: null });
      o.total_value += tot; if (kg) o.total_weight += q;
    });
    o.total_value = +o.total_value.toFixed(2); o.subtotal_value = o.total_value; D.orders.push(o);
  });
  // segundo pedido mais antigo de um cliente, para a lista ter mais linhas
  D.orders.sort((a, b) => (a.order_date < b.order_date ? 1 : -1));
  D.customer_last_order = D.customers.map((c, i) => MINE[i][2] == null ? null : { customer_id: c.id, last_order_at: ago(MINE[i][2]) }).filter(Boolean);
  D.nfe_notas = D.nfe_notas || [];
}
