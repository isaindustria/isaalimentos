// Fotografa o app (com banco de demonstração) passo a passo e guarda a posição dos elementos para animar cursor e destaques.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { installMock } from './mock.mjs';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL0 = 'http://localhost:5179/#';
const S = 1.2;
fs.mkdirSync('shots', { recursive: true });
const ONLY = process.argv[2] ? process.argv[2].split(',') : null;
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: S, colorScheme: 'light', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
installMock(p, { log: (s) => console.log('  write', s) });
const meta = fs.existsSync('shots/meta.json') ? JSON.parse(fs.readFileSync('shots/meta.json')) : {};
const demo = (f) => path.resolve('demo', f);

async function bbox(loc) {
  try { const l = typeof loc === 'string' ? p.locator(loc) : loc; const bb = await l.first().boundingBox({ timeout: 2500 }); return bb && [bb.x * S, bb.y * S, bb.width * S, bb.height * S].map(Math.round); } catch { return null; }
}
async function snap(id, boxes = {}) {
  await p.waitForTimeout(900);
  const B = {};
  for (const [k, loc] of Object.entries(boxes)) { const r = await bbox(loc); if (r) B[k] = r; else console.log('  sem caixa', id, k); }
  if (!ONLY || ONLY.includes(id)) await p.screenshot({ path: `shots/${id}.png` });
  meta[id] = B; console.log('snap', id, Object.keys(B).join(' '));
}
const go = async (r) => { await p.goto(URL0 + r, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800); };
const btn = (name) => p.getByRole('button', { name, exact: false });
const txt = (t) => p.getByText(t, { exact: false });
const card = (t) => txt(t).first().locator('xpath=ancestor::section[contains(@class,"card")][1]');
const tab = (t) => p.locator('[role=tablist] button', { hasText: t }).first();
const top = () => p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, main *').forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
const pcard = async (re) => { await p.locator('main button').filter({ hasText: re }).first().click(); await p.waitForTimeout(700); await top(); await p.waitForTimeout(300); };
const dlg = () => p.locator('[role=dialog]').last();
async function importFlow(button, file, mode, shotPrefix) {
  await btn(button).first().click(); await p.waitForTimeout(700);
  await snap(shotPrefix + '_open', { dialog: dlg(), drop: dlg().getByText('Arraste', { exact: false }) });
  await dlg().locator('input[type=file]').setInputFiles(demo(file)); await p.waitForTimeout(1200);
  if (mode) await dlg().getByText(mode, { exact: true }).first().click().catch(() => console.log('  sem modo'));
  await p.waitForTimeout(400);
  await snap(shotPrefix + '_file', { dialog: dlg(), modes: dlg().locator('label:has(input[type=radio])').first().locator('xpath=..'), confirm: dlg().getByRole('button', { name: /importar|confirmar/i }).last() });
  await dlg().getByRole('button', { name: /importar|confirmar/i }).last().click(); await p.waitForTimeout(2200);
  await snap(shotPrefix + '_done', { dialog: dlg() });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  const close = dlg().getByRole('button', { name: /fechar|concluir|ok/i }); if (await close.count()) await close.first().click().catch(() => {});
  await p.waitForTimeout(600);
}

