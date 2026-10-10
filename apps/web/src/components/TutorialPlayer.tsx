import { useEffect, useState } from 'react';
import { ExternalLink, Monitor, Smartphone } from 'lucide-react';
import { openExternal } from '@/lib/desktop';
import { prefersMobileVideo, videoUrl, type Tutorial } from '@/lib/tutorials';
import { cn } from '@/lib/utils';

/** Vídeo do tutorial com troca entre versão computador e celular (abre na do aparelho em uso). */
export function TutorialPlayer({ t, autoPlay, className }: { t: Tutorial; autoPlay?: boolean; className?: string }) {
  const [mode, setMode] = useState<'web' | 'mobile'>(() => (prefersMobileVideo() && t.mobile !== t.web ? 'mobile' : 'web'));
  const vertical = mode === 'mobile';
  const [failed, setFailed] = useState<string | null>(null);
  const src = videoUrl(vertical ? t.mobile : t.web);
  const [loaded, setLoaded] = useState<string | null>(null);
  // Rede que trava o vídeo sem dar erro: depois de 12 s sem carregar, oferece abrir no navegador.
  useEffect(() => { const id = window.setTimeout(() => setFailed((f) => f ?? (loaded === src ? null : src)), 12000); return () => window.clearTimeout(id); }, [src, loaded]);
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('mx-auto overflow-hidden rounded-2xl bg-black', vertical ? 'max-w-[360px]' : 'w-full')}>
        <video
          key={mode}
          onError={(e) => { const err = (e.currentTarget as HTMLVideoElement).error; console.error('Vídeo do tutorial não carregou', src, err?.code, err?.message); setFailed(src); }}
          onLoadedMetadata={() => { setLoaded(src); setFailed(null); }}
          className={cn('block w-full', vertical ? 'aspect-[9/16]' : 'aspect-video')}
          src={src}
          poster={t.poster && !vertical ? videoUrl(t.poster) : undefined}
          controls
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
        />
      </div>
      {failed === src && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          Não foi possível carregar o vídeo aqui (internet ou bloqueio da rede).{' '}
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-brand hover:underline" onClick={() => openExternal(src)}>Abrir o vídeo no navegador <ExternalLink className="size-3.5" /></button>
        </div>
      )}
      {t.mobile !== t.web && (
        <div className="flex justify-center gap-1 text-xs" role="group" aria-label="Formato do vídeo">
          <button type="button" onClick={() => setMode('web')} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1', mode === 'web' ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line text-muted')}><Monitor className="size-3.5" /> Computador</button>
          <button type="button" onClick={() => setMode('mobile')} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1', mode === 'mobile' ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line text-muted')}><Smartphone className="size-3.5" /> Celular</button>
        </div>
      )}
    </div>
  );
}
