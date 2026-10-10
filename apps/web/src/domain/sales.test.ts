import { describe, expect, it } from 'vitest';
import { cnpjDigits, fmtCnpj, orderTotals, parseDiscounts, quantityError, saleUnitFor } from './sales';

describe('vendas', () => {
  it('CNPJ: pontuação ignorada e zeros à esquerda preservados', () => {
    expect(cnpjDigits('01.234.567/0001-89')).toBe('01234567000189');
    expect(cnpjDigits('1234567000189')).toBe('01234567000189');
    expect(fmtCnpj('1234567000189')).toBe('01.234.567/0001-89');
    expect(cnpjDigits('123')).toBe('123');
  });
  it('unidade de venda pela referência, sem diferenciar maiúsculas, espaços e pontos', () => {
    expect(saleUnitFor('ANDER')).toBe('kg');
    expect(saleUnitFor(' Isa ')).toBe('kg');
    expect(saleUnitFor('Pote  Temp.')).toBe('un');
    expect(saleUnitFor('pote frut.')).toBe('un');
    expect(saleUnitFor('Revenda')).toBe('un');
    expect(saleUnitFor('SACARIA')).toBeNull();
    expect(saleUnitFor('')).toBeNull();
  });
  it('descontos do cadastro', () => {
    expect(parseDiscounts('nenhum').values).toEqual([]);
    expect(parseDiscounts('3%;1%').values).toEqual([3, 1]);
    expect(parseDiscounts('1,5 %').values).toEqual([1.5]);
    expect(parseDiscounts('abc').error).toMatch(/inválido/);
  });
  it('quantidade por unidade de venda', () => {
    expect(quantityError(10.5, 'kg')).toBeNull();
    expect(quantityError(10.5, 'un')).toMatch(/inteiro/);
    expect(quantityError(0, 'kg')).toMatch(/maior que zero/);
    expect(quantityError(1.2345, 'kg')).toMatch(/3 casas/);
  });
  it('totais: 10 kg × R$ 6,60 com 3% de desconto', () => {
    const t = orderTotals([{ quantity: 10, unit_price: 6.6 }, { quantity: 3, unit_price: 1.333 }], 3);
    expect(t.lineTotals).toEqual([66, 4]);
    expect(t.subtotal).toBe(70);
    expect(t.discount).toBe(2.1);
    expect(t.total).toBe(67.9);
  });
});
