import { app, BrowserWindow, ipcMain, shell, Menu, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'node:path';

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
const isDev = !app.isPackaged;
let win: BrowserWindow | null = null;

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#faf9f6',
    // icon: build/icon.ico (logo ISA)
    title: 'ISA Alimentos · Gestão',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once('ready-to-show', () => win?.show());

  const devUrl = process.env.ISA_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '../web/index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Nunca navega para fora do app (phishing/redirects); links externos abrem no navegador.
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false);
    if (!allowed) {
      event.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function wireUpdater() {
  autoUpdater.on('checking-for-update', () => send('update:state', { status: 'checking' }));
  autoUpdater.on('update-available', (info) => send('update:state', { status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send('update:state', { status: 'not-available' }));
  autoUpdater.on('download-progress', (p) => send('update:state', { status: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => send('update:state', { status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => send('update:state', { status: 'error', message: err?.message ?? String(err) }));

  ipcMain.handle('update:check', async () => {
    if (isDev) {
      send('update:state', { status: 'not-available' });
      return;
    }
    await autoUpdater.checkForUpdates();
  });
  ipcMain.handle('update:download', async () => {
    if (isPortable) return; // portable builds cannot self-replace; the UI links to the releases page
    await autoUpdater.downloadUpdate();
  });
  ipcMain.on('update:install', () => {
    if (!isPortable) autoUpdater.quitAndInstall(false, true);
  });
  ipcMain.on('shell:open', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, isPortable }));
  ipcMain.on('app:info:sync', (e) => {
    e.returnValue = { version: app.getVersion(), platform: process.platform, isPortable };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Content Security Policy para o renderer (mesma politica do site)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self' file:; script-src 'self' 'unsafe-inline' file:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com file:; font-src 'self' https://fonts.gstatic.com data: file:; img-src 'self' data: blob: https: file:; connect-src 'self' https://exbhhwrutvzpwcjxqikp.supabase.co wss://exbhhwrutvzpwcjxqikp.supabase.co https://api.github.com https://github.com https://objects.githubusercontent.com; worker-src 'self' blob:; frame-ancestors 'none'";
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
  wireUpdater();
  createWindow();
  // Check silently a few seconds after start, then every 6 hours.
  if (!isDev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => undefined), 5000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => undefined), 6 * 60 * 60 * 1000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
