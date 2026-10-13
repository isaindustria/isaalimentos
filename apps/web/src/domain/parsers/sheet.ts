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

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Raw cell -> text: dates as yyyy-mm-dd, numbers with dot decimal and no thousands separator (locale-proof). */
function cellText(c: unknown): string {
  if (c instanceof Date) return isNaN(c.getTime()) ? '' : `${c.getFullYear()}-${pad2(c.getMonth() + 1)}-${pad2(c.getDate())}`;
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : '';
  return String(c ?? '').trim();
}

export function readSheet(data: ArrayBuffer | Uint8Array): SheetResult {
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  // header = first row with at least 2 non-empty cells (exports often start with a blank line)
  const hi = Math.max(0, matrix.findIndex((r) => (r ?? []).filter((c) => cellText(c)).length >= 2));
  const headers = (matrix[hi] ?? []).map((h) => cellText(h));
  const rows: Record<string, string>[] = [];
  for (let i = hi + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    if (!r.some((c) => cellText(c))) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[normalizeHeader(h)] = cellText(r[idx]);
    });
    rows.push(obj);
  }
  return { headers, rows, sheetName };
}

/**
 * Like readSheet, but every cell comes as the text Excel shows (keeps "00123" from text or custom-formatted cells).
 * Also returns the spreadsheet line number of each row, for error messages.
 */
export function readSheetText(data: ArrayBuffer | Uint8Array): SheetResult & { lines: number[] } {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  const hi = Math.max(0, matrix.findIndex((r) => (r ?? []).filter((c) => String(c ?? '').trim()).length >= 2));
  const headers = (matrix[hi] ?? []).map((h) => String(h ?? '').trim());
  const rows: Record<string, string>[] = [];
  const lines: number[] = [];
  for (let i = hi + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    if (!r.some((c) => String(c ?? '').trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[normalizeHeader(h)] = String(r[idx] ?? '').trim();
    });
    rows.push(obj);
    lines.push(i + 1);
  }
  return { headers, rows, sheetName, lines };
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

/** "1.848,908" and "2,30" (pt-BR typed) or "1848.908" (raw cell) -> number. */
export function toNumber(v: string, fallback = 0): number {
  if (!v) return fallback;
  const s = String(v).trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized.replace(/[^\d.-]/g, ''));
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

/** Planilha simples a partir de linhas (a primeira é o título). Textos ficam como texto: códigos mantêm os zeros à esquerda. */
export function exportWorkbook(rows: Array<Array<string | number | null>>, sheetName: string): Blob {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? '')));
  ws['!cols'] = (rows[0] ?? []).map((_, i) => ({ wch: Math.min(48, Math.max(10, ...rows.slice(0, 200).map((r) => String(r[i] ?? '').length + 2))) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
