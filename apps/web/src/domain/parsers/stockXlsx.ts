import * as XLSX from 'xlsx';

export interface StockRow {
  code: string;
  description: string;
  reference: string | null;
  location: number;
  quantity: number;
  unit: string | null;
}

export interface StockAggregate {
  code: string;
  description: string;
  reference: string | null;
  byLocation: Record<number, number>;
  total: number;
}

export interface StockParseResult {
  rows: StockRow[];
  /** Rows kept after the location filter, grouped by product. */
  aggregates: StockAggregate[];
  ignoredRows: number;
  sheetName: string;
  locations: number[];
}

const HEADER_HINTS = {
  code: ['codigo', 'código', 'cod'],
  reference: ['referencia', 'referência'],
  description: ['descricao do produto', 'descrição do produto', 'descricao', 'descrição'],
  location: ['local de estoque', 'local'],
  quantity: ['saldo [und estoque]', 'saldo und estoque', 'saldo'],
  unit: ['und estoque', 'und'],
};

function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumn(header: unknown[], hints: string[], fallback: number): number {
  const cells = header.map(norm);
  for (const h of hints.map(norm)) {
    const exact = cells.findIndex((c) => c === h);
    if (exact >= 0) return exact;
  }
  for (const h of hints.map(norm)) {
    const partial = cells.findIndex((c) => c.startsWith(h));
    if (partial >= 0) return partial;
  }
  return fallback;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/\./g, '').replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reads the "ESTOQUE ATUAL" workbook.
 * Column mapping follows the header row (falls back to A=code, C=description, E=location, G=balance).
 */
export function parseStockWorkbook(data: ArrayBuffer | Uint8Array, locations: number[] = [1, 5]): StockParseResult {
  const wb = XLSX.read(data, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  // Header row: first row containing something that looks like "Código" and "Local".
  let headerIdx = matrix.findIndex((r) => {
    const cells = (r ?? []).map(norm);
    return cells.some((c) => c.startsWith('cod')) && cells.some((c) => c.includes('local'));
  });
  if (headerIdx < 0) headerIdx = 0;
  const header = matrix[headerIdx] ?? [];

  const col = {
    code: findColumn(header, HEADER_HINTS.code, 0),
    reference: findColumn(header, HEADER_HINTS.reference, 1),
    description: findColumn(header, HEADER_HINTS.description, 2),
    location: findColumn(header, HEADER_HINTS.location, 4),
    quantity: findColumn(header, HEADER_HINTS.quantity, 6),
    unit: findColumn(header, HEADER_HINTS.unit, 7),
  };

  const rows: StockRow[] = [];
  let ignoredRows = 0;
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const codeRaw = r[col.code];
    const desc = r[col.description];
    if (codeRaw === null || codeRaw === undefined || String(codeRaw).trim() === '' || !desc) {
      continue; // blank / totals row
    }
    const code = String(codeRaw).replace(/\.0+$/, '').trim();
    const location = Math.trunc(toNumber(r[col.location]));
    const row: StockRow = {
      code,
      description: String(desc).replace(/\s+/g, ' ').trim(),
      reference: r[col.reference] ? String(r[col.reference]).trim() : null,
      location,
      quantity: toNumber(r[col.quantity]),
      unit: r[col.unit] ? String(r[col.unit]).trim() : null,
    };
    if (!locations.includes(location)) {
      ignoredRows++;
      continue;
    }
    rows.push(row);
  }

  const map = new Map<string, StockAggregate>();
  for (const r of rows) {
    let agg = map.get(r.code);
    if (!agg) {
      agg = { code: r.code, description: r.description, reference: r.reference, byLocation: {}, total: 0 };
      map.set(r.code, agg);
    }
    agg.byLocation[r.location] = (agg.byLocation[r.location] ?? 0) + r.quantity;
    agg.total += r.quantity;
  }

  return {
    rows,
    aggregates: [...map.values()].sort((a, b) => a.description.localeCompare(b.description)),
    ignoredRows,
    sheetName,
    locations,
  };
}
