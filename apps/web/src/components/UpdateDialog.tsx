import { useEffect, useState } from 'react';
import { Download, RefreshCw, Sparkles, ExternalLink } from 'lucide-react';
import { Dialog as UiDialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/primitives';
import { useUpdates } from '@/hooks/useUpdates';
import { APP_VERSION, openExternal } from '@/lib/desktop';

const REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? 'isaindustria/isaalimentos';
const DOCS_URL = 'https://www.isaindalimentos.com.br/site/docs.html#novidades';

/** Release body -> bullet lines (commit subjects); empty when GitHub has no notes for the tag. */
async function fetchNotes(version: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/v${version}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { body?: string | null };
    return (json.body ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
      .filter((l) => l && !l.startsWith('#') && !/co-authored-by/i.test(l))
      .slice(0, 8);
  } catch {
    return [];
  }
}

/** Desktop: modal moderno quando a atualizacao ja baixou (ou, no portatil, quando ha versao nova). */
export function UpdateDialog() {
  const u = useUpdates();
  const s = u.state;
  const version = s.status === 'downloaded' || s.status === 'available' ? s.version : s.status === 'downloading' ? (sessionStorage.getItem('isa-update-version') ?? '') : null;
  if (s.status === 'available' || s.status === 'downloaded') sessionStorage.setItem('isa-update-version', s.version);
  const downloading = u.isDesktop && s.status === 'downloading';
  const ready = u.isDesktop && !!version && (s.status === 'downloaded' || (s.status === 'available' && u.isPortable));
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem('isa-update-dismissed'));
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    if (ready && version) fetchNotes(version).then(setNotes);
  }, [ready, version]);

  const open = (ready || downloading) && dismissed !== version;
  if (!open || version == null) return null;
  const percent = s.status === 'downloading' ? Math.round(s.percent) : 100;

  function later() {
    sessionStorage.setItem('isa-update-dismissed', version!);
    setDismissed(version);
  }

  return (
    <UiDialog open onOpenChange={(o) => !o && later()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-pop antialiased [backface-visibility:hidden] data-open:zoom-in-100 data-closed:zoom-out-100" showCloseButton={false}>
        <div className="relative overflow-hidden bg-brand px-6 pb-7 pt-6 text-brand-ink">
          <img src="./brand/mascot-inverted.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-6 -right-4 w-36 select-none" />
          <div className="relative flex items-start gap-3 pr-28">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/20"><Sparkles className="size-5" /></span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[.2em] text-white/80">{downloading ? 'Baixando atualização' : u.isPortable ? 'Nova versão disponível' : 'Atualização pronta'}</div>
              <DialogTitle className="mt-0.5 font-display text-[28px] font-bold leading-none tracking-tight text-white">Versão {version || '…'}</DialogTitle>
              <div className="mt-1 text-xs text-white/75">você está na {APP_VERSION}</div>
            </div>
          </div>
          <DialogDescription className="relative mt-4 pr-28 text-sm leading-relaxed text-white/90">
            {downloading
              ? 'Baixando em segundo plano. Você pode continuar trabalhando; avisamos quando estiver pronta.'
              : u.isPortable
                ? 'Baixe o novo arquivo portátil para continuar recebendo as melhorias.'
                : 'Já baixamos tudo. Reinicie para trocar de versão — leva poucos segundos e nada se perde.'}
          </DialogDescription>
          {downloading && (
            <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">O que mudou</div>
          {notes.length ? (
            <ul className="space-y-1.5 text-sm">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" /><span className="text-ink/90">{n}</span></li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Correções e melhorias. A lista completa está na documentação.</p>
          )}
          <button type="button" onClick={() => openExternal(DOCS_URL)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            Ver todas as novidades <ExternalLink className="size-3" />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line bg-surface-2/50 px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={later}>Depois</Button>
          {downloading
            ? <Button disabled loading>Baixando {percent}%</Button>
            : u.isPortable
              ? <Button icon={<Download className="size-4" />} onClick={u.apply}>Baixar nova versão</Button>
              : <Button icon={<RefreshCw className="size-4" />} onClick={u.install}>Reiniciar e atualizar agora</Button>}
        </div>
      </DialogContent>
    </UiDialog>
  );
}
