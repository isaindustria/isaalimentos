// Launches Electron for development. Terminals opened inside VS Code export
// ELECTRON_RUN_AS_NODE=1, which makes Electron behave like plain Node and exit at once.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const child = spawn(electron, [appDir, ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
