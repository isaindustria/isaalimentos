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
  const version = s.status === 'downloaded' || s.status === 'available' ? s.version : null;
  const ready = u.isDesktop && !!version && (s.status === 'downloaded' || (s.status === 'available' && u.isPortable));
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem('isa-update-dismissed'));
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    if (ready && version) fetchNotes(version).then(setNotes);
  }, [ready, version]);

  const open = ready && dismissed !== version;
  if (!open || !version) return null;

  function later() {
    sessionStorage.setItem('isa-update-dismissed', version!);
    setDismissed(version);
  }

  return (
    <UiDialog open onOpenChange={(o) => !o && later()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-3xl border-0 p-0 shadow-pop" showCloseButton={false}>
        <div className="relative overflow-hidden bg-gradient-to-br from-brand via-brand to-[#b30f19] px-6 pb-8 pt-7 text-brand-ink">
          <img src="./brand/mascot-inverted.png" alt="" aria-hidden className="pointer-events-none absolute -bottom-7 -right-5 w-32 opacity-90 drop-shadow-xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Sparkles className="size-5" /></span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[.18em] opacity-80">{u.isPortable ? 'Nova versão disponível' : 'Atualização pronta'}</div>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">ISA Alimentos {version}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="relative mt-4 max-w-[26ch] text-sm leading-relaxed opacity-90">
            {u.isPortable
              ? `Você está na ${APP_VERSION}. Baixe o novo arquivo portátil para continuar recebendo as melhorias.`
              : `Já baixamos tudo em segundo plano. Reinicie para trocar da ${APP_VERSION} para a ${version} — leva poucos segundos.`}
          </DialogDescription>
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
          {u.isPortable
            ? <Button icon={<Download className="size-4" />} onClick={u.apply}>Baixar nova versão</Button>
            : <Button icon={<RefreshCw className="size-4" />} onClick={u.install}>Reiniciar e atualizar agora</Button>}
        </div>
      </DialogContent>
    </UiDialog>
  );
}
