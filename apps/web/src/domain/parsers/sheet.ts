import * as XLSX from 'xlsx';

/** Generic spreadsheet reader (XLSX/XLS/CSV): first sheet, header row -> objects keyed by normalized header. */
export interface SheetResult {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string;
}

export function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function readSheet(data: ArrayBuffer | Uint8Array): SheetResult {
  const wb = XLSX.read(data, { type: 'array', raw: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  // header = first row with at least 2 non-empty cells
  const hi = Math.max(0, matrix.findIndex((r) => (r ?? []).filter((c) => String(c).trim()).length >= 2));
  const headers = (matrix[hi] ?? []).map((h) => String(h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (let i = hi + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    if (!r.some((c) => String(c ?? '').trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[normalizeHeader(h)] = String(r[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return { headers, rows, sheetName };
}

/** Picks the first matching column (by normalized aliases) from a row. */
export function pick(row: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const k = normalizeHeader(a);
    if (k in row && row[k] !== '') return row[k];
  }
  // partial match
  for (const a of aliases) {
    const k = normalizeHeader(a);
    const hit = Object.keys(row).find((key) => key.startsWith(k) || key.includes(k));
    if (hit && row[hit] !== '') return row[hit];
  }
  return '';
}

export function toNumber(v: string, fallback = 0): number {
  if (!v) return fallback;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Builds and downloads a template workbook with the given headers and one example row. */
export function templateWorkbook(headers: string[], example: string[]): Blob {
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
