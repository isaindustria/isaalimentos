import { useCallback, useEffect, useState } from 'react';
import { APP_VERSION, desktop, isDesktop, RELEASES_URL, openExternal, type UpdateState } from '@/lib/desktop';
import { compareVersions } from '@/lib/utils';

const WEB_POLL_MS = 5 * 60 * 1000;

/** Activates the new service worker (if any) and reloads with the fresh bundle. */
async function applyWebUpdate() {
  try {
    const fn = (window as unknown as { __isaUpdateSW?: (reload?: boolean) => Promise<void> }).__isaUpdateSW;
    if (fn) await fn(true);
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    for (const r of regs ?? []) await r.update();
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(Date.now()));
  window.location.replace(url.toString());
}

export interface UpdateInfo {
  state: UpdateState;
  currentVersion: string;
  isDesktop: boolean;
  isPortable: boolean;
  check(): void;
  /** Desktop: download; Web: reload page. */
  apply(): void;
  install(): void;
}

export function useUpdates(): UpdateInfo {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });

  useEffect(() => {
    if (desktop) {
      const off = desktop.onUpdateState(setState);
      desktop.checkForUpdates().catch(() => undefined);
      return off;
    }
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { version: string };
        if (json.version && compareVersions(json.version, APP_VERSION) > 0) {
          setState({ status: 'downloaded', version: json.version });
          // Web/PWA: atualiza sozinho uma vez por versao (sem loop se algo falhar)
          const key = 'isa-auto-updated';
          if (sessionStorage.getItem(key) !== json.version) {
            sessionStorage.setItem(key, json.version);
            setTimeout(() => applyWebUpdate(), 1500);
          }
        }
      } catch {
        /* offline */
      }
    };
    poll();
    timer = window.setInterval(poll, WEB_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  const check = useCallback(() => {
    if (desktop) {
      setState({ status: 'checking' });
      desktop.checkForUpdates().catch((e: Error) => setState({ status: 'error', message: e.message }));
    } else {
      window.location.reload();
    }
  }, []);

  const apply = useCallback(() => {
    if (desktop) {
      if (desktop.isPortable && RELEASES_URL) openExternal(RELEASES_URL);
      else desktop.downloadUpdate().catch((e: Error) => setState({ status: 'error', message: e.message }));
    } else {
      applyWebUpdate();
    }
  }, []);

  const install = useCallback(() => {
    if (desktop) desktop.installUpdate();
    else applyWebUpdate();
  }, []);

  return { state, currentVersion: APP_VERSION, isDesktop, isPortable: desktop?.isPortable ?? false, check, apply, install };
}
