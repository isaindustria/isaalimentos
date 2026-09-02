/**
 * Parser for the "Pedido de Compra" PDF (report CCPMERM02).
 * Works on positioned text rows (see pdfText.ts) so it is independent from pdf.js in tests.
 */

export interface TextCell {
  x: number;
  str: string;
}
export interface TextRow {
  y: number;
  cells: TextCell[];
}
export interface PdfPageText {
  page: number;
  rows: TextRow[];
}

export interface ParsedOrderItem {
  seq: number | null;
  clientCode: string | null;
  description: string;
  packaging: string | null;
  deliveryDate: string | null; // ISO yyyy-mm-dd
  quantityBoxes: number;
  unitsPerBox: number;
  unitPrice: number | null;
  totalPrice: number | null;
  weightKg: number | null;
  page: number;
}

export interface ParsedOrder {
  orderNumber: string | null;
  orderDate: string | null; // ISO
  deliveryCnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
  buyer: string | null;
  paymentTerms: string | null;
  supplier: string | null;
  totalValue: number | null;
  totalWeight: number | null;
  items: ParsedOrderItem[];
  pages: number[];
}

export interface ParsedOrderFile {
  orders: ParsedOrder[];
  warnings: string[];
}

const COLUMN_NAMES = ['Seq', 'Código', 'Descrição', 'Embalagem', 'Pr. F', 'Dt Entr', 'Qtde', 'Vlr. Unit', 'I.P.I.', 'Peso Kg', 'Plt'];

export function parseBrNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const clean = s.replace(/\./g, '').replace(',', '.').trim();
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

