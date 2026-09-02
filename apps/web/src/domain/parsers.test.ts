import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseStockWorkbook } from './parsers/stockXlsx';
import { parseOrderPages, consolidateItems } from './parsers/orderPdf';
import { extractRows } from './parsers/pdfText';
import { matchProduct } from './matching';
import { computeProduction } from './production';

const SAMPLES = path.resolve(__dirname, '../../../../automatizando processos_');
const XLSX_FILE = path.join(SAMPLES, 'ESTOQUE ATUAL 02.09.2026.XLSX');
const PDF_FILE = path.join(SAMPLES, 'pedido tempero isa 01.09.26.pdf');
const hasSamples = existsSync(XLSX_FILE) && existsSync(PDF_FILE);

describe.skipIf(!hasSamples)('parsers against real files', () => {
  it('reads the stock workbook, keeps locations 1 and 5 and sums them per product', () => {
    const res = parseStockWorkbook(readFileSync(XLSX_FILE));
    expect(res.aggregates.length).toBe(45);
    const alho = res.aggregates.find((a) => a.code === '512')!;
    expect(alho.byLocation[1]).toBe(3651);
    expect(alho.byLocation[5]).toBe(0);
    expect(alho.total).toBe(3651);
    const amaciante = res.aggregates.find((a) => a.code === '513')!;
    expect(amaciante.total).toBe(48 + 466);
    const total = res.aggregates.reduce((s, a) => s + a.total, 0);
    expect(total).toBe(68239);
  });

  it('parses every store order from the PDF', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(PDF_FILE));
    const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const pages = await extractRows(pdf as never, pdfjs.Util.transform as never);
    const parsed = parseOrderPages(pages);

    expect(parsed.orders.length).toBe(10);
    const first = parsed.orders[0];
    expect(first.orderNumber).toBe('223563');
    expect(first.deliveryCnpj).toBe('75.315.333/0046-00');
    expect(first.orderDate).toBe('2026-09-01');
    expect(first.city).toBe('SANTOS');
    expect(first.state).toBe('SP');
    expect(first.totalValue).toBe(36792);
    expect(first.items.length).toBe(21);
    expect(first.items[0]).toMatchObject({ seq: 1, clientCode: '10056-187', quantityBoxes: 5, unitsPerBox: 48 });
    expect(first.items[9]).toMatchObject({ clientCode: '10756-113', quantityBoxes: 30 });

    // Each order total must equal the sum of its lines (qty x unit price).
    for (const o of parsed.orders) {
      const sum = o.items.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
      expect(Math.round(sum * 100) / 100).toBe(o.totalValue);
    }

    const consolidated = consolidateItems(parsed.orders);
    expect(consolidated.length).toBeGreaterThan(20);

    // Fuzzy matching should resolve most lines and flag the ambiguous ones.
    const stock = parseStockWorkbook(readFileSync(XLSX_FILE));
    const products = stock.aggregates.map((a) => ({ code: a.code, description: a.description }));
    const results = consolidated.map((c) => ({ c, m: matchProduct({ clientCode: c.clientCode, description: c.description }, products) }));
    const auto = results.filter((r) => r.m.status === 'auto');
    const flagged = results.filter((r) => r.m.status !== 'auto');
    expect(auto.length).toBeGreaterThanOrEqual(results.length * 0.6);
    // "HF.CHIMICHURRI ISA" could be 3 products -> must be flagged, never auto.
    const chimi = results.find((r) => r.c.description === 'HF.CHIMICHURRI ISA');
    expect(chimi?.m.status).not.toBe('auto');
    // Obvious ones resolve.
    const frango = results.find((r) => r.c.description.includes('P/FRANGO'));
    expect(frango?.m.productCode).toBe('598');
    const pega = results.find((r) => r.c.description.includes('PEGA MARIDO'));
    expect(pega?.m.productCode).toBe('600');
    expect(flagged.every((r) => r.m.candidates.length > 0 || r.m.status === 'not_found')).toBe(true);

    // Production need per matched product.
    const demand = results
      .filter((r) => r.m.productCode)
      .map((r) => ({ productCode: r.m.productCode!, units: r.c.units, boxes: r.c.boxes }));
    const rows = computeProduction(
      stock.aggregates.map((a) => ({ code: a.code, description: a.description, location_1: a.byLocation[1] ?? 0, location_5: a.byLocation[5] ?? 0, total: a.total })),
      demand,
    );
    expect(rows.length).toBe(45);
    for (const r of rows) {
      expect(r.need).toBe(Math.max(0, r.ordered - r.stockTotal));
      expect(r.remaining).toBe(Math.max(0, r.stockTotal - r.ordered));
    }
  }, 30000);
});
