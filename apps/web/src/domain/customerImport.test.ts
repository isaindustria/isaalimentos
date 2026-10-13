import { describe, expect, it } from 'vitest';
import { autoMap, buildPreview, toPayload } from './customerImport';
import { daysSince, sortByLastOrder } from './sales';
import { normalizeHeader } from './parsers/sheet';
import type { Customer, Profile } from '@/lib/types';

// planilha como sai de um ERP ("Pesquisa de Pessoas"): títulos fora do padrão e colunas extras
const headers = ['Cód.', 'Razão Social', 'Fantasia', 'CPF/CNPJ', 'Cidade', 'UF', 'Situação cadastral'];
const raw = [
  ['00123', 'MERCADO BOM PRECO LTDA', 'Bom Preço', '11.979.388/0001-81', 'Guarulhos', 'sp', 'Ativo'],
  ['00456', 'EMPORIO DA VILA', '', '22.333.444/0001-55', 'São Paulo', 'SP', 'Ativo'],
  ['00789', 'EMPORIO REPETIDO', '', '22.333.444/0001-55', 'São Paulo', 'SP', 'Ativo'],
  ['', 'SEM IDENTIFICACAO', '', '', '', '', ''],
];
const rows = raw.map((r) => Object.fromEntries(headers.map((h, i) => [normalizeHeader(h), r[i]])));
const lines = [2, 3, 4, 5];
const existing = [{ id: 'x1', code: '00123', cnpj: '11979388000181', name: 'MERCADO BOM PRECO', active: true, financial_discounts: [] }] as unknown as Customer[];
const sellers: Profile[] = [];

describe('importação livre de clientes', () => {
  const map = autoMap(headers, rows);
  it('reconhece colunas fora do padrão e ignora as que não conhece', () => {
    expect(map['cod']).toBe('code');
    expect(map['razao social']).toBe('name');
    expect(map['fantasia']).toBe('trade_name');
    expect(map['cpf cnpj']).toBe('cnpj');
    expect(map['uf']).toBe('state');
    expect(map['situacao cadastral']).toBe('');
  });
  it('acha a coluna de CNPJ pelo conteúdo quando o título não ajuda', () => {
    const h = ['Nome', 'Documento do cliente'];
    const r = [{ nome: 'A', 'documento do cliente': '11.979.388/0001-81' }, { nome: 'B', 'documento do cliente': '123.456.789-09' }];
    expect(autoMap(h, r)['documento do cliente']).toBe('cnpj');
  });
  it('mantém o código com zeros, aponta mudança, duplicidade e linha sem identificação', () => {
    const p = buildPreview(rows, lines, map, existing, sellers, {}, new Set());
    expect(p[0]).toMatchObject({ status: 'existente', existingId: 'x1' });
    expect(p[0].changes).toContain('nome / razão social: MERCADO BOM PRECO → MERCADO BOM PRECO LTDA');
    expect(p[1]).toMatchObject({ status: 'nova', include: true });
    expect(p[1].values.code).toBe('00456');
    expect(p[1].values.state).toBe('SP');
    expect(p[2]).toMatchObject({ status: 'duplicada', include: false });
    expect(p[3]).toMatchObject({ status: 'erro', include: false });
    expect(toPayload(p[1], true)).toMatchObject({ code: '00456', cnpj: '22333444000155', name: 'EMPORIO DA VILA', active: true });
  });
  it('o ADM corrige ou tira linhas antes de importar', () => {
    const p = buildPreview(rows, lines, map, existing, sellers, { 4: { cnpj: '33.444.555/0001-66' } }, new Set());
    expect(p[2]).toMatchObject({ status: 'nova', include: true });
    const q = buildPreview(rows, lines, map, existing, sellers, {}, new Set([3]));
    expect(q[1].include).toBe(false);
    expect(q[2]).toMatchObject({ status: 'nova', include: true }); // sem a linha 3, a 4 deixa de ser duplicada
  });
  it('código de um cliente e CNPJ de outro é divergência', () => {
    const ex = [...existing, { id: 'x2', code: '00999', cnpj: '22333444000155', name: 'OUTRO', active: true }] as unknown as Customer[];
    const p = buildPreview([{ ...rows[0], 'cpf cnpj': '22.333.444/0001-55' }], [2], map, ex, sellers, {}, new Set());
    expect(p[0]).toMatchObject({ status: 'divergente', include: false });
  });
});

describe('dias desde o último pedido', () => {
  const now = new Date(2026, 9, 13, 15, 0);
  it('conta dias corridos e zera no dia do pedido', () => {
    expect(daysSince(new Date(2026, 9, 13, 8, 0).toISOString(), now)).toBe(0);
    expect(daysSince(new Date(2026, 9, 3, 23, 0).toISOString(), now)).toBe(10);
  });
  it('ordena do maior para o menor, empate pelo nome, sem pedido à parte', () => {
    const list = [{ id: 'a', name: 'Beta' }, { id: 'b', name: 'Alfa' }, { id: 'c', name: 'Zeta' }, { id: 'd', name: 'Gama' }];
    const last = new Map([['a', new Date(2026, 9, 3).toISOString()], ['b', new Date(2026, 9, 3).toISOString()], ['c', new Date(2026, 9, 12).toISOString()]]);
    const r = sortByLastOrder(list, last, now);
    expect(r.comPedido.map((x) => `${x.c.name}:${x.days}`)).toEqual(['Alfa:10', 'Beta:10', 'Zeta:1']);
    expect(r.semPedido.map((c) => c.name)).toEqual(['Gama']);
  });
});