export function parseBrDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2]}-${m[1]}`;
}

function rowText(row: TextRow): string {
  return row.cells
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((c) => c.str)
    .join('  ');
}

function unitsFromPackaging(pack: string | null): number {
  if (!pack) return 48;
  const m = pack.match(/(\d+)\s*X\s*(\d+)/i);
  if (m) return Number(m[1]) * Number(m[2]);
  const m2 = pack.match(/CX\s*(\d+)/i);
  return m2 ? Number(m2[1]) : 48;
}

interface Columns {
  [name: string]: number;
}

function detectColumns(rows: TextRow[]): { columns: Columns; headerY: number } | null {
  for (const row of rows) {
    const names = row.cells.map((c) => c.str.trim());
    if (names.includes('Seq') && names.some((n) => n.startsWith('Descri')) && names.includes('Qtde')) {
      const columns: Columns = {};
      for (const c of row.cells) {
        const n = c.str.trim();
        const key = COLUMN_NAMES.find((k) => n === k || n.startsWith(k.replace(/[^\w]/g, '').slice(0, 5)));
        if (key) columns[key] = c.x;
        if (n.startsWith('Descri')) columns['Descrição'] = c.x;
        if (n.startsWith('C') && n.endsWith('digo')) columns['Código'] = c.x;
      }
      return { columns, headerY: row.y };
    }
  }
  return null;
}

/** Assigns a cell to the right-most column whose header starts at or before the cell (small tolerance). */
function columnOf(x: number, columns: Columns): string | null {
  let best: string | null = null;
  let bestX = -Infinity;
  for (const [name, cx] of Object.entries(columns)) {
    if (cx <= x + 4 && cx > bestX) {
      best = name;
      bestX = cx;
    }
  }
  return best;
}

function parseItemRow(row: TextRow, columns: Columns, page: number): ParsedOrderItem | null {
  const cells = row.cells.slice().sort((a, b) => a.x - b.x);
  const grouped: Record<string, string[]> = {};
  for (const c of cells) {
    const col = columnOf(c.x, columns);
    if (!col) continue;
    (grouped[col] ??= []).push(c.str.trim());
  }
  const seqStr = grouped['Seq']?.join('') ?? '';
  const code = grouped['Código']?.join('') ?? '';
  const description = (grouped['Descrição'] ?? []).join(' ').replace(/\s+/g, ' ').trim();
  if (!/^\d+$/.test(seqStr) || !description) return null;
  if (!/^\d{3,6}-\d{2,4}$/.test(code) && !/^\d{4,}$/.test(code)) return null;

  const packaging = grouped['Embalagem']?.join(' ') ?? null;
  const qty = parseBrNumber(grouped['Qtde']?.[0]) ?? 0;
  const unitPrice = parseBrNumber(grouped['Vlr. Unit']?.[0]);
  const weight = parseBrNumber(grouped['Peso Kg']?.[0]);
  const unitsPerBox = unitsFromPackaging(packaging);
  return {
    seq: Number(seqStr),
    clientCode: code || null,
    description,
    packaging,
    deliveryDate: parseBrDate(grouped['Dt Entr']?.[0]),
    quantityBoxes: qty,
    unitsPerBox,
    unitPrice,
    totalPrice: unitPrice !== null ? Math.round(unitPrice * qty * 100) / 100 : null,
    weightKg: weight,
    page,
  };
}

function emptyOrder(): ParsedOrder {
  return {
    orderNumber: null,
    orderDate: null,
    deliveryCnpj: null,
    address: null,
    city: null,
    state: null,
    cep: null,
    buyer: null,
    paymentTerms: null,
    supplier: null,
    totalValue: null,
    totalWeight: null,
    items: [],
    pages: [],
  };
}

function parseHeader(rows: TextRow[], order: ParsedOrder) {
  const texts = rows.map(rowText);
  for (let i = 0; i < rows.length; i++) {
    const t = texts[i];
    const ped = t.match(/Pedido:\s*(\d{4,})(?!\d|[.,])/);
    if (ped && !order.orderNumber && !t.includes('TOTAIS')) order.orderNumber = ped[1];
    const dt = t.match(/Dt Elab:\s*(\d{2}\/\d{2}\/\d{4})/);
    if (dt && !order.orderDate) order.orderDate = parseBrDate(dt[1]);
    const cnpj = t.match(/Local de Entrega:\s*([\d./-]{14,20})/);
    if (cnpj && !order.deliveryCnpj) {
      order.deliveryCnpj = cnpj[1];
      // Address is the first left-aligned cell of the two following rows.
      const next = rows[i + 1];
      const after = rows[i + 2];
      const left = (r?: TextRow) =>
        r?.cells
          .slice()
          .sort((a, b) => a.x - b.x)
          .find((c) => c.x < 60)?.str.trim() ?? null;
      if (next && !order.address) order.address = left(next);
      if (after && !order.city) {
        const cityLine = left(after);
        const m = cityLine?.match(/^(.*?)\s*-\s*([A-Z]{2})$/);
        if (m) {
          order.city = m[1].trim();
          order.state = m[2];
        } else order.city = cityLine;
        const cep = texts[i + 2].match(/CEP:\s*([\d-]+)/);
        if (cep) order.cep = cep[1];
      }
    }
    const comp = t.match(/Comprador:\s*(.+?)(\s{2,}|$)/);
    if (comp && !order.buyer) order.buyer = comp[1].trim();
    const prazo = t.match(/Prazos de Pgto:\s*(\S+)/);
    if (prazo && !order.paymentTerms) order.paymentTerms = prazo[1];
    const forn = t.match(/Fornecedor:\s*(.+?)(\s{2,}|$)/);
    if (forn && !order.supplier) order.supplier = forn[1].trim();
    const tot = t.match(/TOTAIS:.*Pedido:\s*([\d.,]+)/);
    if (tot) order.totalValue = parseBrNumber(tot[1]);
    const peso = t.match(/TOTAIS:.*Peso:\s*([\d.,]+)/);
    if (peso) order.totalWeight = parseBrNumber(peso[1]);
  }
}

/** Groups pages into orders (an order can span several pages; same "Pedido" number). */
export function parseOrderPages(pages: PdfPageText[]): ParsedOrderFile {
  const warnings: string[] = [];
  const orders: ParsedOrder[] = [];
  let current: ParsedOrder | null = null;
  let lastColumns: Columns | null = null;

  for (const page of pages) {
    const head = emptyOrder();
    parseHeader(page.rows, head);
    if (!head.orderNumber) {
      warnings.push(`Página ${page.page}: número do pedido não encontrado.`);
    }
    if (!current || (head.orderNumber && head.orderNumber !== current.orderNumber)) {
      current = head;
      orders.push(current);
    } else {
      // continuation page: keep totals from the latest page
      if (head.totalValue !== null) current.totalValue = head.totalValue;
      if (head.totalWeight !== null) current.totalWeight = head.totalWeight;
    }
    current.pages.push(page.page);

    let detected = detectColumns(page.rows);
    if (detected) lastColumns = detected.columns;
    else if (lastColumns) detected = { columns: lastColumns, headerY: -Infinity };
    if (!detected) {
      warnings.push(`Página ${page.page}: cabeçalho de itens não encontrado.`);
      continue;
    }
    const totalsRow = page.rows.find((r) => rowText(r).includes('TOTAIS:'));
    for (const row of page.rows) {
      if (row.y <= detected.headerY + 2) continue;
      if (totalsRow && row.y >= totalsRow.y) break;
      const item = parseItemRow(row, detected.columns, page.page);
      if (item) {
        if (!item.quantityBoxes) warnings.push(`Pedido ${current.orderNumber ?? '?'} item ${item.seq}: quantidade vazia.`);
        current.items.push(item);
      }
    }
  }

  for (const o of orders) {
    if (!o.items.length) warnings.push(`Pedido ${o.orderNumber ?? '?'}: nenhum item lido.`);
  }
  return { orders, warnings };
}

/** Sum boxes per (clientCode|description) across all stores – used in previews. */
export function consolidateItems(orders: ParsedOrder[]) {
  const map = new Map<string, { key: string; clientCode: string | null; description: string; boxes: number; units: number; lines: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.clientCode ?? it.description;
      const cur = map.get(key) ?? { key, clientCode: it.clientCode, description: it.description, boxes: 0, units: 0, lines: 0 };
      cur.boxes += it.quantityBoxes;
      cur.units += it.quantityBoxes * it.unitsPerBox;
      cur.lines += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.description.localeCompare(b.description));
}
