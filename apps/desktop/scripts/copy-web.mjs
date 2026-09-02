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
cpSync(src, dest, { recursive: true });
console.log('Copied web build to', dest);
