import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const WORDS = ['Carregando o sistema…', 'Organizando os pedidos das lojas', 'Somando o estoque dos locais 1 e 5', 'Otimizando a produção', 'Pronto para começar'];

/**
 * Branded opening animation (same as the landing page). Shown when the app starts
 * as desktop program or installed PWA; on the plain web it is skipped.
 */
export function Splash({ duration = 3200, onDone }: { duration?: number; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 400 : duration;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / total);
      setProgress(p);
      setIdx(Math.min(WORDS.length - 1, Math.floor(p * WORDS.length)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setLeaving(true);
        setTimeout(onDone, 450);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, onDone]);

  return (
    <div
      className={cn('fixed inset-0 z-[100] grid place-items-center text-center text-white transition-opacity duration-500', leaving && 'opacity-0 pointer-events-none')}
      style={{ background: 'radial-gradient(70% 60% at 50% 40%, #2b1a18, #1f1615 70%)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 px-6">
        <img src="./brand/logo-512.png" alt="ISA Alimentos" width={120} height={106} className="animate-pulse drop-shadow-[0_20px_40px_rgba(226,20,32,.45)]" />
        <div className="font-display text-2xl font-extrabold tracking-tight">
          ISA <span className="text-brand-yellow">Alimentos</span>
        </div>
        <div className="h-7 font-display text-base font-semibold text-white/85 transition-all" key={idx}>
          <span className="inline-block animate-fade-up">{WORDS[idx]}</span>
        </div>
        <div className="mt-2 h-1 w-64 max-w-[70vw] overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: 'linear-gradient(90deg,#e21420,#f5d000,#3fa33f)' }} />
        </div>
      </div>
    </div>
  );
}
