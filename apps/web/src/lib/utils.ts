import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtInt = (n: number | null | undefined) => intFmt.format(Number(n ?? 0));
export const fmtDec = (n: number | null | undefined) => decFmt.format(Number(n ?? 0));
export const fmtBRL = (n: number | null | undefined) => brl.format(Number(n ?? 0));
export const fmtPct = (n: number | null | undefined) => `${Math.round(Number(n ?? 0) * 100)}%`;

export function fmtDate(value: string | Date | null | undefined, pattern = 'dd/MM/yyyy') {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, pattern, { locale: ptBR });
}
export const fmtDateTime = (v: string | Date | null | undefined) => fmtDate(v, "dd/MM/yyyy 'às' HH:mm");
export function fmtAgo(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function formatCnpj(v: string | null | undefined) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v ?? '';
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
export const onlyDigits = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function initials(name: string | null | undefined) {
  const parts = String(name ?? '?').trim().split(/\s+/);
  return (parts[0]?.[0] ?? '' + (parts[1]?.[0] ?? '')).toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
