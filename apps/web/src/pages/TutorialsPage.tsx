import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/primitives';
import { TutorialPlayer } from '@/components/TutorialPlayer';
import { tutorialsFor } from '@/lib/tutorials';
import { useAuth } from '@/hooks/useAuth';
import { APP_VERSION } from '@/lib/desktop';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

/** Página Tutoriais: um vídeo para cada atualização, o mais novo primeiro. */
export default function TutorialsPage() {
  const { isSeller } = useAuth();
  const TUTORIALS = tutorialsFor(isSeller);
  const [sel, setSel] = useState(TUTORIALS[0]?.id);
  const cur = TUTORIALS.find((t) => t.id === sel) ?? TUTORIALS[0];
  return (
    <>
      <PageHeader title="Tutoriais" description="Vídeos curtos explicando cada atualização do sistema, no computador e no celular." />
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {cur && (
          <Card title={<span className="flex flex-wrap items-center gap-2">{cur.title} <Badge tone="info">versão {cur.version}</Badge>{cur.version === APP_VERSION && <Badge tone="ok">novidade</Badge>}</span>}>
            <TutorialPlayer t={cur} />
            <p className="mt-3 text-sm text-muted">{cur.summary}</p>
            <div className="mt-6 space-y-5">
              <h2 className="font-display text-lg font-bold">Passo a passo</h2>
              {cur.steps.map((s) => (
                <section key={s.title}>
                  <h3 className="mb-2 font-semibold">{s.title}</h3>
                  <ol className="space-y-2 text-sm leading-relaxed">
                    {s.items.map((it, i) => (
                      <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span><span className="pt-0.5">{it}</span></li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          </Card>
        )}
        <Card title="Todos os tutoriais" padded={false}>
          <ul className="divide-y divide-line">
            {TUTORIALS.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => { setSel(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={cn('flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface-2', t.id === cur?.id && 'bg-brand-soft/30')}>
                  <PlayCircle className="mt-0.5 size-5 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-xs text-muted">versão {t.version} · {fmtDate(t.date)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{t.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
