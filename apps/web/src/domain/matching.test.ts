import { describe, it, expect } from 'vitest';
import { tokenize, normalizedKey } from './normalize';
import { matchProduct, similarity } from './matching';

const products = [
  { code: '504', description: 'CHIMICHURRI DEFUMADO - ISA - 50g - CX 48' },
  { code: '506', description: 'CHIMICHURRI PIMENTA - ISA - 50g - CX 48' },
  { code: '507', description: 'CHIMICHURRI SEM PIMENTA - ISA - 50g - CX 48' },
  { code: '598', description: 'TEMPERO PARA FRANGO - ISA - 80g - CX 48' },
  { code: '520', description: 'CALDO DE GALINHA - ISA - 100g - CX 48' },
  { code: '549', description: 'LIMÃO E ERVAS FINAS - ISA - 70g - CX 48' },
  { code: '546', description: 'ERVAS FINAS - ISA - 25g - CX 48' },
  { code: '550', description: 'LEMON PEPPER - ISA - 100g - CX 48' },
  { code: '551', description: 'LEMON PEPPER DEFUMADO - ISA - 100g - CX 48' },
  { code: '592', description: 'TEMPERO DO EDU - ISA - 50g - CX 48' },
  { code: '587', description: 'TEMPERO BAIANO COM PIMENTA - ISA - 60g - CX 48' },
];

describe('normalize', () => {
  it('strips accents, weights, codes and stopwords', () => {
    expect(tokenize('HF.TEMPERO P/FRANGO ISA')).toEqual(['FRANGO']);
    expect(tokenize('TEMPERO PARA FRANGO - ISA - 80g - CX 48')).toEqual(['FRANGO']);
    expect(tokenize('LIMÃO E ERVAS FINAS - ISA - 70g - CX 48')).toEqual(['LEMON', 'ERVAS', 'FINAS']);
    expect(normalizedKey('HF.LIMON ERVAS FINAS ISA')).toBe('LEMON ERVAS FINAS');
  });
});

describe('matchProduct', () => {
  it('matches unambiguous descriptions automatically', () => {
    expect(matchProduct({ description: 'HF.TEMPERO P/FRANGO ISA' }, products).productCode).toBe('598');
    expect(matchProduct({ description: 'HF.LIMON PEPPER ISA' }, products).productCode).toBe('550');
    expect(matchProduct({ description: 'HF.LEMON PEPPER DEFUM ISA' }, products).productCode).toBe('551');
    expect(matchProduct({ description: 'HF.LIMON ERVAS FINAS ISA' }, products).productCode).toBe('549');
    expect(matchProduct({ description: 'HF.TEMPERO EDU GUEDES ISA' }, products).productCode).toBe('592');
    expect(matchProduct({ description: 'HF.CHIMICHURRI PIMENTA ISA' }, products).productCode).toBe('506');
  });

  it('flags ambiguous descriptions instead of guessing', () => {
    const r = matchProduct({ description: 'HF.CHIMICHURRI ISA' }, products);
    expect(r.status).toBe('ambiguous');
    expect(r.productCode).toBeNull();
    expect(r.candidates.map((c) => c.code)).toEqual(expect.arrayContaining(['504', '506', '507']));
  });

  it('flags unknown descriptions', () => {
    const r = matchProduct({ description: 'HF.MOLHO DE TOMATE' }, products);
    expect(['not_found', 'pending']).toContain(r.status);
    expect(r.productCode).toBeNull();
  });

  it('uses learned aliases first', () => {
    const aliases = [{ product_code: '507', client_code: '10083-143', normalized: 'CHIMICHURRI' }];
    const byCode = matchProduct({ clientCode: '10083-143', description: 'HF.CHIMICHURRI ISA' }, products, aliases);
    expect(byCode).toMatchObject({ status: 'alias', productCode: '507' });
    const byText = matchProduct({ description: 'CHIMICHURRI' }, products, aliases);
    expect(byText).toMatchObject({ status: 'alias', productCode: '507' });
  });

  it('similarity tolerates small typos', () => {
    expect(similarity('CHIMICHURI PIMENTA', 'CHIMICHURRI PIMENTA - ISA - 50g')).toBeGreaterThan(0.85);
  });
});
