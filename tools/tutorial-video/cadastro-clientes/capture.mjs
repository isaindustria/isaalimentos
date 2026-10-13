// Fotografa as telas do cadastro de clientes (Vendas parte 3) com o banco simulado (dados fictícios), em computador ou celular.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { installMock } from '../mock.mjs';
import { prepare } from './setup.mjs';
const MODE = process.argv[2] || 'web';
const MOB = MODE === 'mobile';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const U = 'http://localhost:5179/#';
const S = MOB ? 2.75 : 1.2;
const OUT = path.resolve(`clientes/shots_${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const XLSX = path.resolve('clientes/pesquisa-de-pessoas-ficticio.xlsx');
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: MOB ? { width: 392, height: 760 } : { width: 1600, height: 900 }, deviceScaleFactor: S, isMobile: MOB, hasTouch: MOB, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('isa-tutorial-visto', '9.9.9'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('dialog', (d) => d.accept());
const { D, ME } = installMock(p);
prepare(D);
await p.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.1' }) }));

const meta = {};
async function box(loc) { try { const bb = await (typeof loc === 'string' ? p.locator(loc) : loc).first().boundingBox({ timeout: 2500 }); return bb && [bb.x * S, bb.y * S, bb.width * S, bb.height * S].map(Math.round); } catch { return null; } }
// rola até o elemento; a janela (overflow hidden) volta ao lugar para não cortar o título
async function scrollTo(loc) { try { await (typeof loc === 'string' ? p.locator(loc) : loc).first().evaluate((e) => { e.scrollIntoView({ block: 'center', inline: 'center' }); document.querySelectorAll('[role=dialog]').forEach((d) => { d.scrollTop = 0; d.scrollLeft = 0; }); }); } catch { console.log('  sem scroll'); } }
// rola a tabela da janela toda para a direita (coluna Motivo e botão Tirar)
const scrollRight = () => dlg().locator('table').first().evaluate((t) => { for (const c of [t.parentElement, t.closest('.overflow-auto')]) if (c) c.scrollLeft = c.scrollWidth; });
const tbox = () => dlg().locator('table').first().locator('xpath=ancestor::div[contains(@class,"overflow-auto")][1]');
async function snap(id, boxes = {}, target) {
  if (target) await scrollTo(target);
  await p.waitForTimeout(700);
  const B = {}; for (const [k, l] of Object.entries(boxes)) { const r = await box(l); if (r) B[k] = r; else console.log('  sem caixa', id, k); }
  await p.screenshot({ path: `${OUT}/${id}.png` }); meta[id] = B; console.log('snap', id);
}
const dlg = () => p.locator('[role=dialog]').last();
const toasts = () => p.locator('[data-sonner-toast]');
// esconde/mostra os avisos (toasts) sem mexer na árvore do React
const hideToasts = (on) => p.evaluate((on) => { let s = document.getElementById('tut-hide-toasts'); if (on && !s) { s = document.createElement('style'); s.id = 'tut-hide-toasts'; s.textContent = '[data-sonner-toaster]{display:none!important}'; document.head.appendChild(s); } if (!on && s) s.remove(); }, on);
const clearToasts = () => hideToasts(true);

await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
await p.fill('input[type=email]', 'demo@isaalimentos.com.br'); await p.fill('input[type=password]', 'senha-demo');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }); await p.waitForTimeout(1500);

// 1) Cartões
await p.goto(U + '/pedidos'); await p.waitForTimeout(1800);
const cardCli = p.locator('section.card', { hasText: 'Importar cadastro de clientes' });
const cardProd = p.locator('section.card', { hasText: 'Ver produtos' });
await snap('cards', { cli: cardCli, prod: cardProd, ver: p.getByRole('button', { name: 'Ver clientes' }), imp: p.getByRole('button', { name: 'Importar cadastro de clientes' }), verProd: p.getByRole('button', { name: 'Ver produtos' }) }, cardCli);

// 2) Importar: passo 1 (arquivo)
await p.getByRole('button', { name: 'Importar cadastro de clientes' }).click(); await p.waitForTimeout(700);
await snap('imp_open', { dialog: dlg(), drop: dlg().getByText('Arraste a planilha de clientes').locator('xpath=..') }, null);
await dlg().locator('input[type=file]').setInputFiles(XLSX); await p.waitForTimeout(1200);

// 3) Passo 2: colunas
const colRow = (h) => dlg().locator('tbody tr', { hasText: h });
const abatSel = () => p.getByLabel('Campo da coluna Abat. Financeiro');
await snap('imp_cols', { table: tbox(), abat: colRow('Abat. Financeiro'), abatSel: abatSel(), sit: colRow('Situação cadastral'), cod: colRow('Cód.') }, null);
if (MOB) await snap('imp_cols_abat0', { abat: colRow('Abat. Financeiro'), abatName: colRow('Abat. Financeiro').locator('td').first(), sit: colRow('Situação cadastral') }, colRow('Abat. Financeiro').locator('td').first());
if (MOB) await snap('imp_cols_abat', { abat: colRow('Abat. Financeiro'), abatSel: abatSel(), sit: colRow('Situação cadastral') }, abatSel());
await abatSel().selectOption('discounts'); await p.waitForTimeout(400);
await snap('imp_cols_set', { abat: colRow('Abat. Financeiro'), abatSel: abatSel(), sit: colRow('Situação cadastral'), conferir: dlg().getByRole('button', { name: 'Conferir clientes' }) }, abatSel());

// 4) Passo 3: conferência
await dlg().getByRole('button', { name: 'Conferir clientes' }).click(); await p.waitForTimeout(900);
const chips = () => dlg().locator('button', { hasText: /^Todas/ }).locator('xpath=..');
await snap('imp_conf', { chips: chips(), table: tbox(), check: dlg().locator('label', { hasText: 'Atualizar' }) }, null);
await dlg().locator('button', { hasText: /^Novas/ }).click(); await p.waitForTimeout(400);
await snap('imp_novas', { chips: chips(), novas: dlg().locator('button', { hasText: /^Novas/ }), table: tbox() }, null);
await dlg().locator('button', { hasText: /^Já existem/ }).click(); await p.waitForTimeout(400);
const mud = dlg().locator('td', { hasText: '→' });
await snap('imp_exist', { chips: chips(), exist: dlg().locator('button', { hasText: /^Já existem/ }), mud: mud.first(), mudRow: mud.first().locator('xpath=..'), table: tbox() }, MOB ? mud.first() : null);
await dlg().locator('button', { hasText: /^Duplicidades/ }).click(); await p.waitForTimeout(400);
const rDup = dlg().locator('tbody tr', { hasText: 'mesmo CNPJ' }), rErr = dlg().locator('tbody tr', { hasText: 'não tem 14' });
const errCnpj = rErr.locator('input[aria-label^="CNPJ"]');
if (!MOB) await scrollRight();
await snap('imp_prob', { chips: chips(), prob: dlg().locator('button', { hasText: /^Duplicidades/ }), dup: rDup, err: rErr, errCnpj, errMot: rErr.locator('td').nth(6), dupMot: rDup.locator('td').nth(6), dupTirar: rDup.getByRole('button', { name: /Tirar/ }), table: tbox() }, MOB ? errCnpj : null);
const errLabel = await errCnpj.getAttribute('aria-label');
const fixed = () => p.getByLabel(errLabel, { exact: true });
await fixed().fill('62.734.158/0001-09');
await snap('imp_fix', { errCnpj: fixed(), err: fixed().locator('xpath=ancestor::tr[1]') }, MOB ? fixed() : null);
await fixed().blur(); await p.waitForTimeout(500);
if (!MOB) await scrollRight();
const tirar = rDup.getByRole('button', { name: /Tirar/ });
await snap('imp_tirar', { dup: rDup, dupTirar: tirar, chips: chips() }, MOB ? tirar : null);
await tirar.click(); await p.waitForTimeout(400);
await dlg().locator('button', { hasText: /^Todas/ }).click(); await p.waitForTimeout(400);
const check = dlg().locator('label', { hasText: 'Atualizar' });
await check.locator('input[type=checkbox]').check(); await p.waitForTimeout(300);
await snap('imp_ready', { chips: chips(), check, importar: dlg().getByRole('button', { name: 'Importar' }), table: tbox() }, MOB ? check : null);
if (MOB) await snap('imp_ready_btn', { importar: dlg().getByRole('button', { name: 'Importar' }) }, null);
await hideToasts(false);
await dlg().getByRole('button', { name: 'Importar' }).click(); await p.waitForTimeout(1500);
await snap('imp_done', { toast: toasts().first() }, null);
await clearToasts();

// 5) Ver clientes
await p.getByRole('button', { name: 'Ver clientes' }).click(); await p.waitForTimeout(1200);
const thCode = dlg().locator('th', { hasText: 'Código' }), thLast = dlg().locator('th', { hasText: 'Último ped.' });
const first = dlg().locator('tbody tr').first();
await snap('lista', { table: tbox(), thCode, thLast, codeCell: first.locator('td').first(), lastCell: first.locator('td').nth(5), first, exportar: dlg().getByRole('button', { name: 'Exportar cadastro' }) }, null);
if (MOB) await snap('lista_last', { thLast, lastCell: first.locator('td').nth(5), first }, first.locator('td').nth(5));
const semRow = dlg().locator('tbody tr', { hasText: /^Sem pedido ·/ });
await snap('lista_sem', { sem: semRow, semNext: semRow.locator('xpath=following-sibling::tr[1]'), table: tbox() }, semRow.locator('xpath=following-sibling::tr[1]/td[1]'));
const exp = dlg().getByRole('button', { name: 'Exportar cadastro' });
await snap('exportar', { exportar: exp }, exp);

// 6) Excluir x inativar
const rowOf = (nm) => dlg().locator('tbody tr', { hasText: nm });
const trashPad = p.getByRole('button', { name: 'Excluir Padaria Pão Dourado Ltda' });
await snap('lixeira', { trash: trashPad, row: rowOf('Padaria Pão Dourado') }, trashPad);
await trashPad.click(); await p.waitForTimeout(1000);
await snap('del_sem', { dialog: dlg(), excluir: dlg().getByRole('button', { name: 'Excluir definitivamente' }) }, null);
await dlg().getByRole('button', { name: 'Excluir definitivamente' }).click(); await p.waitForTimeout(1200); await clearToasts();
const trashCli = p.getByRole('button', { name: 'Excluir Mercado Estrela Ltda' });
await scrollTo(trashCli); await trashCli.click(); await p.waitForTimeout(1000);
await snap('del_com', { dialog: dlg(), inativar: dlg().getByRole('button', { name: 'Inativar cliente' }) }, null);
await dlg().getByRole('button', { name: 'Inativar cliente' }).click(); await p.waitForTimeout(1200); await clearToasts();
const inat = dlg().locator('label', { hasText: 'Mostrar inativos' });
await inat.locator('input').check(); await p.waitForTimeout(600);
const reat = p.getByRole('button', { name: 'Reativar Mercado Estrela Ltda' });
await snap('inativos', { inat, reat, row: rowOf('Mercado Estrela') }, reat);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);

// 7) Ver produtos (ADM)
await p.getByRole('button', { name: 'Ver produtos' }).click(); await p.waitForTimeout(1000);
await snap('produtos', { dialog: dlg(), busca: dlg().getByPlaceholder('Buscar por código, referência ou nome'), table: tbox() }, null);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// Visão do vendedor
Object.assign(ME, { role: 'vendedor', access: 'editor', is_superadmin: false }); Object.assign(D.profiles[0], ME);
await p.goto(U + '/pedidos'); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
const vp = p.getByRole('button', { name: 'Ver produtos' });
await snap('vend', { prod: p.locator('section.card', { hasText: 'Ver produtos' }), verProd: vp }, vp);
await vp.click(); await p.waitForTimeout(1000);
await snap('vend_prod', { dialog: dlg(), table: tbox() }, null);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.evaluate(() => window.scrollTo(0, 0));
await snap('fim', {}, null);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
