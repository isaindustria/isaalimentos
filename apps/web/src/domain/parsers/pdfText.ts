import type { PdfPageText, TextRow } from './orderPdf';

/**
 * Converts pdf.js text content into positioned rows (rotation-aware).
 * Kept generic so both the browser build and node tests can feed it.
 */
export interface PdfLike {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(opts: { scale: number }): { transform: number[] };
    getTextContent(): Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
  }>;
}

type Transform = (m1: number[], m2: number[]) => number[];

export async function extractRows(pdf: PdfLike, transform: Transform, rowTolerance = 3): Promise<PdfPageText[]> {
  const pages: PdfPageText[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const rows: TextRow[] = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      const t = transform(vp.transform, it.transform);
      const x = t[4];
      const y = t[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= rowTolerance);
      if (!row) {
        row = { y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ x, str: it.str });
    }
    rows.sort((a, b) => a.y - b.y);
    for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
    pages.push({ page: p, rows });
  }
  return pages;
}

/** Browser entry point: loads pdf.js lazily (with its worker) and returns positioned rows. */
export async function extractRowsFromFile(data: ArrayBuffer): Promise<PdfPageText[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  return extractRows(pdf as unknown as PdfLike, pdfjs.Util.transform as Transform);
}
