import { describe, expect, it } from 'vitest';
import { planejar, type PlanItem, type PlanProduct } from './planejamento';

const prods = new Map<string, PlanProduct>([
  ['471', { code: '471', description: 'PAPRICA DEFUMADA - 10 KG - ANDER', reference: 'ANDER SACARIA', weight_g: 10000, equivalence_kg: 10, semi_code: '429', alt_code: '264' }],
  ['264', { code: '264', description: 'PAPRICA DEFUMADA - 5 KG - ANDER', reference: 'ANDER SACARIA', weight_g: 5000, equivalence_kg: 5, semi_code: '429' }],
  ['429', { code: '429', description: 'MP PAPRICA DEFUMADA - SEMI ACABADO - ANDER', reference: 'SEMIACABADO', weight_g: null, equivalence_kg: 1, min_production_kg: 50, is_semi: true }],
  ['900', { code: '900', description: 'ALHO FRESCO CX 10KG', reference: 'REVENDA', weight_g: 10000 }],
]);
let n = 0;
const item = (code: string, kg: number, entrega: string, extra: Partial<PlanItem> = {}): PlanItem => ({
  itemId: `i${++n}`, orderId: `o${n}`, orderNumber: String(n), customer: 'X', productCode: code, productName: null, reference: null,
  saleUnit: 'kg', quantity: kg, quantityUnits: null, weightKg: null, deliveryDate: entrega, createdAt: `2026-10-0${n}T10:00:00Z`, allowSwap: false, stage: 'aberto', ...extra,
});

describe('necessidade de produção (exemplo do documento)', () => {
  const a = item('471', 120, '2026-10-14'), b = item('264', 5, '2026-10-16'), c = item('471', 30, '2026-10-20'), d = item('900', 20, '2026-10-15');
  const { rows, routes } = planejar([c, b, a, d], prods, new Map([['471', 2], ['264', 1], ['429', 100]]));
  it('471: 150 kg − 20 kg de estoque − 100 kg de semiacabado = 30 kg; mínimo 50 ⇒ produzir 50', () => {
    expect(rows.find((r) => r.code === '471')).toMatchObject({ pedidoKg: 150, estoqueUn: 2, estoqueKg: 20, semiKg: 100, necessidadeKg: 30, minKg: 50, produzirKg: 50, situacao: 'produzir', earliest: '2026-10-14' });
  });
  it('264: 5 kg atendidos pelo estoque (1 × 5 kg) e o pedido vai direto para o faturamento', () => {
    expect(rows.find((r) => r.code === '264')).toMatchObject({ pedidoKg: 5, situacao: 'atendido', produzirKg: 0 });
    expect(routes.get(b.itemId)).toEqual({ fluxo: 'faturamento', motivo: 'estoque' });
  });
  it('revenda vai direto para o faturamento e não entra na produção', () => {
    expect(routes.get(d.itemId)).toEqual({ fluxo: 'faturamento', motivo: 'revenda' });
    expect(rows.find((r) => r.code === '900')).toBeUndefined();
  });
  it('itens que precisam produzir ficam na produção; prioridade pela entrega mais próxima', () => {
    expect(routes.get(a.itemId)?.fluxo).toBe('producao');
    expect(routes.get(c.itemId)?.fluxo).toBe('producao');
    expect(rows[0].code).toBe('471');
  });
  it('necessidade 70 com mínimo 50 ⇒ produz 70', () => {
    const { rows: r } = planejar([item('471', 70, '2026-10-14')], prods, new Map());
    expect(r[0]).toMatchObject({ necessidadeKg: 70, produzirKg: 70 });
  });
});

describe('produto alternativo', () => {
  it('só usa se cobrir tudo e o vendedor marcou SIM', () => {
    const x = item('471', 20, '2026-10-14', { allowSwap: true });
    const ok = planejar([x], prods, new Map([['264', 4]]));
    expect(ok.rows[0]).toMatchObject({ altUsado: true, situacao: 'atendido' });
    expect(ok.routes.get(x.itemId)?.motivo).toBe('alternativo');
    const nao = planejar([item('471', 20, '2026-10-14', { allowSwap: false })], prods, new Map([['264', 4]]));
    expect(nao.rows[0]).toMatchObject({ altUsado: false, situacao: 'produzir' });
    const parcial = planejar([item('471', 30, '2026-10-14', { allowSwap: true })], prods, new Map([['264', 4]]));
    expect(parcial.rows[0].altUsado).toBe(false);
  });
});

describe('alternativo reservado', () => {
  it('não usa o estoque do alternativo que já atende os pedidos dele', () => {
    const x = item('471', 5, '2026-10-14', { allowSwap: true }), y = item('264', 5, '2026-10-15');
    const r = planejar([x, y], prods, new Map([['264', 1]]));
    expect(r.rows.find((q) => q.code === '471')).toMatchObject({ altUn: 0, altUsado: false });
    expect(r.routes.get(y.itemId)?.motivo).toBe('estoque');
  });
});
