/**
 * Importação livre do cadastro de clientes (Vendas parte 3): sem planilha-modelo.
 * O sistema reconhece as colunas pelo nome (e o CNPJ também pelo conteúdo); o que não reconhecer o ADM escolhe.
 * Identifica o cliente pelo código (quando houver) ou pelo CNPJ, mostra duplicidades e divergências e
 * nunca sobrescreve um cadastro sem confirmação.
 */
import type { Customer, Profile } from '@/lib/types';
import { normalizeHeader } from './parsers/sheet';
import { parseDiscounts } from './sales';

export type CustomerField =
  | 'code' | 'cnpj' | 'name' | 'trade_name' | 'group_name' | 'seller' | 'discounts'
  | 'address' | 'address_number' | 'address_complement' | 'district' | 'city' | 'state' | 'cep'
  | 'phone' | 'email' | 'ie' | 'contact_name';

export const CUSTOMER_FIELDS: Array<{ key: CustomerField; label: string; aliases: string[] }> = [
  { key: 'code', label: 'Código do cliente', aliases: ['codigo do cliente', 'cod cliente', 'codigo cliente', 'cod do cliente', 'codigo', 'cod', 'cód', 'id cliente'] },
  { key: 'cnpj', label: 'CNPJ / CPF', aliases: ['cnpj cpf', 'cpf cnpj', 'cnpj', 'cpf', 'documento', 'cnpj do cliente'] },
  { key: 'name', label: 'Nome / razão social', aliases: ['razao social', 'nome razao social', 'nome do cliente loja', 'nome do cliente', 'nome cliente', 'cliente', 'nome', 'loja'] },
  { key: 'trade_name', label: 'Nome fantasia', aliases: ['nome fantasia', 'fantasia', 'apelido'] },
  { key: 'group_name', label: 'Rede / grupo', aliases: ['rede', 'grupo'] },
  { key: 'seller', label: 'Vendedor', aliases: ['vendedor', 'representante', 'nome do vendedor'] },
  { key: 'discounts', label: 'Desconto financeiro', aliases: ['desconto financeiro', 'desc financeiro', 'desconto fin', 'desc fin', 'descontos', 'desconto', 'desc'] },
  { key: 'address', label: 'Endereço', aliases: ['endereco', 'logradouro', 'rua'] },
  { key: 'address_number', label: 'Número', aliases: ['numero', 'nro', 'n'] },
  { key: 'address_complement', label: 'Complemento', aliases: ['complemento'] },
  { key: 'district', label: 'Bairro', aliases: ['bairro'] },
  { key: 'city', label: 'Cidade', aliases: ['cidade', 'municipio'] },
  { key: 'state', label: 'UF', aliases: ['uf', 'estado'] },
  { key: 'cep', label: 'CEP', aliases: ['cep'] },
  { key: 'phone', label: 'Telefone', aliases: ['telefone', 'fone', 'celular', 'tel', 'whatsapp'] },
  { key: 'email', label: 'E-mail', aliases: ['email', 'e mail'] },
  { key: 'ie', label: 'Inscrição estadual', aliases: ['inscricao estadual', 'insc estadual', 'ie'] },
  { key: 'contact_name', label: 'Contato', aliases: ['contato', 'nome do contato'] },
];
export const FIELD_LABEL = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f.key, f.label])) as Record<CustomerField, string>;

/** coluna normalizada do arquivo -> campo (ou '' = ignorar) */
export type Mapping = Record<string, CustomerField | ''>;

