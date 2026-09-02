import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X, Inbox, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ---------------------------------- Button --------------------------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-sm',
  secondary: 'bg-surface-2 text-ink hover:bg-line/70',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 p-0',
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/25',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ---------------------------------- Inputs --------------------------------- */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('input', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn('input h-auto min-h-[96px] py-2 resize-y', className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn('input pr-8 appearance-none bg-no-repeat bg-[right_.6rem_center]', className)} style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272.5%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")' }} {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/* ----------------------------------- Badge --------------------------------- */
type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-brand-soft text-brand',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
};
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ----------------------------------- Card ---------------------------------- */
export function Card({ className, children, title, action, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          {typeof title === 'string' ? <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3> : title}
          {action}
        </header>
      )}
      <div className={cn(padded && 'px-5 pb-5', (title || action) && !padded && '', !title && !action && padded && 'pt-5')}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'neutral', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card p-5 flex items-start gap-4 animate-fade-up">
      {icon && <div className={cn('h-10 w-10 rounded-xl grid place-items-center shrink-0', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="font-display text-2xl font-bold tracking-tight num mt-1">{value}</div>
        {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Dialog --------------------------------- */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn('bg-transparent p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm w-full', wide ? 'max-w-4xl' : 'max-w-lg')}
    >
      <div className="card shadow-pop overflow-hidden text-ink">
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-bold tracking-tight">{title}</h3>
          <button className="rounded-lg p-1 text-muted hover:bg-surface-2" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-5 py-3 border-t border-line bg-surface-2/50">{footer}</footer>}
      </div>
    </dialog>
  );
}

/* ---------------------------------- Empty ---------------------------------- */
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="h-12 w-12 rounded-2xl bg-surface-2 grid place-items-center text-muted mb-4">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <h4 className="font-display font-bold">{title}</h4>
      {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-brand mb-1">{eyebrow}</div>}
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted mt-1 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------- Dropzone -------------------------------- */
export function Dropzone({ accept, onFile, label, hint, file }: { accept: string; onFile: (f: File) => void; label: string; hint?: string; file?: File | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-2xl border-2 border-dashed border-line bg-surface-2/40 hover:bg-brand-soft/40 hover:border-brand/50 transition p-8 text-center"
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.currentTarget.value = '';
        }}
      />
      <div className="mx-auto h-12 w-12 rounded-2xl bg-surface grid place-items-center text-brand shadow-card mb-3">
        <UploadCloud className="h-5 w-5" />
      </div>
      <div className="font-semibold">{file ? file.name : label}</div>
      <div className="text-xs text-muted mt-1">{file ? `${(file.size / 1024).toFixed(0)} KB · clique para trocar` : hint}</div>
    </div>
  );
}

/* ---------------------------------- Table ---------------------------------- */
export function Table({ children, className, dense }: { children: ReactNode; className?: string; dense?: boolean }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn('w-full border-collapse', dense && '[&_.td]:py-1.5')}>{children}</table>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }> }) {
  return (
    <div className="inline-flex rounded-xl bg-surface-2 p-1 gap-1">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'px-3 h-8 rounded-lg text-sm font-medium transition flex items-center gap-2',
            value === it.value ? 'bg-surface shadow-card text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {it.label}
          {it.count !== undefined && <span className={cn('text-[11px] rounded-full px-1.5 py-0.5', value === it.value ? 'bg-brand-soft text-brand' : 'bg-line/60')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const color = { neutral: 'bg-muted', brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' }[tone];
  return (
    <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
