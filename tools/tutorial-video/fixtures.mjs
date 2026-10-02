// Banco de demonstração: dados 100% fictícios (nenhum dado real é lido). Nomes de produtos = catálogo público.
let seed = 42;
const R = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(R() * a.length)];
const int = (a, b) => a + Math.floor(R() * (b - a + 1));
let n = 0;
const uid = () => { n++; const h = n.toString(16).padStart(12, '0'); return `0000${h.slice(0, 4)}-0000-4000-8000-${h}`; };
const NOW = new Date('2026-10-01T14:00:00-03:00');
const ago = (d, h = 0) => new Date(NOW.getTime() - d * 864e5 - h * 36e5).toISOString();
const day = (d) => ago(d).slice(0, 10);

const POTS = [
  ['Tempero Pega Marido', 100, 'POTE AMARELO'], ['Tempero Pega Esposa', 100, 'POTE VERMELHO'], ['Tempero do Edu', 100, 'POTE AMARELO'], ['Tempero Ana Maria', 100, 'POTE AMARELO'],
  ['Tempero da Fazenda', 100, 'POTE VERMELHO'], ['Cebola, Salsa e Alho', 80, 'POTE AMARELO'], ['Tempero do Chef', 100, 'POTE VERMELHO'], ['Curry', 60, 'POTE AMARELO'],
  ['Cominho em Pó', 60, 'POTE VERMELHO'], ['Orégano em Flocos', 30, 'POTE AMARELO'], ['Ervas Finas', 30, 'POTE VERMELHO'], ['Cúrcuma em Pó', 60, 'POTE AMARELO'],
  ['Cravo-da-Índia', 40, 'POTE VERMELHO'], ['Canela em Pó', 50, 'POTE AMARELO'], ['Colorau Especial', 100, 'POTE VERMELHO'], ['Tempero ISA Funcional', 100, 'POTE VERMELHO'],
  ['Amaciante de Carnes', 100, 'POTE AMARELO'], ['Pimenta-do-Reino em Pó', 60, 'POTE AMARELO'], ['Limão e Ervas Finas', 80, 'POTE AMARELO'], ['Lemon Pepper', 100, 'POTE AMARELO'],
  ['Lemon Pepper Defumado', 100, 'POTE VERMELHO'], ['Bicarbonato de Sódio', 150, 'POTE VERMELHO'], ['Caldo de Bacon', 100, 'POTE VERMELHO'], ['Caldo de Carne', 100, 'POTE VERMELHO'],
  ['Tempero para Pipoca', 100, 'POTE AMARELO'], ['Alho Frito', 60, 'POTE VERMELHO'], ['Chimichurri Defumado', 60, 'POTE AMARELO'], ['Chimichurri Picante', 60, 'POTE AMARELO'],
  ['Chimichurri', 60, 'POTE AMARELO'], ['Tempero Mineiro', 100, 'POTE AMARELO'], ['Tempero Baiano', 100, 'POTE VERMELHO'], ['Tempero Gaúcho', 100, 'POTE AMARELO'],
  ['Tempero para Carne', 100, 'POTE VERMELHO'], ['Páprica Doce', 80, 'POTE VERMELHO'], ['Páprica Defumada', 80, 'POTE VERMELHO'], ['Páprica Picante', 80, 'POTE VERMELHO'],
  ['Vinagrete', 60, 'POTE VERMELHO'], ['Creme de Cebola', 100, 'POTE AMARELO'],
];
const BAGS = [['Colorau', 10000], ['Pimenta-do-Reino', 5000], ['Tempero Baiano', 10000], ['Alho Frito', 5000], ['Orégano', 5000], ['Páprica Doce', 10000]];
const up = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function makeDb() {
  const D = {};
  const ME = { id: uid(), name: 'Ana Souza', email: 'demo@isaalimentos.com.br', role: 'admin', access: 'admin', status: 'ativo', is_superadmin: true, approved_by: null, approved_at: ago(200), created_at: ago(200) };
  D.profiles = [ME,
    { id: uid(), name: 'Carlos Lima', email: 'carlos@exemplo.com.br', role: 'comercial', access: 'editor', status: 'ativo', is_superadmin: false, approved_by: ME.id, approved_at: ago(120), created_at: ago(121) },
    { id: uid(), name: 'Marina Alves', email: 'marina@exemplo.com.br', role: 'estoque', access: 'editor', status: 'ativo', is_superadmin: false, approved_by: ME.id, approved_at: ago(90), created_at: ago(91) },
    { id: uid(), name: 'João Pereira', email: 'joao@exemplo.com.br', role: 'producao', access: 'editor', status: 'ativo', is_superadmin: false, approved_by: ME.id, approved_at: ago(60), created_at: ago(61) },
    { id: uid(), name: 'Beatriz Rocha', email: 'beatriz@exemplo.com.br', role: 'operador', access: 'visualizador', status: 'pendente', is_superadmin: false, approved_by: null, approved_at: null, created_at: ago(0, 3) },
  ];
  const [, CARLOS, MARINA, JOAO] = D.profiles;

  D.products = [];
  POTS.forEach(([nm, g, ref], i) => D.products.push({ code: String(1001 + i), description: `${up(nm)} - ISA - ${g}g - CX 48`, reference: ref, units_per_box: 48, weight_g: g, unit: 'UN', category: 'Potes', min_stock: 0, active: true, created_at: ago(300), updated_at: ago(10) }));
  BAGS.forEach(([nm, g], i) => D.products.push({ code: String(2001 + i), description: `${up(nm)} - ISA - ${g / 1000} KG`, reference: 'SACARIA', units_per_box: 1, weight_g: g, unit: 'UN', category: 'Sacarias', min_stock: 0, active: true, created_at: ago(300), updated_at: ago(10) }));
  const P = D.products;

  // Estoque
  D.stock_imports = [0, 7, 14].map((d, i) => ({ id: uid(), file_name: `estoque_${day(d).split('-').reverse().join('-')}.xlsx`, imported_at: ago(d, 5), imported_by: MARINA.id, locations: [1, 5], rows_total: P.length * 2, products_count: P.length, total_units: 0, is_current: i === 0 }));
  D.current_stock = P.map((p) => { const l1 = p.units_per_box > 1 ? int(0, 30) * 12 : int(0, 25), l5 = p.units_per_box > 1 ? int(0, 12) * 12 : int(0, 8); return { code: p.code, description: p.description, units_per_box: p.units_per_box, min_stock: 0, location_1: l1, location_5: l5, total: l1 + l5, imported_at: D.stock_imports[0].imported_at }; });
  D.stock_imports[0].total_units = D.current_stock.reduce((a, s) => a + s.total, 0);
  D.stock_balances = D.current_stock.flatMap((s) => [{ id: uid(), import_id: D.stock_imports[0].id, product_code: s.code, location: 1, quantity: s.location_1 }, { id: uid(), import_id: D.stock_imports[0].id, product_code: s.code, location: 5, quantity: s.location_5 }]);
  D.stock_movements = [
    ['1020', 1, 96, 'producao', 'Ordem de produção 28/09'], ['1029', 1, -48, 'venda', 'Pedido 4581'], ['1035', 5, 24, 'entrada', 'Ajuste de inventário'], ['1015', 1, -12, 'perda', 'Pote trincado'], ['1001', 1, 144, 'producao', 'Ordem de produção 25/09'],
  ].map(([c, l, q, k, r], i) => ({ id: uid(), import_id: null, product_code: c, location: l, quantity: q, kind: k, reason: r, reference_type: null, reference_id: null, created_by: MARINA.id, created_at: ago(i + 1, 3), lot_number: k === 'producao' ? `L${2600 + i}` : null, expires_on: k === 'producao' ? day(-360) : null }));

  // Clientes (fictícios)
  const STORES = [
    ['Supermercado Bom Dia', 'Rede Bom Dia', 'Guarulhos', 'Centro'], ['Bom Dia Vila Nova', 'Rede Bom Dia', 'Guarulhos', 'Vila Nova'], ['Bom Dia Jardim', 'Rede Bom Dia', 'Arujá', 'Jardim Real'],
    ['Super Nova Era', 'Rede Nova Era', 'Itaquaquecetuba', 'Vila Japão'], ['Nova Era Express', 'Rede Nova Era', 'Poá', 'Centro'], ['Nova Era Matriz', 'Rede Nova Era', 'Suzano', 'Jardim Imperador'],
    ['Empório Boa Vista', 'Independentes', 'Mogi das Cruzes', 'Boa Vista'], ['Mercadinho São José', 'Independentes', 'Ferraz de Vasconcelos', 'São José'], ['Hortifruti Vale Verde', 'Independentes', 'São Paulo', 'Itaim Paulista'],
    ['Mercado Estrela', 'Independentes', 'São Paulo', 'Guaianases'], ['Empório Primavera', 'Independentes', 'Arujá', 'Primavera'], ['Super Família', 'Independentes', 'Suzano', 'Vila Amorim'],
  ];
  D.customers = STORES.map(([nm, g, city, dist], i) => ({ id: uid(), cnpj: `${String(11 + i * 3).padStart(2, '0')}.${int(100, 999)}.${int(100, 999)}/000${(i % 3) + 1}-${int(10, 99)}`, name: `${nm} Ltda`, trade_name: nm, group_name: g, address: `Rua Exemplo, ${int(10, 990)}`, city, district: dist, state: 'SP', cep: `0${int(7000, 8999)}-${int(100, 999)}`, phone: `(11) 9${int(1000, 9999)}-${int(1000, 9999)}`, email: `compras@${up(nm).replace(/\W/g, '').toLowerCase().slice(0, 14)}.exemplo.com`, contact_name: pick(['Paulo', 'Renata', 'Sérgio', 'Lúcia', 'Fábio', 'Cristina']), notes: null, active: true, created_at: ago(200 - i), updated_at: ago(5) }));
  D.customer_interactions = D.customers.slice(0, 4).flatMap((c, i) => [{ id: uid(), customer_id: c.id, kind: 'whatsapp', content: 'Pediu tabela nova de preços dos potes de 100 g.', occurred_at: ago(i + 2), created_by: CARLOS.id, created_at: ago(i + 2) }, { id: uid(), customer_id: c.id, kind: 'visita', content: 'Visita na loja: gôndola de temperos reorganizada, pediu mais Lemon Pepper.', occurred_at: ago(i + 9), created_by: CARLOS.id, created_at: ago(i + 9) }]);

  // Preços
  const unitPrice = (p) => (p.units_per_box > 1 ? 3.2 + p.weight_g / 40 + (p.code.charCodeAt(3) % 5) * 0.35 : p.weight_g / 1000 * 21);
  D.price_lists = P.slice(0, 14).map((p, i) => ({ id: uid(), product_code: p.code, customer_id: i % 5 === 4 ? D.customers[i % 12].id : null, group_name: i % 5 === 2 ? 'Rede Bom Dia' : null, price_box: +(unitPrice(p) * p.units_per_box * (i % 5 === 2 ? 0.95 : i % 5 === 4 ? 0.92 : 1)).toFixed(2), valid_from: day(30 + i), notes: null, created_by: CARLOS.id, created_at: ago(30 + i) }));

  // Pedidos
  D.order_imports = [{ id: uid(), file_name: 'pedidos_rede_bom_dia.pdf', imported_at: ago(1, 4), imported_by: CARLOS.id, orders_count: 3, items_count: 31, pending_count: 2 }, { id: uid(), file_name: 'pedidos_nova_era.pdf', imported_at: ago(6, 2), imported_by: CARLOS.id, orders_count: 3, items_count: 27, pending_count: 0 }];
  D.orders = []; D.order_items = [];
  const statuses = ['aberto', 'aberto', 'aberto', 'em_producao', 'em_producao', 'faturado', 'entregue', 'entregue', 'entregue', 'entregue', 'faturado', 'aberto', 'entregue', 'cancelado'];
  for (let i = 0; i < 14; i++) {
    const c = D.customers[i % 12], d = Math.floor(i * 2.1), o = { id: uid(), import_id: i < 3 ? D.order_imports[0].id : i < 6 ? D.order_imports[1].id : null, customer_id: c.id, order_number: String(4580 + i), order_date: day(d), delivery_date: day(d - 4), buyer: c.contact_name, payment_terms: pick(['28 dias', '28/35 dias', '21 dias']), total_value: 0, total_weight: 0, status: statuses[i], source: i < 6 ? 'pdf' : 'manual', notes: null, created_at: ago(d, 2), updated_at: ago(d, 1), stock_posted: ['faturado', 'entregue'].includes(statuses[i]) };
    const k = int(6, 12), used = new Set();
    for (let j = 0; j < k; j++) {
      let p; do p = pick(P.slice(0, 38)); while (used.has(p.code)); used.add(p.code);
      const bx = int(1, 6), u = unitPrice(p), pending = i === 0 && j < 2;
      const it = { id: uid(), order_id: o.id, seq: j + 1, client_code: String(77000 + int(100, 999)), raw_description: pending ? `TEMP ${up(p.description.split(' - ')[0]).slice(0, 12)} ISA ${p.weight_g}G` : p.description, packaging: 'CX 48', product_code: pending ? null : p.code, quantity_boxes: bx, units_per_box: 48, quantity_units: bx * 48, unit_price: +u.toFixed(2), total_price: +(u * bx * 48).toFixed(2), weight_kg: +(bx * 48 * p.weight_g / 1000).toFixed(3), match_status: pending ? (j ? 'ambiguous' : 'pending') : 'matched', match_score: pending ? 0.62 : 0.97, candidates: pending ? [{ code: p.code, description: p.description, score: 0.62 }, { code: P[(+p.code - 1000) % 38].code, description: P[(+p.code - 1000) % 38].description, score: 0.58 }] : [], lot_number: null };
      D.order_items.push(it); o.total_value += it.total_price; o.total_weight += it.weight_kg;
    }
    o.total_value = +o.total_value.toFixed(2); o.total_weight = +o.total_weight.toFixed(3); D.orders.push(o);
  }
  D.product_aliases = P.slice(0, 6).map((p, i) => ({ id: uid(), product_code: p.code, client_code: String(77100 + i), description: `TEMP ${up(p.description).slice(0, 16)}`, normalized: up(p.description).slice(0, 16).toLowerCase(), created_by: CARLOS.id, created_at: ago(20 + i) }));
  D.product_stats = P.map((p) => { const t = D.order_items.filter((x) => x.product_code === p.code); return { code: p.code, description: p.description, min_stock: 0, weekly_avg_units: Math.round(t.reduce((a, x) => a + x.quantity_units, 0) / 4), total_units_all: t.reduce((a, x) => a + x.quantity_units, 0), revenue_all: +t.reduce((a, x) => a + x.total_price, 0).toFixed(2) }; });

  // Ordens de produção (fluxo antigo)
  D.production_runs = [{ id: uid(), name: 'Produção 30/09', stock_import_id: D.stock_imports[0].id, order_ids: D.orders.slice(3, 5).map((o) => o.id), status: 'em_andamento', notes: null, created_by: JOAO.id, created_at: ago(1, 6), completed_at: null, stock_posted: false },
    { id: uid(), name: 'Produção 25/09', stock_import_id: D.stock_imports[1].id, order_ids: [], status: 'concluido', notes: null, created_by: JOAO.id, created_at: ago(6, 6), completed_at: ago(5), stock_posted: true }];
  D.production_run_items = D.production_runs.flatMap((r, ri) => P.slice(ri * 5, ri * 5 + 7).map((p) => { const ord = int(2, 9) * 48, st = int(0, 4) * 12, need = Math.max(0, ord - st); return { id: uid(), run_id: r.id, product_code: p.code, description: p.description, stock_available: st, ordered_units: ord, production_need: need, remaining: Math.max(0, st - ord), produced_units: ri ? need : Math.round(need * R()) }; }));

  // Módulo Produção (independente)
  const NOMARGIN = ['1010', '1013', '1022'];
  D.prod_products = P.map((p) => ({ code: p.code, reference: p.reference, name: p.description.split(' - ')[0], description: p.description, brand: 'ISA', weight_g: p.weight_g, use_g: NOMARGIN.includes(p.code) ? p.weight_g : p.weight_g + (p.units_per_box > 1 ? 1 : 10), units_per_box: p.units_per_box, no_margin: NOMARGIN.includes(p.code), active: true, created_at: ago(40), updated_at: ago(2) }));
  D.prod_stock = D.current_stock.map((s) => ({ code: s.code, stock1: s.location_1, stock5: s.location_5, updated_at: ago(0, 6) }));
  const SHOP = ['BOM DIA CENTRO', 'BOM DIA VILA NOVA', 'BOM DIA JARDIM', 'NOVA ERA MATRIZ'];
  D.prod_demand = [];
  SHOP.forEach((s, si) => { for (let j = 0; j < 14; j++) { const p = P[(si * 7 + j * 3) % 38], bx = int(1, 4); D.prod_demand.push({ id: uid(), code: p.code, raw_description: p.description, store: s, boxes: bx, units: bx * 48, source: 'pdf', imported_at: ago(0, 5) }); } });
  D.prod_demand.push({ id: uid(), code: '2001', raw_description: P[38].description, store: 'NOVA ERA MATRIZ', boxes: 0, units: 6, source: 'planilha', imported_at: ago(0, 5) });
  D.prod_pending = [
    { id: uid(), raw_description: 'TEMP PEGA MARIDO ISA 100G', client_code: '77412', store: 'BOM DIA CENTRO', boxes: 2, units: 96, candidates: [{ code: '1001', description: P[0].description, score: 0.71 }, { code: '1002', description: P[1].description, score: 0.64 }], source: 'pdf', created_at: ago(0, 5) },
    { id: uid(), raw_description: 'PAPRICA DEF ISA 80G', client_code: '77588', store: 'NOVA ERA MATRIZ', boxes: 1, units: 48, candidates: [{ code: '1035', description: P[34].description, score: 0.69 }, { code: '1034', description: P[33].description, score: 0.6 }], source: 'pdf', created_at: ago(0, 5) },
  ];
  D.prod_aliases = [{ id: uid(), raw: 'LEMON PEPPER ISA 100G', client_code: '77301', code: '1020', created_at: ago(9) }];

  // Insumos e compras
  const SUP = ['Fornecedor Alfa Condimentos', 'Beta Embalagens', 'Gama Plásticos', 'Delta Rótulos'];
  const MP = ['Pimenta-do-reino moída', 'Páprica doce', 'Páprica defumada', 'Sal refinado', 'Alho desidratado granulado', 'Cebola desidratada', 'Orégano', 'Cúrcuma', 'Canela em pó', 'Cominho moído', 'Colorau', 'Salsa desidratada', 'Limão desidratado', 'Bicarbonato de sódio', 'Cravo-da-índia', 'Fumaça em pó'];
  D.supplies = [];
  MP.forEach((nm, i) => { const s2 = +(R() * 300).toFixed(3), s6 = +(R() * 200).toFixed(3); D.supplies.push({ id: uid(), code: String(10 + i), reference: 'materia_prima', name: nm, unit: 'kg', stock: +(s2 + s6).toFixed(3), stock2: s2, stock6: s6, min_stock: 0, cost: +(8 + R() * 40).toFixed(2), supplier: SUP[0], active: true, created_at: ago(100), updated_at: ago(3) }); });
  [['Pote PET 100 ml', 'pote', SUP[2]], ['Pote PET 60 ml', 'pote', SUP[2]], ['Tampa amarela', 'tampa', SUP[2]], ['Tampa vermelha', 'tampa', SUP[2]], ['Caixa de papelão CX 48', 'embalagem', SUP[1]], ['Saco 10 kg', 'embalagem', SUP[1]], ['Etiqueta frontal', 'etiqueta', SUP[3]], ['Etiqueta da tampa', 'etiqueta', SUP[3]]].forEach(([nm, ref, sp], i) => {
    const s2 = int(800, 9000), s6 = int(0, 3000); D.supplies.push({ id: uid(), code: String(500 + i), reference: ref, name: nm, unit: 'un', stock: s2 + s6, stock2: s2, stock6: s6, min_stock: 0, cost: +(0.05 + R() * 0.9).toFixed(3), supplier: sp, active: true, created_at: ago(100), updated_at: ago(3) });
  });
  D.supply_consumption = [];
  D.supplies.forEach((s, si) => { const base = s.unit === 'kg' ? 60 + R() * 140 : 1500 + R() * 4000; for (let m = 11; m >= 0; m--) { const d = new Date(NOW.getFullYear(), NOW.getMonth() - m - 1, 1); const jump = si === 2 && m === 0 ? 1.45 : 1; D.supply_consumption.push({ id: uid(), supply_id: s.id, period: d.toISOString().slice(0, 10), qty: +(base * (0.85 + R() * 0.3) * jump).toFixed(3), created_at: ago(2) }); } });
  D.product_bom = [['1020', 12, 0.08], ['1020', 0, 0.015], ['1020', 16, 1], ['1020', 18, 1], ['1020', 22, 1], ['1035', 2, 0.079], ['1035', 16, 1], ['1035', 19, 1]].map(([pc, si, q]) => ({ id: uid(), product_code: pc, supply_id: D.supplies[si].id, qty_per_unit: q }));
  D.purchase_orders = [{ id: uid(), supplier: SUP[0], status: 'enviado', notes: 'Entrega na fábrica', production_run_id: D.production_runs[0].id, created_by: CARLOS.id, created_at: ago(2), received_at: null }, { id: uid(), supplier: SUP[2], status: 'recebido', notes: null, production_run_id: null, created_by: CARLOS.id, created_at: ago(12), received_at: ago(8) }];
  D.purchase_order_items = [[0, 0, 120, 31.5], [0, 2, 80, 44.9], [0, 4, 60, 27.8], [1, 16, 5000, 0.21], [1, 18, 5000, 0.08]].map(([po, s, q, c]) => ({ id: uid(), purchase_order_id: D.purchase_orders[po].id, supply_id: D.supplies[s].id, qty: q, unit_cost: c }));

  D.delivery_routes = [{ id: uid(), name: 'Rota Guarulhos / Arujá', route_date: day(-1), driver: 'Motorista 1', vehicle: 'Fiorino ABC-1D23', status: 'planejada', order_ids: D.orders.slice(0, 3).map((o) => o.id), notes: null, created_by: CARLOS.id, created_at: ago(1) }, { id: uid(), name: 'Rota Suzano / Poá', route_date: day(3), driver: 'Motorista 2', vehicle: 'HR XYZ-9K87', status: 'concluida', order_ids: D.orders.slice(6, 9).map((o) => o.id), notes: null, created_by: CARLOS.id, created_at: ago(4) }];

  D.activities = [
    ['pedido', 'Pedidos importados', '3 pedidos da Rede Bom Dia, 2 itens para conferir', '#/pedidos/conferencia', CARLOS, 0.2], ['estoque', 'Estoque atualizado', 'Planilha de estoque importada (locais 1 e 5)', '#/estoque', MARINA, 0.3],
    ['producao', 'Produção concluída', 'Produção 25/09 finalizada e lançada no estoque', '#/producao', JOAO, 5], ['sistema', 'Backup diário', 'Cópia de segurança gerada às 03:00', '#/configuracoes', null, 0.5],
    ['mensagem', 'Recado da equipe', 'Lembrete: conferir lote do Lemon Pepper antes de faturar.', null, MARINA, 1], ['cliente', 'Novo cliente', 'Empório Primavera cadastrado', '#/clientes', CARLOS, 3],
  ].map(([k, t, b, l, a, d]) => ({ id: uid(), kind: k, title: t, body: b, link: l, actor_id: a?.id ?? null, actor_name: a?.name ?? 'Sistema', audience: [], created_at: ago(d) }));
  D.activity_reads = [{ user_id: ME.id, last_seen_at: ago(1) }];
  D.audit_log = Array.from({ length: 14 }, (_, i) => { const p = P[i * 2], who = [CARLOS, MARINA, JOAO, ME][i % 4]; return { id: uid(), table_name: ['products', 'customers', 'orders', 'prod_stock'][i % 4], row_id: p.code, action: ['UPDATE', 'INSERT', 'UPDATE', 'DELETE'][i % 4], old_data: i % 4 === 1 ? null : { description: p.description, weight_g: p.weight_g }, new_data: i % 4 === 3 ? null : { description: p.description, weight_g: p.weight_g }, changed_by: who.id, changed_by_name: who.name, changed_at: ago(i * 0.4) }; });
  D.app_settings = [
    { key: 'modules', value: { precos: true, compras: true, rotas: true, relatorios: true, auditoria: true, portal: true, push: true }, updated_at: ago(30) },
    { key: 'prod_no_margin', value: ['orégano', 'cravo', 'bicarbonato'], updated_at: ago(30) },
  ];
  D.push_subscriptions = []; D.edit_locks = [];
  D.order_items_view = null;
  return { D, ME };
}