const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');
const key = (s: string | null | undefined) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Sugere o campo de cada coluna: nome exato, depois começo do nome, depois o conteúdo (CNPJ/CPF, CEP, UF, e-mail). */
export function autoMap(headers: string[], rows: Record<string, string>[]): Mapping {
  const cols = headers.map(normalizeHeader).filter(Boolean);
  const map: Mapping = Object.fromEntries(cols.map((c) => [c, '']));
  const used = new Set<CustomerField>();
  const take = (col: string, f: CustomerField) => { if (!map[col] && !used.has(f)) { map[col] = f; used.add(f); } };
  for (const f of CUSTOMER_FIELDS) for (const a of f.aliases) { const col = cols.find((c) => c === normalizeHeader(a)); if (col) take(col, f.key); }
  for (const f of CUSTOMER_FIELDS) for (const a of f.aliases) {
    const na = normalizeHeader(a); if (na.length < 4) continue;
    const col = cols.find((c) => !map[c] && (c.startsWith(`${na} `) || c.endsWith(` ${na}`))); if (col) take(col, f.key);
  }
  const sample = (c: string) => rows.map((r) => r[c] ?? '').filter(Boolean).slice(0, 30);
  const mostly = (c: string, test: (v: string) => boolean) => { const s = sample(c); return s.length > 0 && s.filter(test).length / s.length >= 0.8; };
  for (const c of cols.filter((x) => !map[x])) {
    if (mostly(c, (v) => /^[\d./\-\s]+$/.test(v) && [11, 14].includes(digits(v).length))) take(c, 'cnpj');
    else if (mostly(c, (v) => /@/.test(v))) take(c, 'email');
    else if (mostly(c, (v) => /^\d{5}-?\d{3}$/.test(v.trim()))) take(c, 'cep');
    else if (mostly(c, (v) => /^[A-Za-z]{2}$/.test(v.trim()))) take(c, 'state');
  }
  return map;
}

export interface ImportRow {
  line: number;
  values: Partial<Record<CustomerField, string>>;
  discounts?: number[];
  seller_id?: string | null;
  status: 'nova' | 'existente' | 'duplicada' | 'divergente' | 'erro';
  reason?: string;
  changes: string[];
  existingId?: string;
  warning?: string;
  include: boolean;
}

const SHOW: CustomerField[] = ['code', 'name', 'trade_name', 'group_name', 'address', 'address_number', 'address_complement', 'district', 'city', 'state', 'cep', 'phone', 'email', 'ie', 'contact_name'];

/**
 * Monta a prévia com o mapeamento escolhido, as correções digitadas pelo ADM (por linha) e as linhas excluídas.
 * Duplicada: mesmo código/CNPJ de outra linha do arquivo (vale a primeira incluída).
 * Divergente: o código aponta para um cliente e o CNPJ para outro.
 */
