/**
 * App-level primitives composed from shadcn/ui (src/components/ui/*).
 * Pages import from here so the visual system stays consistent on web, PWA and desktop.
 */
import { forwardRef, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Inbox, UploadCloud } from 'lucide-react';
import { Button as UiButton } from '@/components/ui/button';
import { Input as UiInput } from '@/components/ui/input';
import { Textarea as UiTextarea } from '@/components/ui/textarea';
import { Badge as UiBadge } from '@/components/ui/badge';
import { Dialog as UiDialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner as UiSpinner } from '@/components/ui/spinner';
import { Skeleton as UiSkeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
const VARIANT: Record<Variant, 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline'> = {
  primary: 'default',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'destructive',
  outline: 'outline',
};
const SIZE: Record<Size, 'sm' | 'default' | 'lg' | 'icon'> = { sm: 'sm', md: 'default', lg: 'lg', icon: 'icon' };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...rest }, ref) {
  return (
    <UiButton
      ref={ref}
      variant={VARIANT[variant]}
      size={SIZE[size]}
      disabled={disabled || loading}
      className={cn(
        'rounded-xl font-semibold',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-6 text-base',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'icon' && 'size-9',
        variant === 'primary' && 'shadow-sm',
        className,
      )}
      {...rest}
    >
      {loading ? <UiSpinner data-icon="inline-start" /> : icon ? <span data-icon="inline-start" className="inline-flex [&>svg]:size-4">{icon}</span> : null}
      {children}
    </UiButton>
  );
});

/* ---------------------------------- Inputs --------------------------------- */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <UiInput ref={ref} className={cn('h-10 rounded-xl text-sm', className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <UiTextarea ref={ref} className={cn('min-h-24 rounded-xl text-sm', className)} {...rest} />;
});
/** Native select styled like the inputs (works on every device, keyboard and screen reader). */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cn('input pr-8 appearance-none bg-no-repeat bg-[right_.6rem_center]', className)}
      style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272.5%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")' }}
      {...rest}
    >
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
  neutral: 'bg-surface-2 text-muted border-transparent',
  brand: 'bg-brand-soft text-brand border-transparent',
  ok: 'bg-ok/10 text-ok border-transparent',
  warn: 'bg-warn/10 text-warn border-transparent',
  danger: 'bg-danger/10 text-danger border-transparent',
  info: 'bg-info/10 text-info border-transparent',
};
export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <UiBadge variant="outline" className={cn('gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </UiBadge>
  );
}

/* ----------------------------------- Card ---------------------------------- */
export function Card({ className, children, title, action, padded = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; padded?: boolean }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          {typeof title === 'string' ? <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3> : title}
          {action}
        </header>
      )}
      <div className={cn(padded && 'px-5 pb-5', !title && !action && padded && 'pt-5')}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'neutral', icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card flex items-start gap-4 p-5 animate-fade-up min-w-0">
      {icon && <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="font-display num mt-1 text-2xl font-bold tracking-tight">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Dialog --------------------------------- */
export function Dialog({ open, onClose, title, children, footer, wide, description }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; description?: string }) {
  return (
    <UiDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-h-[92svh] overflow-hidden p-0 gap-0 rounded-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')} showCloseButton>
        <DialogHeader className="border-b border-line px-5 py-4 text-left">
          <DialogTitle className="font-display font-bold tracking-tight">{title}</DialogTitle>
          <DialogDescription className={cn(!description && 'sr-only')}>{description ?? 'Janela de edição'}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[68svh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <DialogFooter className="flex-row justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</DialogFooter>}
      </DialogContent>
    </UiDialog>
  );
}

/* ---------------------------------- Empty ---------------------------------- */
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon ?? <Inbox className="size-5" />}</div>
      <h4 className="font-display font-bold">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <UiSpinner className={cn('size-5 text-muted', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <UiSkeleton className={cn('h-4 w-full', className)} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
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
      className="cursor-pointer rounded-2xl border-2 border-dashed border-line bg-surface-2/40 p-8 text-center transition hover:border-brand/50 hover:bg-brand-soft/40"
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
      <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-surface text-brand shadow-card">
        <UploadCloud className="size-5" />
      </div>
      <div className="font-semibold">{file ? file.name : label}</div>
      <div className="mt-1 text-xs text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB · clique para trocar` : hint}</div>
    </div>
  );
}

/* ---------------------------------- Table ---------------------------------- */
export function Table({ children, className, dense }: { children: ReactNode; className?: string; dense?: boolean }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className={cn('w-full min-w-[560px] border-collapse lg:min-w-0', dense && '[&_.td]:py-1.5')}>{children}</table>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }> }) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn('flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition', value === it.value ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
        >
          {it.label}
          {it.count !== undefined && <span className={cn('rounded-full px-1.5 py-0.5 text-[11px]', value === it.value ? 'bg-brand-soft text-brand' : 'bg-line/60')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const color = { neutral: '[&>div]:bg-muted', brand: '[&>div]:bg-brand', ok: '[&>div]:bg-ok', warn: '[&>div]:bg-warn', danger: '[&>div]:bg-danger', info: '[&>div]:bg-info' }[tone];
  return <Progress value={Math.max(0, Math.min(100, value))} className={cn('h-2 bg-surface-2', color)} />;
}
