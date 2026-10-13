import { contextBridge, ipcRenderer } from 'electron';

// Synchronous info so the renderer knows version/portable flag on first paint.
const info = (() => {
  try {
    return ipcRenderer.sendSync('app:info:sync') as { version: string; platform: string; isPortable: boolean };
  } catch {
    return { version: '0.0.0', platform: process.platform, isPortable: false };
  }
})();

contextBridge.exposeInMainWorld('isaDesktop', {
  platform: info.platform,
  version: info.version,
  isPortable: info.isPortable,
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  openExternal: (url: string) => ipcRenderer.send('shell:open', url),
  // Emissor de NF-e (só existe no programa do Windows). O certificado nunca passa por aqui: só senha e resultados.
  nfe: {
    certInfo: () => ipcRenderer.invoke('nfe:cert-info'),
    importCert: (senha: string) => ipcRenderer.invoke('nfe:cert-import', senha),
    removeCert: () => ipcRenderer.invoke('nfe:cert-remove'),
    status: (ambiente: 1 | 2) => ipcRenderer.invoke('nfe:status', ambiente),
    emitir: (input: unknown) => ipcRenderer.invoke('nfe:emitir', input),
    consultar: (ambiente: 1 | 2, chave: string) => ipcRenderer.invoke('nfe:consultar', ambiente, chave),
    cancelar: (p: unknown) => ipcRenderer.invoke('nfe:cancelar', p),
  },
  onUpdateState: (cb: (state: unknown) => void) => {
    const handler = (_e: unknown, state: unknown) => cb(state);
    ipcRenderer.on('update:state', handler);
    return () => ipcRenderer.removeListener('update:state', handler);
  },
});