export function buildPreview(rows: Record<string, string>[], lines: number[], mapping: Mapping, existing: Customer[], sellers: Profile[], edits: Record<number, Partial<Record<CustomerField, string>>>, excluded: Set<number>): ImportRow[] {
  const byCode = new Map(existing.filter((c) => c.code).map((c) => [String(c.code).trim(), c]));
  const byCnpj = new Map(existing.filter((c) => digits(c.cnpj)).map((c) => [digits(c.cnpj), c]));
  const seenCode = new Map<string, number>(), seenCnpj = new Map<string, number>();
  const hasField = (f: CustomerField) => Object.values(mapping).includes(f);
  return rows.map((r, i) => {
    const line = lines[i];
    const values: ImportRow['values'] = {};
    for (const [col, f] of Object.entries(mapping)) if (f && r[col] !== undefined && r[col] !== '' && values[f] === undefined) values[f] = r[col].trim();
    Object.assign(values, edits[line] ?? {});
    const row: ImportRow = { line, values, status: 'nova', changes: [], include: !excluded.has(line) };
    if (values.cnpj) values.cnpj = digits(values.cnpj);
    // alguns sistemas exportam o nome com o começo do CNPJ na frente ("48.262.419 MERCADO X"): tira o prefixo
    if (values.name) { const m = values.name.match(/^(\d{2}\.?\d{3}\.?\d{3})\s+(.+)$/); if (m && (!values.cnpj || values.cnpj.startsWith(digits(m[1])))) values.name = m[2].trim(); }
    if (values.code !== undefined) values.code = values.code.trim();
    if (values.state) values.state = values.state.toUpperCase();
    if (values.cep) values.cep = digits(values.cep);
    if (hasField('discounts')) {
      const d = parseDiscounts(values.discounts ?? '');
      if (d.error) return { ...row, status: 'erro', reason: d.error, include: false };
      row.discounts = d.values;
    }
    if (hasField('seller') && values.seller) {
      const k = key(values.seller);
      const s = sellers.find((p) => key(p.name) === k || key(p.email) === k || key(p.email?.split('@')[0]) === k);
      row.seller_id = s?.id ?? null;
      if (!s) row.warning = `vendedor "${values.seller}" sem usuário no sistema: o cliente fica só para o ADM até ser vinculado`;
    }
    if (!values.name) return { ...row, status: 'erro', reason: 'nome do cliente vazio', include: false };
    if (!values.code && !values.cnpj) return { ...row, status: 'erro', reason: 'sem código e sem CNPJ: não dá para identificar o cliente', include: false };
    if (values.cnpj && ![11, 14].includes(values.cnpj.length)) return { ...row, status: 'erro', reason: `CNPJ/CPF "${values.cnpj}" não tem 14 (ou 11) dígitos`, include: false };
    if (!row.include) return { ...row, status: 'nova', reason: 'excluída pelo ADM' };
    const dupC = values.code ? seenCode.get(values.code) : undefined, dupJ = values.cnpj ? seenCnpj.get(values.cnpj) : undefined;
    if (dupC || dupJ) return { ...row, status: 'duplicada', reason: dupC ? `mesmo código da linha ${dupC}` : `mesmo CNPJ da linha ${dupJ}`, include: false };
    if (values.code) seenCode.set(values.code, line);
    if (values.cnpj) seenCnpj.set(values.cnpj, line);
    const a = values.code ? byCode.get(values.code) : undefined, b = values.cnpj ? byCnpj.get(values.cnpj) : undefined;
    if (a && b && a.id !== b.id) return { ...row, status: 'divergente', reason: `o código ${values.code} já é de "${a.name}" e o CNPJ é de "${b.name}"`, include: false };
    const cur = a ?? b;
    if (!cur) return row;
    row.existingId = cur.id; row.status = 'existente';
    if (values.code && cur.code && String(cur.code).trim() !== values.code) row.changes.push(`código: ${cur.code} → ${values.code}`);
    if (values.code && !cur.code) row.changes.push(`código: — → ${values.code}`);
    if (values.cnpj && digits(cur.cnpj) !== values.cnpj) row.changes.push(`CNPJ: ${cur.cnpj || '—'} → ${values.cnpj}`);
    for (const f of SHOW.filter((x) => x !== 'code')) {
      const nv = values[f]; if (!nv) continue;
      const ov = (cur as unknown as Record<string, unknown>)[f];
      if (String(ov ?? '').trim() !== nv) row.changes.push(`${FIELD_LABEL[f].toLowerCase()}: ${ov || '—'} → ${nv}`);
    }
    if (hasField('seller') && values.seller && ((cur.seller_name ?? '') !== values.seller || (cur.seller_id ?? null) !== (row.seller_id ?? null))) row.changes.push(`vendedor: ${cur.seller_name || '—'} → ${values.seller}`);
    if (row.discounts && (cur.financial_discounts ?? []).map(Number).join(';') !== row.discounts.join(';')) row.changes.push(`desconto: ${(cur.financial_discounts ?? []).join(';') || 'nenhum'} → ${row.discounts.join(';') || 'nenhum'}`);
    return row;
  });
}

/** Dados a gravar (só o que veio no arquivo; campos vazios não apagam o que já existe). */
export function toPayload(r: ImportRow, isNew: boolean): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const f of SHOW) if (r.values[f]) p[f] = r.values[f];
  if (r.values.cnpj) p.cnpj = r.values.cnpj;
  if (r.values.seller) { p.seller_name = r.values.seller; p.seller_id = r.seller_id ?? null; }
  if (r.discounts) p.financial_discounts = r.discounts;
  if (isNew) p.active = true;
  return p;
}
