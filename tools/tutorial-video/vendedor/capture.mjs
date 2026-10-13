// Fotografa as telas do vendedor (Vendas parte 4) com o banco simulado (dados fictícios), em computador ou celular.
// Uso (na pasta do pipeline, ao lado de mock.mjs): node vendedor/capture.mjs web|mobile
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { installMock } from '../mock.mjs';
import { prepare, OPEN_FOR } from './setup.mjs';
const MODE = process.argv[2] || 'web';
const MOB = MODE === 'mobile';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const U = 'http://localhost:5179/#';
const S = MOB ? 2.75 : 1.2;
const OUT = path.resolve(`vendedor/shots_${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: MOB ? { width: 392, height: 760 } : { width: 1600, height: 900 }, deviceScaleFactor: S, isMobile: MOB, hasTouch: MOB, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('isa-tutorial-visto', '9.9.9'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('dialog', (d) => d.accept());
const { D, ME } = installMock(p);
prepare(D, ME);
await p.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.1' }) }));

const meta = {};
const L = (loc) => (typeof loc === 'string' ? p.locator(loc) : loc).first();
async function box(loc) { try { const bb = await L(loc).boundingBox({ timeout: 2500 }); return bb && [bb.x * S, bb.y * S, bb.width * S, bb.height * S].map(Math.round); } catch { return null; } }
// união de várias caixas (ex.: dois botões lado a lado)
async function union(...locs) { const bs = (await Promise.all(locs.map(box))).filter(Boolean); if (!bs.length) return null; const x = Math.min(...bs.map((v) => v[0])), y = Math.min(...bs.map((v) => v[1])); return [x, y, Math.max(...bs.map((v) => v[0] + v[2])) - x, Math.max(...bs.map((v) => v[1] + v[3])) - y]; }
async function scrollTo(loc, block = 'center') { try { await L(loc).evaluate((e, block) => { e.scrollIntoView({ block, inline: 'nearest' }); document.querySelectorAll('[role=dialog]').forEach((d) => { d.scrollTop = 0; d.scrollLeft = 0; }); }, block); } catch { console.log('  sem scroll'); } }
async function snap(id, boxes = {}, target, block) {
  if (target) await scrollTo(target, block);
  await p.waitForTimeout(700);
  const B = {}; for (const [k, l] of Object.entries(boxes)) { const r = Array.isArray(l) ? await union(...l) : await box(l); if (r) B[k] = r; else console.log('  sem caixa', id, k); }
  await p.screenshot({ path: `${OUT}/${id}.png` }); meta[id] = B; console.log('snap', id);
}
const dlg = () => p.locator('[role=dialog]').last();
const tbox = () => dlg().locator('table').first().locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');
const hideToasts = (on) => p.evaluate((on) => { let s = document.getElementById('tut-hide-toasts'); if (on && !s) { s = document.createElement('style'); s.id = 'tut-hide-toasts'; s.textContent = '[data-sonner-toaster]{display:none!important}'; document.head.appendChild(s); } if (!on && s) s.remove(); }, on);
const top = () => p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, .overflow-y-auto').forEach((e) => { e.scrollTop = 0; }); });

await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
await p.fill('input[type=email]', 'paula@exemplo.com'); await p.fill('input[type=password]', 'senha-demo');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }); await p.waitForTimeout(1500);
await hideToasts(true);

// 1) Tela Pedidos do vendedor
await p.goto(U + '/pedidos'); await p.waitForTimeout(2200); await top();
const cardCli = p.locator('section.card', { hasText: 'Meus clientes' }), cardProd = p.locator('section.card', { hasText: 'Ver produtos' });
const comoUsar = p.locator('main').getByRole('button', { name: 'Como usar' }), novo = p.locator('main').getByRole('button', { name: 'Novo pedido' });
await snap('pedidos', { cards: [cardCli, cardProd], cli: cardCli, topRow: [comoUsar, novo], novo, comoUsar, verCli: p.getByRole('button', { name: 'Ver clientes' }), tabela: p.locator('main table').first() }, null);

// 2) Meus clientes
await p.getByRole('button', { name: 'Ver clientes' }).click(); await p.waitForTimeout(1300);
const first = dlg().locator('tbody tr').first();
const thLast = dlg().locator('th', { hasText: 'Último ped.' }), thDisc = dlg().locator('th', { hasText: 'Desconto financeiro' });
const exp = dlg().getByRole('button', { name: 'Exportar cadastro' });
await snap('lista', { dialog: dlg(), table: tbox(), first, lastCell: first.locator('td').nth(5), thLast, lastCol: [thLast, first.locator('td').nth(5)], discCell: first.locator('td').nth(4), discCol: [thDisc, first.locator('td').nth(4)], exportar: exp }, null);
if (MOB) await snap('lista_last', { lastCell: first.locator('td').nth(5), lastCol: [thLast, first.locator('td').nth(5)], thLast }, first.locator('td').nth(5));
if (MOB) await snap('lista_disc', { discCell: first.locator('td').nth(4), discCol: [thDisc, first.locator('td').nth(4)] }, first.locator('td').nth(4));
const semRow = dlg().locator('tbody tr', { hasText: /^Sem pedido ·/ });
await snap('lista_sem', { sem: semRow, semGroup: [semRow, semRow.locator('xpath=following-sibling::tr[2]')], table: tbox() }, semRow.locator('xpath=following-sibling::tr[1]/td[1]'));
await snap('exportar', { exportar: exp }, exp);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

// 3) Pedido novo
await p.goto(U + '/pedidos/novo'); await p.waitForTimeout(2000); await top();
await snap('form_vazio', { cliente: p.getByLabel('Cliente / loja', { exact: true }) }, null);
const cli = p.getByLabel('Cliente / loja', { exact: true });
await cli.click(); await cli.pressSequentially('Empório', { delay: 40 }); await p.waitForTimeout(600);
const opt = p.getByRole('option', { name: new RegExp(OPEN_FOR) });
await snap('form_cli', { cliente: [cli, p.getByRole('listbox')], cliField: cli, cnpj: p.getByLabel('CNPJ', { exact: true }), opt }, null);
await opt.first().click(); await p.waitForTimeout(1300);
await snap('dup', { dialog: dlg(), botoes: [dlg().getByRole('button', { name: 'Não', exact: true }), dlg().getByRole('button', { name: 'Sim, continuar' })], nao: dlg().getByRole('button', { name: 'Não', exact: true }), sim: dlg().getByRole('button', { name: 'Sim, continuar' }) }, null);
await dlg().getByRole('button', { name: 'Sim, continuar' }).click(); await p.waitForTimeout(600);
await p.getByLabel('Desconto financeiro').selectOption('3'); await p.waitForTimeout(400);
await p.locator('#numero').fill('7037'); await p.locator('#entrega').fill('2026-10-20'); await p.waitForTimeout(300); await p.evaluate(() => document.activeElement?.blur());
const vend = p.locator('#vendedor'), desc = p.getByLabel('Desconto financeiro');
await snap('form_disc', { vendedor: vend, desconto: desc, vendDesc: [vend, desc], cliente: cli, numero: p.locator('#numero') }, MOB ? desc : null);

// itens: sacaria em kg e pote em unidade
async function pick(label, text, rx) { const i = p.getByLabel(label, { exact: true }); await i.click(); await i.fill(''); await i.pressSequentially(text, { delay: 30 }); await p.waitForTimeout(500); await p.getByRole('option', { name: rx }).first().click(); await p.waitForTimeout(400); }
await pick('Produto da linha 1', 'Páprica', /PAPRICA DOCE/i);
await p.getByLabel('Quantidade da linha 1').fill('10'); await p.getByLabel('Valor unitário da linha 1').fill('38.50');
await p.getByRole('button', { name: 'Adicionar item' }).click(); await p.waitForTimeout(400);
await pick('Referência da linha 2', 'POTE', /POTE TEMP/i);
const r2 = p.getByLabel('Produto da linha 2', { exact: true }); await r2.click(); await r2.pressSequentially('Pega Marido', { delay: 30 }); await p.waitForTimeout(500);
await snap('form_busca', { lista: p.getByRole('listbox'), prod2: [r2, p.getByRole('listbox')], refs: [p.getByLabel('Referência da linha 2', { exact: true }), p.getByLabel('Código da linha 2', { exact: true }), r2] }, MOB ? r2 : null, MOB ? 'start' : 'center');
await p.getByRole('option', { name: /PEGA MARIDO/i }).first().click(); await p.waitForTimeout(400);
await p.getByLabel('Quantidade da linha 2').fill('48'); await p.getByLabel('Valor unitário da linha 2').fill('4.90'); await p.waitForTimeout(400);
await p.evaluate(() => document.activeElement?.blur());
const itensCard = p.locator('section, div.card').filter({ has: p.getByText('Itens do pedido', { exact: true }) }).last();
const qp1 = [p.getByLabel('Quantidade da linha 1'), p.getByLabel('Valor unitário da linha 1')], qp2 = [p.getByLabel('Quantidade da linha 2'), p.getByLabel('Valor unitário da linha 2')];
await snap('form_itens', { itens: itensCard, linha1: [p.getByLabel('Referência da linha 1', { exact: true }), p.getByLabel('Valor unitário da linha 1')], qtd: [...qp1, ...qp2], qtd1: qp1, ref1: [p.getByLabel('Referência da linha 1', { exact: true }), p.getByLabel('Produto da linha 1', { exact: true })] }, MOB ? p.getByLabel('Produto da linha 1', { exact: true }) : p.getByLabel('Produto da linha 2', { exact: true }), MOB ? 'start' : 'center');
if (MOB) await snap('form_itens2', { qtd2: qp2, linha2: [p.getByLabel('Referência da linha 2', { exact: true }), p.getByLabel('Valor unitário da linha 2')] }, p.getByLabel('Valor unitário da linha 2'));
const perg = p.locator('fieldset').filter({ hasText: 'outras embalagens' });
const sim = perg.getByRole('radio', { name: 'Sim' }), salvar = p.getByRole('button', { name: 'Salvar pedido' });
await snap('form_perg', { perg, botoes: [sim, perg.getByRole('radio', { name: 'Não' })] }, perg);
await sim.click(); await p.waitForTimeout(400);
await snap('form_perg_sim', { perg, sim, salvar }, perg);
await snap('form_salvar', { salvar, perg, sim }, salvar);
await salvar.click(); await p.waitForURL((u) => /pedidos\/[0-9a-f-]{36}$/.test(u.hash), { timeout: 15000 }); await p.waitForTimeout(1800); await top();

// 4) Pedido salvo
const acts = ['Voltar', 'Editar', 'Imprimir', 'Novo pedido'].map((n) => p.locator('main').getByRole('button', { name: n, exact: true }));
const packBox = p.getByText('Outras embalagens de medida:', { exact: false }).locator('xpath=..');
await snap('detalhe', { acoes: acts, imprimir: acts[2], novo: acts[3], editar: acts[1], pack: packBox }, null);
await snap('detalhe_pack', { pack: packBox, acoes: acts }, packBox);

// 5) Lista de pedidos e filtros
await p.goto(U + '/pedidos'); await p.waitForTimeout(2000); await top();
const tabela = p.locator('main table').first(), rodape = p.locator('main tfoot').first();
const fStatus = p.getByLabel('Status', { exact: true }), fCli = p.getByLabel('Cliente', { exact: true });
await snap('lista_ped', { tabela, rodape, filtros: [fStatus, fCli], linha: p.locator('main tbody tr').first() }, tabela, 'start');
await snap('lista_rodape', { rodape, tabela }, rodape);
if (MOB) { await tabela.evaluate((t) => { let e = t.parentElement; while (e && e.scrollWidth <= e.clientWidth) e = e.parentElement; if (e) e.scrollLeft = e.scrollWidth; }); await snap('lista_valor', { rodape, tabela, valor: p.locator('main tfoot td').nth(1) }, rodape); await tabela.evaluate((t) => { let e = t.parentElement; while (e && e.scrollWidth <= e.clientWidth) e = e.parentElement; if (e) e.scrollLeft = 0; }); }
await fStatus.selectOption('aberto'); await p.waitForTimeout(400);
await fCli.selectOption({ label: OPEN_FOR }); await p.waitForTimeout(900);
await snap('filtros', { filtros: [fStatus, fCli], status: fStatus, cliente: fCli, linha: p.locator('main tbody tr').first(), tabela }, fStatus, 'start');
await fStatus.selectOption('todos'); await fCli.selectOption(''); await p.waitForTimeout(800); await top();
await snap('fim', {}, null);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
