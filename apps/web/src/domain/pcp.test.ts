import { describe, expect, it } from 'vitest';
import { alocarAcabados, chaveNome, compararFormulas, lerFormulas, pedidoCompleto, planejarProducao, vincularProduto, type EstoqueLocal, type Formula } from './pcp';
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

const plano = (itens: PlanItem[], est: Array<[string, EstoqueLocal]>) => {
  const e = new Map(est);
  const aloc = alocarAcabados(itens, pmap, e);
  return { aloc, ...planejarProducao([...aloc.values()], pmap, formulas, e) };
};

describe('cálculo da aba Produção (Produção 4)', () => {
  const r = plano([item('a', '464', 1000, '2026-10-30', '14'), item('b', '468', 150, '2026-11-05', '15')], [['464', { l1: 8, l2: 0, l5: 0 }], ['400', { l1: 0, l2: 134.199, l5: 0 }]]);

  it('consulta o estoque acabado antes: 100 un pedidas, 8 em estoque, faltam 92 un = 920 kg', () => {
    expect(r.aloc.get('a')).toMatchObject({ pedidoUn: 100, estoqueUn: 8, faltaUn: 92, faltaKg: 920, atendido: false });
  });
  it('usa só a fórmula do semiacabado (a do acabado é fracionamento) e mantém os pedidos de origem', () => {
    const costela = r.producao.find((l) => l.code === '424')!;
    expect(costela).toMatchObject({ formulaCode: 245, pedidoKg: 920, estoqueKg: 0, necessidadeKg: -920, produzirKg: 920 });
    expect(costela.origens.map((o) => o.orderNumber)).toEqual(['14']);
  });
  it('semiacabado dentro de semiacabado: soma com o pedido e fica na data mais próxima', () => {
    const colorau = r.producao.find((l) => l.code === '425')!;
    expect(colorau).toMatchObject({ pedidoKg: 170.7, deOutrosKg: 20.7, earliest: '2026-10-30' });
    expect(colorau.itemIds.sort()).toEqual(['a', 'b']);
    expect(colorau.usadoEm).toEqual([{ code: '424', kg: 20.7 }]);
  });
  it('semiacabado com estoque suficiente não programa fabricação', () => {
    expect(r.producao.find((l) => l.code === '400')).toMatchObject({ produzirKg: 0 });
  });
  it('o mesmo saldo não atende dois pedidos', () => {
    const x = plano([item('x', '464', 50, '2026-10-30', '1'), item('y', '464', 50, '2026-10-31', '2')], [['464', { l1: 8, l2: 0, l5: 0 }]]);
    expect([x.aloc.get('x')!.atendido, x.aloc.get('y')!.faltaUn]).toEqual([true, 2]);
  });
  it('semiacabado em estoque não é acabado: falta fracionar, sem fabricar', () => {
    const x = plano([item('z', '464', 100, '2026-10-30', '3')], [['424', { l1: 0, l2: 500, l5: 0 }]]);
    expect(x.producao.find((l) => l.code === '424')).toMatchObject({ produzirKg: 0, soFracionar: true });
  });
});

describe('lote mínimo (tabela da Produção 4)', () => {
  const casos: Array<[number, number]> = [[0, 0], [20, 50], [39.8, 50], [50, 50], [51, 51], [120, 120]];
  for (const [falta, produzir] of casos) it(`necessidade ${falta} kg, mínimo 50 kg: produz ${produzir} kg`, () => {
    const f2 = formulas.map((f) => (f.code === 246 ? { ...f, min_production_kg: 50 } : f));
    const e = new Map<string, EstoqueLocal>([['425', { l1: 0, l2: 200 - falta, l5: 0 }]]);
    const aloc = alocarAcabados([item('m', '468', 200, '2026-11-01', '9')], pmap, e);
    const l = planejarProducao([...aloc.values()], pmap, f2, e).producao.find((x) => x.code === '425')!;
    expect(l.produzirKg).toBe(produzir);
  });
});

describe('pedido completo para faturamento', () => {
  it('só libera quando todos os itens estão atendidos (revenda conta como atendido)', () => {
    const { aloc } = plano([item('p1', '464', 50, '2026-10-30', '7'), item('p2', '468', 10, '2026-10-30', '7')], [['464', { l1: 8, l2: 0, l5: 0 }]]);
    expect(pedidoCompleto([{ itemId: 'p1', revenda: false, faturado: false }, { itemId: 'p2', revenda: false, faturado: false }], aloc)).toBe(false);
    expect(pedidoCompleto([{ itemId: 'p1', revenda: false, faturado: false }, { itemId: 'r', revenda: true, faturado: false }], aloc)).toBe(true);
  });
});
