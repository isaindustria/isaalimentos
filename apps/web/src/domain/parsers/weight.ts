/**
 * Extrai o peso embutido na descricao do produto acabado (ERP da fabrica).
 * Exemplos: "CALDO DE CARNE - 25 KG - ANDER" -> 25; "VINAGRETE - 2,5 KG - ISA" -> 2.5;
 * "CHIMICHURRI DEFUMADO - ISA - 50g - CX 48" -> 0.05; "CANELA MOIDA -10 KG - ANDER" -> 10;
 * "BICARBONATO DE SODIO - ISA 25 KG" -> 25. Sem peso -> null.
 */
export interface ParsedDescription {
  /** Peso em quilos (g convertido), ou null quando a descricao nao traz peso. */
  weightKg: number | null;
  /** Texto exatamente como veio ("2,5 KG", "50g"). */
  weightText: string | null;
  /** Unidades por caixa quando a descricao traz "CX 48". */
  unitsPerBox: number | null;
  /** Marca/linha no fim da descricao (ISA, ANDER). */
  brand: string | null;
  /** Descricao sem o peso, sem "CX 48" e sem a marca: "CALDO DE CARNE". */
  name: string;
}

const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i;
const BOX_RE = /\bcx\s*(\d+)\b/i;
const BRAND_RE = /\b(ISA|ANDER)\b/i;

export function parseProductDescription(description: string): ParsedDescription {
  const desc = description.replace(/\s+/g, ' ').trim();
  const w = desc.match(WEIGHT_RE);
  let weightKg: number | null = null;
  let weightText: string | null = null;
  if (w) {
    const n = Number(w[1].replace(',', '.'));
    weightKg = w[2].toLowerCase() === 'g' ? n / 1000 : n;
    weightText = w[0].trim();
  }
  const b = desc.match(BOX_RE);
  const unitsPerBox = b ? Number(b[1]) : null;
  const br = desc.match(BRAND_RE);
  const brand = br ? br[1].toUpperCase() : null;

  let name = desc;
  if (w) name = name.replace(w[0], ' ');
  if (b) name = name.replace(b[0], ' ');
  if (br) name = name.replace(new RegExp(`\\b${br[1]}\\b`, 'i'), ' ');
  name = name
    .replace(/\s*[-–]\s*/g, ' - ')
    .replace(/(\s-\s)+/g, ' - ')
    .replace(/^\s*-\s*|\s*-\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { weightKg, weightText, unitsPerBox, brand, name };
}
