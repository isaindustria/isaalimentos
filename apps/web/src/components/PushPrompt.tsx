import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, X, Share } from 'lucide-react';
import { enablePush, getModules, pushStatus, VAPID_PUBLIC_KEY } from '@/api/v14';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/primitives';

const KEY = 'isa-push-prompt-dismissed';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Asks once for push permission (needs a tap: browsers block silent requests). */
export function PushPrompt() {
  const { session, isActive } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const iosNeedsInstall = isIOS && !standalone;

  useEffect(() => {
    if (!session || !isActive || !VAPID_PUBLIC_KEY) return;
    (async () => {
      const mods = await getModules().catch(() => null);
      if (mods && mods.push === false) return;
      const st = await pushStatus();
      if (st === 'on') return;
      // Permissao ja concedida antes (ex.: reinstalou o PWA): assina em silencio.
      if (st === 'off' && 'Notification' in window && Notification.permission === 'granted') {
        await enablePush(session.user.id).catch(() => undefined);
        return;
      }
      if ('Notification' in window && Notification.permission === 'denied') return;
      if (localStorage.getItem(KEY) === '1' && !standalone) return;
      if (st === 'unsupported' && !iosNeedsInstall) return;
      setShow(true);
    })();
  }, [session, isActive]);

  if (!show) return null;

  async function activate() {
    setBusy(true);
    try {
      const ok = await enablePush(session!.user.id);
      if (ok) {
        toast.success('Notificações ativadas neste aparelho.');
        setShow(false);
      } else toast.error('Permissão não concedida. Você pode ativar depois em Configurações.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand/20 bg-brand-soft/60 px-4 py-3 text-sm animate-fade-up">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink"><Bell className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <b>Receber avisos neste aparelho?</b>
        <div className="text-xs text-muted">
          {iosNeedsInstall
            ? <>No iPhone, primeiro toque em <Share className="inline size-3.5" /> <b>Compartilhar → Adicionar à Tela de Início</b>, abra o app pelo ícone e aceite as notificações.</>
            : 'Pedidos de acesso, itens para conferir, estoque baixo e ordens concluídas, mesmo com o app fechado.'}
        </div>
      </div>
      <div className="flex gap-2">
        {!iosNeedsInstall && <Button size="sm" loading={busy} onClick={activate}>Ativar</Button>}
        <Button size="sm" variant="ghost" icon={<X className="size-4" />} aria-label="Agora não" onClick={() => { localStorage.setItem(KEY, '1'); setShow(false); }} />
      </div>
    </div>
  );
}
