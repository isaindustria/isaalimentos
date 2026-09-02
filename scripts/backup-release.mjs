// Copia os instaladores e um zip do código-fonte para backups/vX.Y.Z/.
// Uso: node scripts/backup-release.mjs            (versão do package.json)
//      node scripts/backup-release.mjs 1.2.0      (versão específica; baixa do GitHub se não houver build local)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] ?? pkg.version;
const tag = `v${version}`;
const dest = path.join(root, 'backups', tag);
mkdirSync(dest, { recursive: true });

const repo = 'isaindustria/isaalimentos';
const files = [`ISA-Alimentos-Setup-${version}.exe`, `ISA-Alimentos-Portable-${version}.exe`, `ISA-Alimentos-Setup-${version}.exe.blockmap`, 'latest.yml'];
const local = path.join(root, 'apps/desktop/release');

for (const f of files) {
  const out = path.join(dest, f);
  const url = `https://github.com/${repo}/releases/download/${tag}/${f}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.statusText);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log('baixado ', f);
    continue;
  } catch (e) {
    const src = path.join(local, f);
    if (existsSync(src)) {
      cpSync(src, out);
      console.log('copiado ', f, '(build local)');
    } else console.warn('ignorado', f, '-', e.message);
  }
}

// Código-fonte: git archive da tag (ou do HEAD se a tag não existir)
const ref = (() => {
  try {
    execSync(`git rev-parse -q --verify ${tag}`, { cwd: root, stdio: 'ignore' });
    return tag;
  } catch {
    return 'HEAD';
  }
})();
execSync(`git archive --format=zip --prefix="isaalimentos-${tag}/" -o "${path.join(dest, `codigo-fonte-${tag}.zip`)}" ${ref}`, { cwd: root, stdio: 'inherit' });
writeFileSync(path.join(dest, 'LEIA-ME.txt'), `ISA Alimentos ${tag}\nGerado em ${new Date().toLocaleString('pt-BR')}\nFonte: ${ref}\n\nSetup: instalador Windows com atualização automática\nPortable: roda sem instalar\ncodigo-fonte: snapshot do repositório nesta versão\n`);
console.log('backup pronto em', dest);
