import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { prefersMobileVideo, videoUrl, type Tutorial } from '@/lib/tutorials';
import { cn } from '@/lib/utils';

/** Vídeo do tutorial com troca entre versão computador e celular (abre na do aparelho em uso). */
export function TutorialPlayer({ t, autoPlay, className }: { t: Tutorial; autoPlay?: boolean; className?: string }) {
  const [mode, setMode] = useState<'web' | 'mobile'>(() => (prefersMobileVideo() && t.mobile !== t.web ? 'mobile' : 'web'));
  const vertical = mode === 'mobile';
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('mx-auto overflow-hidden rounded-2xl bg-black', vertical ? 'max-w-[360px]' : 'w-full')}>
        <video
          key={mode}
          className={cn('block w-full', vertical ? 'aspect-[9/16]' : 'aspect-video')}
          src={videoUrl(vertical ? t.mobile : t.web)}
          poster={t.poster && !vertical ? videoUrl(t.poster) : undefined}
          controls
          playsInline
          preload="metadata"
          autoPlay={autoPlay}
        />
      </div>
      {t.mobile !== t.web && (
        <div className="flex justify-center gap-1 text-xs" role="group" aria-label="Formato do vídeo">
          <button type="button" onClick={() => setMode('web')} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1', mode === 'web' ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line text-muted')}><Monitor className="size-3.5" /> Computador</button>
          <button type="button" onClick={() => setMode('mobile')} className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1', mode === 'mobile' ? 'border-brand bg-brand-soft/40 font-semibold' : 'border-line text-muted')}><Smartphone className="size-3.5" /> Celular</button>
        </div>
      )}
    </div>
  );
}
