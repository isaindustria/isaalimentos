// Fotografa as telas de Produção e Faturamento (Vendas parte 6) com o banco simulado (dados fictícios), em computador ou celular.
// Uso (na pasta do pipeline, ao lado de mock.mjs): node producao/capture.mjs web|mobile
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { installMock } from '../mock.mjs';
import { prepare, recalc } from './setup.mjs';
const MODE = process.argv[2] || 'web';
const MOB = MODE === 'mobile';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const U = 'http://localhost:5179/#';
const S = MOB ? 2.75 : 1.2;
const OUT = path.resolve(`producao/shots_${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: MOB ? { width: 392, height: 760 } : { width: 1600, height: 900 }, deviceScaleFactor: S, isMobile: MOB, hasTouch: MOB, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.addInitScript(() => { try { localStorage.setItem('isa-tutorial-visto', '9.9.9'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('dialog', (d) => d.accept());
const { D } = installMock(p);
const { mk } = prepare(D);
// o simulador responde null às funções do banco: aqui set_item_stage muda a etapa dos itens e recalcula o status do pedido
await p.route((u) => u.pathname.endsWith('/rest/v1/rpc/set_item_stage'), async (r) => {
  const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: H, body: '' });
  const { p_item_ids: ids, p_stage: st } = JSON.parse(r.request().postData() || '{}');
  const its = D.order_items.filter((i) => ids.includes(i.id)); its.forEach((i) => { i.stage = st; });
  [...new Set(its.map((i) => i.order_id))].forEach((o) => recalc(D, o));
  return r.fulfill({ status: 200, headers: H, body: JSON.stringify(its.length) });
});
await p.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.1' }) }));

const meta = {};
const L = (loc) => (typeof loc === 'string' ? p.locator(loc) : loc).first();
async function box(loc) { try { const bb = await L(loc).boundingBox({ timeout: 2500 }); return bb && [bb.x * S, bb.y * S, bb.width * S, bb.height * S].map(Math.round); } catch { return null; } }
async function union(...locs) { const bs = (await Promise.all(locs.map(box))).filter(Boolean); if (!bs.length) return null; const x = Math.min(...bs.map((v) => v[0])), y = Math.min(...bs.map((v) => v[1])); return [x, y, Math.max(...bs.map((v) => v[0] + v[2])) - x, Math.max(...bs.map((v) => v[1] + v[3])) - y]; }
async function scrollTo(loc, block = 'center') { try { await L(loc).evaluate((e, block) => { e.scrollIntoView({ block, inline: 'nearest' }); }, block); } catch { console.log('  sem scroll'); } }
async function snap(id, boxes = {}, target, block) {
  if (target) await scrollTo(target, block);
  await p.mouse.move(2, MOB ? 700 : 880); await p.waitForTimeout(700);
  const B = {}; for (const [k, l] of Object.entries(boxes)) { const r = Array.isArray(l) ? await union(...l) : await box(l); if (r) B[k] = r; else console.log('  sem caixa', id, k); }
  await p.screenshot({ path: `${OUT}/${id}.png` }); meta[id] = B; console.log('snap', id);
}
const hideToasts = () => p.addStyleTag({ content: '[data-sonner-toaster]{display:none!important}' });
const top = () => p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, .overflow-y-auto').forEach((e) => { e.scrollTop = 0; }); });
const go = async (h) => { await p.goto(U + h); await p.reload(); await p.waitForTimeout(2400); await hideToasts(); await top(); };
const card = (n) => p.locator('main section.card', { hasText: `Pedido #${n}` });
const btn = (scope, name) => scope.getByRole('button', { name, exact: true });
// rolagem horizontal da tabela (celular)
const hscroll = (tbl, to) => tbl.evaluate((t, to) => { let e = t.parentElement; while (e && e.scrollWidth <= e.clientWidth) e = e.parentElement; if (e) e.scrollLeft = to === 'end' ? e.scrollWidth : to; }, to);

await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
await p.fill('input[type=email]', 'demo@isaalimentos.com.br'); await p.fill('input[type=password]', 'senha-demo');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }); await p.waitForTimeout(1500);

