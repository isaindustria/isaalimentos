import { useEffect } from 'react';
import { toast } from 'sonner';
import { APP_VERSION, isDesktop } from '@/lib/desktop';

const KEY = 'isa-versao-avisada';
const NOVIDADES = 'https://www.isaindalimentos.com.br/site/docs.html#novidades';

/** App instalado no celular ou no computador (PWA), aberto como aplicativo. */
function pwaInstalado(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

/**
 * Quem tem o app instalado (PWA) recebe sempre o aviso de que a versão nova chegou
 * (o app já se atualiza sozinho; aqui só avisa, uma vez por versão em cada aparelho).
 */
export function AvisoVersao() {
  useEffect(() => {
    if (isDesktop || !pwaInstalado()) return;
    let anterior: string | null = null;
    try { anterior = localStorage.getItem(KEY); localStorage.setItem(KEY, APP_VERSION); } catch { return; }
    if (anterior === APP_VERSION) return;
    const t = window.setTimeout(() => toast.success(`Chegou a versão ${APP_VERSION}`, {
      description: 'O app já está atualizado. Veja o que mudou nas Novidades.',
      duration: 20000,
      action: { label: 'Ver novidades', onClick: () => window.open(NOVIDADES, '_blank', 'noopener') },
    }), 1200);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
