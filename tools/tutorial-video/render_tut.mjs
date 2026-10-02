import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const [mode, arg, out] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: exe });
const p = await (await b.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto(pathToFileURL(path.resolve(`tut${process.env.NAME || ''}_build.html`)).href); await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const grab = async (t, q = 0.9) => Buffer.from((await p.evaluate(([t, q]) => { window.render(t); return document.getElementById('c').toDataURL('image/jpeg', q); }, [t, q])).split(',')[1], 'base64');
if (mode === 'preview') {
  fs.mkdirSync('prev', { recursive: true });
  for (const t of arg.split(',').map(Number)) fs.writeFileSync(`prev/p_${String(t).replace('.', '_')}.jpg`, await grab(t, 0.85));
} else {
  const TL = JSON.parse(fs.readFileSync(`timeline${process.env.NAME || ''}.json`, 'utf8')), N = Math.round(TL.dur * 30);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-i', `tut${process.env.NAME || ''}_mix.wav`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < N; i++) { const buf = await grab(i / 30, 0.93); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); if (i % 900 === 0) console.log('frame', i, '/', N); }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r)); console.log('pronto', out);
}
await b.close();