// 1) Produção: necessidade
await go('/producao');
const stats = p.locator('main div.card', { hasText: 'Produtos a produzir' }), statsAll = [stats, p.locator('main div.card', { hasText: 'Pedidos na produção' })];
const tabs = p.locator('main [role=tablist]'), tabNec = p.getByRole('tab', { name: /Necessidade/ }), tabPed = p.getByRole('tab', { name: /Pedidos na produção/ });
const tbl = p.locator('main table').first(), r471 = tbl.locator('tbody tr', { hasText: 'PAPRICA DEFUMADA - 10 KG' }), r264 = tbl.locator('tbody tr', { hasText: 'PAPRICA DEFUMADA - 5 KG' });
const th = (t) => tbl.locator('th', { hasText: t }), td = (r, i) => r.locator('td').nth(i);
const nota = p.getByText('Necessidade = pedido', { exact: false });
const imp = p.getByRole('button', { name: 'Importar cadastro da produção' });
const necBoxes = () => ({ stats: statsAll, tabs, tabNec, tabPed, tabela: tbl, r471, r264, nota, importar: imp,
  pedido: [th('Pedido'), td(r471, 3)], estoque: [th('Estoque'), td(r471, 4)], alt: [th('Alternativo'), td(r471, 5)], semi: [th('Semiacabado'), td(r471, 6)],
  nec: [th('Necessidade'), td(r471, 7)], min: [th('Prod. mín.'), td(r471, 8)], produzir: [th('Produzir'), td(r471, 9)], calc: [th('Pedido'), td(r471, 9)],
  minProd: [th('Necessidade'), td(r471, 9)], prod471: td(r471, 9), at264: td(r264, 9), r264all: r264 });
await snap('nec', necBoxes(), null);
if (MOB) {
  await snap('nec_tab', necBoxes(), tbl, 'start');
  await th('Pedido').evaluate((h) => { let e = h.closest('table').parentElement; while (e && e.scrollWidth <= e.clientWidth) e = e.parentElement; if (e) e.scrollLeft = h.offsetLeft - 8; }); await snap('nec_mid', necBoxes(), null);
  await hscroll(tbl, 'end'); await snap('nec_end', necBoxes(), null);
  await hscroll(tbl, 0);
}
await snap('nec_nota', { nota, tabela: tbl }, nota);
await top();

// 7) Importar cadastro da produção
await snap('importar_btn', { importar: imp }, null);
await imp.click(); await p.waitForTimeout(900);
const dlg = p.locator('[role=dialog]').last();
await dlg.locator('input[type=file]').setInputFiles(path.resolve('producao/cadastro-producao-ficticio.xlsx')); await p.waitForTimeout(1200);
const inc = dlg.getByRole('button', { name: /^Incluir/ }), sub = dlg.getByRole('button', { name: /^Substituir/ });
const desc = dlg.getByText('Colunas: Código', { exact: false });
await snap('importar', { dialog: dlg, colunas: desc, modos: [inc, sub], incluir: inc, substituir: sub }, null);
await inc.click(); await p.waitForTimeout(500);
await snap('importar_inc', { dialog: dlg, colunas: desc, modos: [inc, sub], incluir: inc, importar: dlg.getByRole('button', { name: 'Importar', exact: true }) }, null);
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
await go('/producao');

// 2) Pedidos na produção
await top(); await tabPed.click(); await p.waitForTimeout(900); await top();
const c1 = card('7101'), c3 = card('7103');
await snap('prod', { tabPed, c1, c3, cards: [c1, c3], emprod: btn(c1, 'Em produção'), item1: c1.locator('li').first() }, MOB ? c1 : null, 'start');
await btn(c1, 'Em produção').click(); await p.waitForTimeout(1500);
await snap('prod_em', { c1, pronto: btn(c1, 'Pronto: Faturamento'), voltar: btn(c1, 'Voltar para aberto'), botoes: [btn(c1, 'Pronto: Faturamento'), btn(c1, 'Voltar para aberto')], item1: c1.locator('li').first() }, MOB ? c1 : null, 'start');

