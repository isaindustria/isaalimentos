import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Dialog } from '@/components/primitives';
import { TutorialPlayer } from '@/components/TutorialPlayer';
import { APP_VERSION } from '@/lib/desktop';
import { tutorialBetween } from '@/lib/tutorials';
import { useAuth } from '@/hooks/useAuth';

const KEY = 'isa-tutorial-visto';

/** Ao entrar numa versão nova que tem tutorial, mostra o vídeo uma vez por aparelho (fica depois em Tutoriais). */
export function WhatsNew() {
  const { profile } = useAuth();
  // versão do último tutorial já visto neste aparelho; o mais novo ainda não visto aparece uma vez
  const [seen, setSeen] = useState<string | null>(() => { try { return localStorage.getItem(KEY) ?? '1.6.9'; } catch { return APP_VERSION; } });
  const t = tutorialBetween(seen, APP_VERSION);
  if (!t || !profile || (t.roles?.length && !t.roles.includes(profile.role))) return null;
  const close = () => { try { localStorage.setItem(KEY, t.version); } catch { /* ignore */ } setSeen(t.version); };
  return (
    <Dialog open onClose={close} wide
      title={<span className="inline-flex items-center gap-2"><Sparkles className="size-5 text-brand" /> Novidade da versão {t.version}: {t.title}</span>}
      description={`${t.summary} Este vídeo fica guardado no menu Tutoriais.`}
      footer={<Button onClick={close}>Entendi</Button>}>
      <TutorialPlayer t={t} />
    </Dialog>
  );
}
