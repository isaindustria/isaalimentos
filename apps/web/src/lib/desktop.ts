/**
 * Bridge between the web UI and the Electron shell (when running as desktop app).
 * The preload script exposes `window.isaDesktop`; on the web this is undefined.
 */

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export interface DesktopBridge {
  platform: string;
  version: string;
  isPortable: boolean;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  openExternal(url: string): void;
  onUpdateState(cb: (state: UpdateState) => void): () => void;
}

declare global {
  interface Window {
    isaDesktop?: DesktopBridge;
  }
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
}

export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const desktop = typeof window !== 'undefined' ? window.isaDesktop : undefined;
export const isDesktop = Boolean(desktop);
export const GITHUB_REPO = (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? '';
export const RELEASES_URL = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}/releases/latest` : '';

export function openExternal(url: string) {
  if (desktop) desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}