// 3) Rotas de entrega: Faturamento
await go('/rotas');
const f1 = card('7101'), f2 = card('7102');
const fatTxt = p.getByText('Revenda, itens que o estoque', { exact: false });
await snap('fat', { tab: p.getByRole('tab', { name: /Faturamento/ }), f1, f2, cards: [f1, f2], texto: fatTxt, revenda: f1.locator('li').first(), estoque: f2.locator('li').first(), ciente: btn(f1, 'Faturamento ciente') }, MOB ? f1 : null, 'center');
if (MOB) await snap('fat_est', { f2, estoque: f2.locator('li').first() }, f2, 'center');
await btn(f1, 'Faturamento ciente').click(); await p.waitForTimeout(1500);
await snap('fat_ciente', { f1, entregue: btn(f1, 'Entregue'), voltar: btn(f1, 'Voltar para aberto'), botoes: [btn(f1, 'Entregue'), btn(f1, 'Voltar para aberto')], item: f1.locator('li').first(), texto: fatTxt }, MOB ? f1 : null, 'center');

// 4) Pedido misto: revenda no Faturamento, páprica em produção
const o1 = D.orders.find((o) => o.order_number === '7101').id;
await go(`/pedidos/${o1}`);
const itens = p.locator('main section.card', { hasText: 'Itens do pedido' }), itTbl = itens.locator('table');
const etapaTh = itTbl.locator('th', { hasText: 'Etapa' }), etapaTd = itTbl.locator('tbody tr td:last-child');
await snap('detalhe', { itens, tabela: itTbl, etapa: [etapaTh, etapaTd.nth(0), etapaTd.nth(1)], titulo: p.getByRole('heading', { name: 'Revisar pedido' }) }, null);
if (MOB) { await hscroll(itTbl, 'end'); await snap('detalhe_etapa', { tabela: itTbl, etapa: [etapaTh, etapaTd.nth(0), etapaTd.nth(1)], itens }, itTbl, 'center'); await hscroll(itTbl, 0); }

// 5) Produção libera: Pronto: Faturamento
await go('/producao'); await tabPed.click(); await p.waitForTimeout(900); await top();
await btn(card('7101'), 'Pronto: Faturamento').click(); await p.waitForTimeout(1500);
await go('/rotas');
const g1 = card('7101');
await snap('fat_pronto', { g1, itens: g1.locator('ul'), entregue: btn(g1, 'Entregue') }, MOB ? g1 : null, 'center');

// 6) Cores dos status na tela Pedidos (mais pedidos fictícios em cada status)
const c = D.customers;
const st = [['7096', 'entregue', 3], ['7097', 'cancelado', 4], ['7098', 'faturado', 5], ['7099', 'em_producao', 6], ['7100', 'aberto', 7]];
for (const [n, s, i] of st) { const id = mk(n, c[i % c.length], '2026-10-1' + (i % 9), [['881', 10 + i, 'REVENDA']]); D.orders.find((o) => o.id === id).status = s; D.order_items.filter((x) => x.order_id === id).forEach((x) => { x.stage = s === 'cancelado' ? 'aberto' : s; }); }
D.orders.sort((a, b) => (a.order_number < b.order_number ? 1 : -1));
await go('/pedidos');
const ptab = p.locator('main table').first();
const rowOf = (n) => ptab.locator('tbody tr', { hasText: `#${n}` });
await snap('pedidos', { tabela: ptab, cancel: rowOf('7097'), linhas: ptab.locator('tbody') }, ptab, 'start');

await go('/producao'); await snap('fim', {}, null);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
