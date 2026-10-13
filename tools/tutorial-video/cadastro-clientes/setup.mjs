// Prepara o banco fictício para o tutorial do cadastro de clientes (códigos com zeros, vendedores, último pedido variado).
export const SELLERS = [
  { id: '0000aaaa-0000-4000-8000-00000000aaaa', name: 'Paula Vendas', email: 'paula@exemplo.com' },
  { id: '0000aaaa-0000-4000-8000-00000000bbbb', name: 'Roberto Campos', email: 'roberto@exemplo.com' },
];
export const DAYS = [3, 12, 0, 27, 5, 45, 8, 61, 15, 2, 34, 21]; // dias desde o último pedido de cada cliente com pedido
export function prepare(D) {
  for (const s of SELLERS) D.profiles.push({ ...s, role: 'vendedor', access: 'editor', status: 'ativo', is_superadmin: false, created_at: new Date().toISOString() });
  const digits = (s) => String(s ?? '').replace(/\D/g, '');
  D.customers.forEach((c, i) => {
    c.code = String(120 + i * 7).padStart(5, '0');
    c.cnpj = digits(c.cnpj);
    const s = SELLERS[i % 2]; c.seller_id = s.id; c.seller_name = s.name;
    c.financial_discounts = i % 3 === 0 ? [3, 1] : i % 3 === 1 ? [2] : [];
  });
  const extra = [
    ['00205', 'Mercearia Santa Luzia', 'Mogi das Cruzes', '45612378000190', true],
    ['00212', 'Padaria Pão Dourado', 'Suzano', '38291745000162', true],
    ['00219', 'Armazém do Porto', 'Poá', '29384756000171', false],
  ];
  for (const [code, nm, city, cnpj, active] of extra) {
    const s = SELLERS[0];
    D.customers.push({ ...D.customers[0], id: crypto.randomUUID(), code, cnpj, name: `${nm} Ltda`, trade_name: nm, group_name: 'Independentes', city, active, seller_id: s.id, seller_name: s.name, financial_discounts: [], created_at: new Date().toISOString() });
  }
  const now = Date.now();
  D.customer_last_order = D.customers.slice(0, 12).map((c, i) => ({ customer_id: c.id, last_order_at: new Date(now - DAYS[i] * 864e5 - 3 * 36e5).toISOString() }));
  D.nfe_notas = D.nfe_notas || [];
}
