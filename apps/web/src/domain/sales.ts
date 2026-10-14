/** Regras do pedido de venda: CNPJ, unidade de venda por referência, descontos e totais. */

export type SaleUnit = 'kg' | 'un';

/** Só os dígitos do CNPJ. Excel que leu o CNPJ como número perde até 2 zeros à esquerda: 12 ou 13 dígitos voltam a ter 14. */
export function cnpjDigits(raw: string | null | undefined): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 12 || d.length === 13 ? d.padStart(14, '0') : d;
}

export function fmtCnpj(raw: string | null | undefined): string {
  const d = cnpjDigits(raw);
  if (d.length !== 14) return raw ?? '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Texto para comparar: sem acento, minúsculo, sem pontuação e com espaços únicos ("Pote Temp." -> "pote temp"). */
export function normalizeKey(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type SaleUnitRules = Record<string, SaleUnit>;
export const DEFAULT_SALE_UNIT_RULES: SaleUnitRules = { ander: 'kg', isa: 'kg', 'pote temp': 'un', 'pote frut': 'un', revenda: 'un' };

/** Unidade de venda pela referência do cadastro; null = referência sem regra (pendência, nunca suposição). */
export function saleUnitFor(reference: string | null | undefined, rules: SaleUnitRules = DEFAULT_SALE_UNIT_RULES): SaleUnit | null {
  const key = normalizeKey(reference);
  if (!key) return null;
  for (const [k, v] of Object.entries(rules)) if (normalizeKey(k) === key) return v;
  return null;
}

/**
 * Descontos financeiros do cadastro do cliente: "nenhum", "3%", "3%;1%", "3 ; 1,5".
 * Retorna percentuais na ordem informada, sem repetição; erro quando algum valor é inválido.
 */
export function parseDiscounts(raw: string | null | undefined): { values: number[]; error: string | null } {
  const txt = String(raw ?? '').trim();
  if (!txt || normalizeKey(txt) === 'nenhum' || normalizeKey(txt) === 'sem desconto') return { values: [], error: null };
  const values: number[] = [];
  for (const part of txt.split(/[;|\n]/).map((p) => p.trim()).filter(Boolean)) {
    const n = Number(part.replace('%', '').replace(',', '.').trim());
    if (!Number.isFinite(n) || n < 0 || n >= 100) return { values: [], error: `desconto inválido "${part}" (use porcentagem, ex.: 3% ou 3%;1%)` };
    if (!values.includes(n)) values.push(n);
  }
  return { values, error: null };
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Quantidade válida para a unidade: maior que zero; inteiro para unidade; até 3 casas para kg. */
export function quantityError(q: number | null | undefined, unit: SaleUnit | null): string | null {
  if (q == null || !Number.isFinite(q)) return 'Informe a quantidade.';
  if (q <= 0) return 'A quantidade precisa ser maior que zero.';
  if (unit === 'un' && !Number.isInteger(q)) return 'Produto vendido por unidade: use número inteiro.';
  // Vendas parte 5: quilo também só inteiro (as embalagens têm peso exato, sem gramas)
  if (unit === 'kg' && !Number.isInteger(q)) return 'Produto vendido por quilo: use número inteiro (sem gramas).';
  return null;
}

/**
 * Totais do pedido. Cada item é arredondado em centavos e o subtotal é a soma desses valores exibidos;
 * o desconto (percentual sobre o subtotal) também é arredondado em centavos; total = subtotal − desconto.
 */
export function orderTotals(items: Array<{ quantity: number | null; unit_price: number | null }>, discountPct: number) {
  const lineTotals = items.map((i) => (i.quantity && i.unit_price != null ? round2(i.quantity * i.unit_price) : 0));
  const subtotal = round2(lineTotals.reduce((s, v) => s + v, 0));
  const discount = round2((subtotal * (discountPct || 0)) / 100);
  return { lineTotals, subtotal, discount, total: round2(subtotal - discount) };
}

/** Dias corridos desde a data (0 = hoje), contando pela data local. */
export function daysSince(iso: string, now = new Date()): number {
  const d = new Date(iso);
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()), b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Ordem do cadastro de clientes: mais dias sem pedido primeiro, empate pelo nome;
 * quem nunca enviou pedido vai para o grupo "Sem pedido", em ordem alfabética.
 */
export function sortByLastOrder<T extends { id: string; name: string }>(list: T[], last: Map<string, string>, now = new Date()) {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'pt-BR');
  const com = list.filter((c) => last.has(c.id)).map((c) => ({ c, days: daysSince(last.get(c.id)!, now) }));
  com.sort((a, b) => b.days - a.days || byName(a.c, b.c));
  const sem = list.filter((c) => !last.has(c.id)).sort(byName);
  return { comPedido: com, semPedido: sem };
}