// 1. Acesso
await p.goto(URL0 + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(800);
await snap('login', { email: 'input[type=email]', pass: 'input[type=password]', entrar: btn('Entrar'), criar: txt('Criar conta'), esqueci: txt('Esqueci') });
await p.fill('input[type=email]', 'demo@isaalimentos.com.br'); await p.fill('input[type=password]', 'senha-demo');
await snap('login_filled', { entrar: btn('Entrar') });
await p.keyboard.press('Enter'); await p.waitForTimeout(3500);

// 2. Painel
await snap('dash', { stats: txt('Faturamento 30 dias').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'), needs: card('Maiores necessidades'), menu: 'aside', bell: p.locator('header button:has(svg.lucide-bell)'), atividades: card('Atividades da equipe'), conferir: txt('para conferir').first() });
await p.locator('header button:has(svg.lucide-bell)').first().click().catch(() => console.log('  sem sino')); await p.waitForTimeout(800);
await snap('dash_bell', { panel: p.locator('[role=dialog], [data-radix-popper-content-wrapper]').last() });
await p.locator('header button:has(svg.lucide-bell)').first().click().catch(() => {}); await p.waitForTimeout(500); await p.mouse.click(800, 120);

// 3. Estoque
await go('/estoque');
await snap('estoque', { importar: btn('Importar planilha'), table: 'table', busca: 'input[placeholder*="Buscar"]', lanc: txt('Lançamentos'), cards: txt('Unidades em estoque').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'), exportar: btn('Exportar') });
await p.fill('input[placeholder*="Buscar"]', 'lemon'); await p.waitForTimeout(600);
await snap('estoque_busca', { table: 'table', busca: 'input[placeholder*="Buscar"]' });
await p.fill('input[placeholder*="Buscar"]', '');
await tab('Lançamentos').click(); await p.waitForTimeout(800);
await snap('estoque_lanc', { table: 'table', novo: btn(/novo lançamento|lançar|nova movimentação/i) });
await btn('Importar planilha').first().click(); await p.waitForTimeout(800);
await snap('estoque_import', { dialog: dlg() }); await p.keyboard.press('Escape');

// 4. Pedidos
await go('/pedidos');
await snap('pedidos', { table: 'table', importar: btn('Importar PDF'), novo: p.locator('main').getByRole('button', { name: 'Novo pedido' }), conferir: p.locator('main').getByRole('button', { name: /Conferir/ }), filtros: txt('Todos os status') });
await go('/pedidos/importar');
await snap('ped_import', { drop: txt('Arraste o PDF').first().locator('xpath=ancestor::*[contains(@class,"border-dashed")][1]') });
await go('/pedidos/conferencia');
await snap('conferencia', { item: card('Dúvida'), sug: p.locator('main button:has-text("LIMAO E ERVAS")').first(), confirmar: btn('Confirmar') });
await p.locator('main button:has-text("LIMAO E ERVAS")').first().click().catch(() => console.log('  sem sugestao')); await p.waitForTimeout(500);
await snap('conferencia_sel', { confirmar: btn('Confirmar'), lembrar: txt('Lembrar') });
await go('/pedidos');
await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(1500);
await snap('pedido_det', { table: 'main table', total: txt('Total').last() });

// 5. Produção
await go('/producao');
await pcard(/^Produzir/);
await snap('prod', { cards: txt('Cadastro de produtos').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'), cad: btn('Importar cadastro'), est: btn('Importar estoque atual'), ped: btn('Importar pedido'), exp: btn('Exportar produzir'), imp: btn('Imprimir'), apagar: btn('Apagar cadastro'), info: txt('Quantidade pedida').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'), table: 'main table' });
await importFlow('Importar cadastro', 'cadastro_produtos_ERP.xlsx', 'Incluir', 'prod_cad');
await pcard(/^Cadastro de produtos/);
await snap('prod_cadastro', { table: 'main table', ajuste: txt('ajuste manual').first(), tags: txt('POTE AMARELO').first().locator('xpath=..') });
await importFlow('Importar estoque atual', 'estoque_atual.xlsx', 'Incluir', 'prod_est');
await btn('Importar pedido').first().click(); await p.waitForTimeout(800);
await snap('prod_ped_open', { dialog: dlg() }); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await pcard(/^Estoque \/ Pedido/);
await snap('prod_pedido', { table: 'main table', pend: txt('ajuste').first() });
await pcard(/^Produzir/);
await snap('prod_produzir', { table: 'main table', info: txt('Quantidade pedida').first().locator('xpath=ancestor::div[contains(@class,"grid")][1]'), exp: btn('Exportar produzir'), imp: btn('Imprimir'), kg: p.locator('main th', { hasText: /quilos/i }).first(), sit: p.locator('main th', { hasText: /situa/i }).first() });

// 6. Cadastros
await go('/clientes');
await snap('clientes', { group: card('Independentes'), importar: btn('Importar planilha'), novo: btn('Novo cliente'), busca: 'input[placeholder*="Buscar"]' });
await p.locator('main table tbody tr').first().click(); await p.waitForTimeout(1500);
await snap('cliente_det', { hist: txt('Histórico').first(), pedidos: 'main table' });
await go('/produtos');
await snap('produtos', { table: 'main table', busca: 'input[placeholder*="Buscar"]', apelidos: txt('Apelidos aprendidos') });
await go('/precos');
await snap('precos', { table: 'main table', novo: btn('Novo preço') });

// 7. Insumos
await go('/insumos');
await snap('insumos', { table: 'main table', cons: btn('Importar consumo'), cad: btn('Importar cadastro'), exp: btn('Exportar planilha'), tags: txt('Matéria-prima').first().locator('xpath=..') });
await importFlow('Importar consumo', 'CONSUMO_FABRICA_MP.xlsx', 'Incluir planilha', 'ins_cons');
await tab('Controle de estoque').click(); await p.waitForTimeout(900); await top();
await snap('ins_controle', { table: 'main table', sug: txt('sugest').first(), exp: btn('Exportar planilha'), media: p.locator('main th', { hasText: /média/i }).first(), comprar: p.locator('main td', { hasText: /comprar/i }).first() });

// 8. Rotas, relatórios, auditoria
await go('/rotas'); await snap('rotas', { table: 'main table', romaneio: btn('Romaneio') });
await go('/relatorios'); await snap('relatorios', { tabs: txt('Vendas').first().locator('xpath=..'), prod: card('Por produto'), loja: card('Por loja'), imprimir: btn('Imprimir') });
await go('/auditoria'); await snap('auditoria', { table: 'main table', desfazer: btn('Desfazer') });

// 9. Configurações
await go('/configuracoes');
for (const [id, t] of [['config_users', 'Pedidos de acesso'], ['config_push', 'Notificações neste aparelho'], ['config_backup', 'Backups do banco']]) {
  const l = p.locator('section.card > header', { hasText: t }).first(); await l.scrollIntoViewIfNeeded().catch(() => console.log('  sem secao', t)); await p.evaluate(() => window.scrollBy(0, -80)); await p.waitForTimeout(600);
  await snap(id, { sec: l.locator('xpath=..'), users: p.locator('section.card', { has: p.locator('header', { hasText: 'Usuários' }) }).last(), aprovar: btn('Aprovar') });
}
fs.writeFileSync('shots/meta.json', JSON.stringify(meta, null, 1));
await b.close();
