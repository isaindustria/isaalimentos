/**
 * Text normalization shared by the product matcher and the alias table.
 * Turns "HF.TEMPERO P/FRANGO ISA" and "TEMPERO PARA FRANGO - ISA - 80g - CX 48"
 * into comparable token sets.
 */

const SYNONYMS: Record<string, string> = {
  DEFUM: 'DEFUMADO',
  DEFUMADA: 'DEFUMADO',
  LIMON: 'LEMON',
  LIMAO: 'LEMON',
  PEPER: 'PEPPER',
  PIMENTAS: 'PIMENTA',
  ERVA: 'ERVAS',
  FINA: 'FINAS',
  PREMIUN: 'PREMIUM',
  GUEDES: 'EDU', // "TEMPERO EDU GUEDES" == "TEMPERO DO EDU"
  FUNCIONA: 'FUNCIONAL',
  SODIO: 'SODIO',
  CARNES: 'CARNE',
  FRANGOS: 'FRANGO',
  LEGUME: 'LEGUMES',
  TEMP: 'TEMPERO',
  C: 'COM',
  S: 'SEM',
  P: 'PARA',
};

/** Words that carry no meaning for product identity. */
const STOPWORDS = new Set([
  'HF', 'ISA', 'CX', 'CXA', 'PT', 'POTE', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'PARA', 'A', 'O',
  'TEMPERO', 'TEMPEROS', 'IND', 'ALIMENTOS', 'LTDA', 'UN', 'UND', 'X',
]);

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Upper-case, accent-free, punctuation-free text with weight/box specs removed. */
export function normalizeText(input: string): string {
  let s = stripAccents(String(input ?? '')).toUpperCase();
  s = s.replace(/\bCX\s*\d+\b/g, ' '); // "CX 48"
  s = s.replace(/\bCXA\s+\d+\s*X\s*\d+\s*\d*\s*G?\b/g, ' '); // "CXA 1 X 48 40G"
  s = s.replace(/\b\d+([.,]\d+)?\s*(G|GR|KG|ML|L)\b/g, ' '); // "60g"
  s = s.replace(/\b\d{3,6}-\d{2,4}\b/g, ' '); // client codes "10081-124"
  s = s.replace(/[\/]/g, ' / ');
  s = s.replace(/[^A-Z0-9 /]/g, ' ');
  s = s.replace(/\bC\s*\/\s*/g, 'COM ').replace(/\bS\s*\/\s*/g, 'SEM ').replace(/\bP\s*\/\s*/g, 'PARA ');
  s = s.replace(/\//g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Meaningful tokens (synonyms applied, stopwords removed), stable order, deduplicated. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  for (const raw of normalizeText(input).split(' ')) {
    if (!raw) continue;
    const t = SYNONYMS[raw] ?? raw;
    if (STOPWORDS.has(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Canonical key used for alias lookups by description. */
export function normalizedKey(input: string): string {
  return tokenize(input).join(' ');
}
