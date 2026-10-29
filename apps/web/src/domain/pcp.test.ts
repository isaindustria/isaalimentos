import { describe, expect, it } from 'vitest';
import { chaveNome, compararFormulas, lerFormulas, planejarProducao, vincularProduto, type Formula } from './pcp';
import type { PlanItem, PlanProduct } from './planejamento';

const prods: Array<PlanProduct & { is_semi?: boolean }> = [
  { code: '464', description: 'CALDO DE COSTELA - 10 KG - ANDER', reference: 'ANDER SACARIA', weight_g: null, equivalence_kg: 10, semi_code: '424' },
  { code: '468', description: 'COLORAU EXTRA - 10 KG - ANDER', reference: 'ANDER SACARIA', weight_g: null, equivalence_kg: 10, semi_code: '425' },
  { code: '424', description: 'MP CALDO DE COSTELA - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, is_semi: true },
  { code: '425', description: 'MP COLORAU EXTRA - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, is_semi: true },
  { code: '400', description: 'MP CURCUMA MOIDA - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, is_semi: true },
  { code: '426', description: 'MP URUCUM MOIDO - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, is_semi: true },
];
const pmap = new Map(prods.map((p) => [p.code, p]));

const formulas: Formula[] = [
  { code: 282, description: 'CALDO DE COSTELA  ANDER 10 KG', product_code: '464', min_production_kg: 70, items: [{ input_code: '424', input_description: null, unit: 'KG', qty: 10 }] },
  { code: 286, description: 'COLORAU EXTRA ANDER 10 KG', product_code: '468', min_production_kg: 100, items: [{ input_code: '425', input_description: null, unit: 'KG', qty: 10 }] },
  { code: 245, description: 'CALDO DE COSTELA  ANDER - SEMI ACABADO', product_code: '424', min_production_kg: null, items: [
    { input_code: '275', input_description: 'MP SAL REFINADO', unit: 'KG', qty: 0.6555 },
    { input_code: '425', input_description: 'MP COLORAU EXTRA - SEMI ACABADO - ANDER', unit: 'KG', qty: 0.0225 },
    { input_code: '400', input_description: 'MP CURCUMA MOIDA - SEMI ACABADO - ANDER', unit: 'KG', qty: 0.0009 },
  ] },
  { code: 246, description: 'COLORAU EXTRA  ANDER - SEMI ACABADO', product_code: '425', min_production_kg: 25, items: [{ input_code: '426', input_description: null, unit: 'KG', qty: 0.098 }] },
];

const item = (id: string, code: string, kg: number, date: string, num: string): PlanItem => ({
  itemId: id, orderId: 'o' + id, orderNumber: num, customer: 'C', productCode: code, productName: null, reference: null,
  saleUnit: 'kg', quantity: kg, quantityUnits: null, weightKg: null, deliveryDate: date, createdAt: '2026-10-01', allowSwap: false, stage: 'aberto',
});

describe('ligação da fórmula ao produto pelo nome', () => {
  it('ignora MP, SEMI ACABADO, a caixa e a ordem das palavras', () => {
    expect([...chaveNome('MP CALDO DE COSTELA - SEMI ACABADO - ANDER')].sort()).toEqual([...chaveNome('CALDO DE COSTELA  ANDER - SEMI ACABADO')].sort());
    expect(vincularProduto('CALDO DE COSTELA  ANDER - SEMI ACABADO', prods)).toBe('424');
    expect(vincularProduto('CALDO DE COSTELA  ANDER 10 KG', prods)).toBe('464');
    expect(vincularProduto('NADA PARECIDO ISA 1 KG', prods)).toBeNull();
  });
});

describe('planilha de fórmulas', () => {
  it('lê as fórmulas e a produção mínima (maior valor da fórmula)', () => {
    const m: unknown[][] = [
      ['TERA UM BOTAO'], [],
      ['Cód Fórmula', 'Descrição da Fórmula', 'Cód do Insumo', 'Descrição do Insumo', 'Cód Unidade', 'Qtd Unitária Prevista', 'PRODUÇ. MINIMA '],
      [246, 'COLORAU EXTRA  ANDER - SEMI ACABADO', 9, 'MP CORANTE', 'KG', 0.002, 0],
      [246, 'COLORAU EXTRA  ANDER - SEMI ACABADO', 426, 'MP URUCUM', 'KG', 0.098, 25],
      [282, 'CALDO DE COSTELA  ANDER 10 KG', 424, 'MP CALDO', 'KG', 10, 70],
    ];
    const { formulas: f } = lerFormulas(m);
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ code: 246, min_production_kg: 25 });
    expect(f[0].items.map((i) => i.input_code)).toEqual(['9', '426']);
  });
  it('mostra o que muda antes de importar', () => {
    const d = compararFormulas(formulas, [{ ...formulas[3], items: [{ input_code: '426', input_description: null, unit: 'KG', qty: 0.1 }] }], 'substituir');
    expect(d.alteradas[0].mudancas).toEqual(['insumo 426: 0.098 → 0.1']);
    expect(d.removidas.map((f) => f.code)).toEqual([282, 286, 245]);
  });
});

describe('cálculo da aba Produção (exemplo da planilha)', () => {
  const estoque = new Map([['464', { l1: 8, l2: 0, l5: 0 }], ['400', { l1: 0, l2: 134.199, l5: 0 }]]);
  const r = planejarProducao([item('a', '464', 1000, '2026-10-30', '14'), item('b', '468', 150, '2026-11-05', '15')], pmap, formulas, estoque);

  it('estoque do acabado atende primeiro; só a falta vai para a produção', () => {
    expect(r.acabados.find((a) => a.item.itemId === 'a')).toMatchObject({ atendidoKg: 80, faltaKg: 920, atendido: false });
  });
  it('soma o semiacabado vindo de outro semiacabado e fica na data mais próxima', () => {
    const costela = r.producao.find((l) => l.code === '424')!;
    expect(costela).toMatchObject({ pedidoKg: 920, estoqueKg: 0, necessidadeKg: -920, produzirKg: 920 });
    const colorau = r.producao.find((l) => l.code === '425')!;
    // 150 kg do pedido 468 + 920 × 0,0225 = 20,7 kg do caldo de costela
    expect(colorau.pedidoKg).toBe(170.7);
    expect(colorau.earliest).toBe('2026-10-30');
    expect(colorau.itemIds.sort()).toEqual(['a', 'b']);
  });
  it('semiacabado com estoque suficiente não pede produção', () => {
    const curcuma = r.producao.find((l) => l.code === '400')!;
    expect(curcuma.necessidadeKg).toBeGreaterThan(0);
    expect(curcuma.produzirKg).toBe(0);
  });
  it('produção mínima vale quando a falta é menor; sem mínimo, produz a falta', () => {
    const urucum = r.producao.find((l) => l.code === '426')!;
    expect(urucum.produzirKg).toBe(urucum.pedidoKg); // 426 sem fórmula e sem mínimo
    const r2 = planejarProducao([item('c', '468', 100, '2026-11-01', '16')], pmap, formulas, new Map([['425', { l1: 0, l2: 90, l5: 0 }]]));
    expect(r2.producao.find((l) => l.code === '425')).toMatchObject({ necessidadeKg: -10, produzirKg: 25 });
  });
  it('o mesmo saldo não atende dois pedidos', () => {
    const r3 = planejarProducao([item('x', '464', 50, '2026-10-30', '1'), item('y', '464', 50, '2026-10-31', '2')], pmap, formulas, new Map([['464', { l1: 8, l2: 0, l5: 0 }]]));
    expect(r3.acabados.map((a) => [a.item.itemId, a.atendido, a.faltaKg])).toEqual([['x', true, 0], ['y', false, 20]]);
  });
});
