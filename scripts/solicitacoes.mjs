// Fila de solicitações de atualização (tela Solicitações do sistema), para o desenvolvimento.
// Usa a API de gerenciamento do Supabase com SUPABASE_ACCESS_TOKEN no ambiente (nunca grave o token em arquivo).
//
//   node scripts/solicitacoes.mjs fila              lista a fila (aprovadas e em andamento, pela data e hora do pedido)
//   node scripts/solicitacoes.mjs baixar <numero>   salva texto e anexos em solicitacoes/<numero>-<titulo>/ (pasta fora do git)
//   node scripts/solicitacoes.mjs iniciar <numero>  marca como em andamento
//   node scripts/solicitacoes.mjs concluir <numero> <versao> "o que foi feito"
import fs from 'node:fs';
import path from 'node:path';

const REF = 'exbhhwrutvzpwcjxqikp';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('Defina SUPABASE_ACCESS_TOKEN no ambiente.'); process.exit(1); }
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'isa-solicitacoes' }, body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const [cmd, arg, ...rest] = process.argv.slice(2);
const num = Number(arg);

if (cmd === 'fila' || !cmd) {
  const rows = await sql(`select r.numero, r.status, r.prioridade, r.titulo, r.created_by_name, to_char(r.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') pedido_em, (select count(*) from update_request_files f where f.request_id = r.id) arquivos
    from update_requests r where r.status in ('aprovada', 'em_andamento', 'nova') order by (r.status = 'nova'), (r.status <> 'em_andamento'), r.created_at`);
  if (!rows.length) console.log('Nenhuma solicitação aberta.');
  let pos = 0;
  for (const r of rows) console.log(`${r.status === 'nova' ? '  -' : String(++pos).padStart(3)}  #${r.numero}  [${r.status}${r.prioridade === 'urgente' ? ', URGENTE' : ''}]  ${r.pedido_em}  ${r.titulo}  (${r.created_by_name ?? '—'}, ${r.arquivos} arquivo(s))`);
} else if (cmd === 'baixar' && num) {
  const [r] = await sql(`select id, numero, titulo, descricao, prioridade, status, created_by_name, to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') pedido_em from update_requests where numero = ${num}`);
  if (!r) throw new Error(`Solicitação #${num} não encontrada.`);
  if (r.status === 'nova' || r.status === 'recusada') console.warn(`Atenção: a solicitação #${num} está "${r.status}" (não aprovada).`);
  const slug = r.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const dir = path.resolve('solicitacoes', `${String(r.numero).padStart(4, '0')}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pedido.md'), `# #${r.numero} ${r.titulo}\n\nPedido por ${r.created_by_name ?? '—'} em ${r.pedido_em} · prioridade ${r.prioridade} · situação ${r.status}\n\n${r.descricao || '(sem texto)'}\n`);
  const files = await sql(`select file_name, content_b64 from update_request_files where request_id = ${lit(r.id)} order by created_at`);
  for (const f of files) {
    const safe = path.basename(f.file_name).replace(/[<>:"/\\|?*]/g, '_');
    fs.writeFileSync(path.join(dir, safe), Buffer.from(f.content_b64, 'base64'));
  }
  console.log(`Salvo em ${dir} (${files.length} arquivo(s)).`);
} else if (cmd === 'iniciar' && num) {
  await sql(`update update_requests set status = 'em_andamento', started_at = now() where numero = ${num} and status = 'aprovada'`);
  console.log(`#${num} em andamento.`);
} else if (cmd === 'concluir' && num) {
  const [versao, ...nota] = rest;
  await sql(`update update_requests set status = 'concluida', done_at = now(), done_version = ${versao ? lit(versao) : 'null'}, done_note = ${nota.length ? lit(nota.join(' ')) : 'null'} where numero = ${num} and status in ('aprovada', 'em_andamento')`);
  console.log(`#${num} concluída${versao ? ` na versão ${versao}` : ''}.`);
} else if (cmd === 'registrar' && arg) {
  // pedido feito direto ao desenvolvimento (chat): entra já aprovado, para ficar no mesmo controle
  //   node scripts/solicitacoes.mjs registrar "título" "descrição" ["quem pediu"] [aprovada|concluida <versao> "nota"] [AAAA-MM-DD HH:MM]
  const [descricao = '', quem = 'Erick (pelo chat)', status = 'aprovada', versao, nota, quando] = rest;
  const at = quando ? `${lit(quando)}::timestamp at time zone 'America/Sao_Paulo'` : 'now()';
  const done = status === 'concluida';
  const [r] = await sql(`insert into update_requests (titulo, descricao, status, created_by, created_by_name, created_at, decided_at, done_at, done_version, done_note)
    values (${lit(arg)}, ${lit(descricao)}, ${lit(done ? 'concluida' : 'aprovada')}, null, ${lit(quem)}, ${at}, ${at}, ${done ? 'now()' : 'null'}, ${versao ? lit(versao) : 'null'}, ${nota ? lit(nota) : 'null'}) returning numero`);
  console.log(`Registrada #${r.numero} (${done ? 'concluída' : 'aprovada, na fila'}).`);
} else {
  console.log('Uso: node scripts/solicitacoes.mjs fila | baixar <n> | iniciar <n> | concluir <n> <versao> "nota"');
}
