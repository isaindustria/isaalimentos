// Copies the built web app (apps/web/dist) into apps/desktop/web so electron-builder can package it.
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../web/dist');
const dest = path.resolve(here, '../web');

if (!existsSync(src)) {
  console.error('Web build not found at', src, '- run "npm run build -w @isa/web" first.');
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
// O site público (landing, docs e vídeos) fica de fora: o programa abre os vídeos pela internet.
cpSync(src, dest, { recursive: true, filter: (p) => !path.relative(src, p).split(path.sep).includes('site') });
console.log('Copied web build to', dest);
