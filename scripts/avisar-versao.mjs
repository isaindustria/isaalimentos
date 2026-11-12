// Notificação no celular/computador (Web Push) de que a versão nova chegou, para todos os aparelhos com
// notificações ativadas — mesmo com o app fechado. Usa a função notify-push que já envia os outros avisos.
// Uso: SUPABASE_ACCESS_TOKEN=... node scripts/avisar-versao.mjs 1.14.4
// Chamado sozinho no fim do scripts/backup-release.mjs (todo lançamento).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] ?? JSON.parse(readFileSync(path.join(root, 'apps/web/package.json'), 'utf8')).version;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) { console.log('avisar-versao: sem SUPABASE_ACCESS_TOKEN, aviso não enviado.'); process.exit(0); }

// resumo: primeiro item da versão atual na página de Novidades
let resumo = 'Abra o app para ver as novidades.';
try {
  const html = readFileSync(path.join(root, 'apps/web/public/site/docs.html'), 'utf8');
  const bloco = html.match(new RegExp(`<span class="v">v${version.replace(/\./g, '\\.')}</span>[\\s\\S]*?<li>([\\s\\S]*?)</li>`));
  if (bloco) {
    const t = bloco[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t) resumo = t.length > 150 ? `${t.slice(0, 147)}…` : t;
  }
} catch { /* sem docs: usa o texto padrão */ }

const corpo = JSON.stringify({ record: { title: `Chegou a versão ${version} do ISA Gestão`, body: resumo, link: '/' } });
const sql = `select net.http_post(
  url := 'https://exbhhwrutvzpwcjxqikp.supabase.co/functions/v1/notify-push',
  headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', (select value from private_secrets where key = 'push_webhook')),
  body := $corpo$${corpo}$corpo$::jsonb
) as id`;
const r = await fetch('https://api.supabase.com/v1/projects/exbhhwrutvzpwcjxqikp/database/query', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
});
console.log(r.ok ? `aviso da versão ${version} enviado aos aparelhos com notificações ativadas` : `avisar-versao: falhou (${r.status}) ${await r.text()}`);
