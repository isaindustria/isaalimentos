import { describe, expect, it } from 'vitest';
import { montarEntrada, pendencias, type NfeEmitente } from './nfe';
import type { Customer, Order, OrderItem, Product } from '@/lib/types';

const emit = { id: 1, cnpj: '55.747.709/0001-47', razao_social: 'ISA IND', nome_fantasia: 'ISA', ie: '123456789110', crt: 1, logradouro: 'Rua A', numero: '57', complemento: null, bairro: 'Centro', municipio: 'Itaquaquecetuba', municipio_ibge: '3523107', uf: 'SP', cep: '08595-000', fone: null, ambiente: 2, serie: 1, proximo_numero_homologacao: 1, proximo_numero_producao: 1, nat_op: 'Venda', cfop_dentro: '5101', cfop_fora: '6101', csosn: '102', cst_icms: '00', aliq_icms: 18, pis_cst: '99', pis_aliq: 0, cofins_cst: '99', cofins_aliq: 0, mod_frete: 9, t_pag: '15', ind_pres: 9, desconto_na_nota: true, inf_cpl: null, resp_tec_cnpj: null, resp_tec_contato: null, resp_tec_email: null, resp_tec_fone: null } as NfeEmitente;
const cust = { id: 'c', name: 'Mercado', cnpj: '11979388000181', address: 'Av B', address_number: '10', district: 'Centro', city: 'Guarulhos', state: 'SP', cep: '07000000', city_ibge: '3518800', ind_ie_dest: 1, ie: '111' } as Customer;
const prods = new Map<string, Product>([['A', { code: 'A', description: 'TEMPERO', ncm: '21039021' } as Product], ['B', { code: 'B', description: 'AMEIXA', ncm: '08132000' } as Product]]);
const order = { id: 'o', order_number: '4580', status: 'aberto', discount_value: 46.62, discount_pct: 3, seller_name: 'Paula' } as Order;
const items = [
  { product_code: 'A', product_name: 'TEMPERO', sale_unit: 'kg', quantity: 10, unit_price: 6.6 },
  { product_code: 'B', product_name: 'AMEIXA', sale_unit: 'un', quantity: 120, unit_price: 12.4 },
] as OrderItem[];

describe('NF-e a partir do pedido', () => {
  it('sem pendências quando o cadastro está completo', () => {
    expect(pendencias(order, items, cust, prods, emit)).toEqual([]);
  });
  it('aponta o que falta', () => {
    const p = pendencias(order, items, { ...cust, city_ibge: null, ie: null }, new Map([['A', { code: 'A', description: 'X', ncm: null } as Product]]), emit);
    expect(p.join(' | ')).toMatch(/IBGE/);
    expect(p.join(' | ')).toMatch(/inscrição estadual/);
    expect(p.join(' | ')).toMatch(/NCM/);
    expect(p.join(' | ')).toMatch(/B não está no cadastro/);
  });
  it('rateia o desconto financeiro e fecha no total do pedido', () => {
    const n = montarEntrada(order, items, cust, prods, emit, { serie: 1, numero: 7 });
    const desc = n.itens.reduce((s, i) => s + i.vDesc, 0);
    expect(Math.round(desc * 100) / 100).toBe(46.62);
    expect(n.itens[0]).toMatchObject({ uCom: 'KG', qCom: 10, CFOP: '5101', CSOSN: '102' });
    expect(n.itens[1]).toMatchObject({ uCom: 'UN', qCom: 120 });
    expect(n.infCpl).toBe('Pedido 4580 - Vendedor Paula');
  });
  it('fora do estado usa o CFOP interestadual', () => {
    const n = montarEntrada(order, items, { ...cust, state: 'MG' }, prods, emit, { serie: 1, numero: 8 });
    expect(n.itens[0].CFOP).toBe('6101');
  });
});
