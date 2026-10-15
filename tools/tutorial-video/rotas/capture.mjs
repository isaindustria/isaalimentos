// Fotografa as telas de Rotas de entrega (faturamento e rota, versão 1.11.4) com o banco simulado (dados fictícios), em computador ou celular.
// Uso (na pasta do pipeline, ao lado de mock.mjs): node rotas/capture.mjs web|mobile   (depois: python rotas/pdfshot.py web|mobile)
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
const OUT = path.resolve(`rotas/shots_${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: MOB ? { width: 392, height: 760 } : { width: 1600, height: 900 }, deviceScaleFactor: S, isMobile: MOB, hasTouch: MOB, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('isa-tutorial-visto', '9.9.9'); } catch {} });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('dialog', (d) => d.accept());
const { D } = installMock(p);
prepare(D);
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
const btn = (scope, name) => scope.getByRole('button', { name, exact: true });
// rolagem horizontal da tabela (celular)
const hscroll = (tbl, to) => tbl.evaluate((t, to) => { let e = t.parentElement; while (e && e.scrollWidth <= e.clientWidth) e = e.parentElement; if (e) e.scrollLeft = to === 'end' ? e.scrollWidth : to; }, to);

await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
await p.fill('input[type=email]', 'demo@isaalimentos.com.br'); await p.fill('input[type=password]', 'senha-demo');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }); await p.waitForTimeout(1500);

// ---- Faturamento: o cartão do pedido 7101 ----
await go('/rotas');
const card = (n) => p.locator('main section.card').filter({ has: p.getByRole('link', { name: n, exact: true }) });
const tabFat = p.getByRole('tab', { name: /Faturamento/ }), tabMontar = p.getByRole('tab', { name: /Montar rota/ }), tabRotas = p.getByRole('tab', { name: /^Rotas/ });
const pdfBtn = p.getByRole('button', { name: 'Exportar PDF' });
function cardBoxes(c) {
  const head = c.locator('div.grid').first(), tbl = c.locator('table'), th = (t) => tbl.locator('th', { hasText: t });
  const rProd = tbl.locator('tbody tr', { hasText: 'PAPRICA' }), rRev = tbl.locator('tbody tr', { hasText: 'ALHO' });
  const col = (i) => [tbl.locator('thead th').nth(i), rProd.locator('td').nth(i), rRev.locator('td').nth(i)];
  const foot = c.locator('div.border-t').filter({ hasText: 'Observações' }), obs = foot.locator('div').filter({ hasText: /^Observações/ }).first(), tot = foot.locator('dl');
  return { card: c, head, cliente: head.locator('> div').nth(1), tabela: tbl, rProd, rRev, valores: [...col(2), ...col(5)], status: [...col(6), ...col(7)], sit: col(7),
    itens: [th('Código'), rRev], foot, obs, totais: tot, total: tot.locator('div').last(),
    ciente: btn(c, 'Faturamento ciente'), entregue: btn(c, 'Entregue'), voltar: btn(c, 'Voltar para aberto'), aviso: c.getByText('Entregue fica liberado', { exact: false }),
    botoes: [btn(c, 'Faturamento ciente'), btn(c, 'Entregue'), btn(c, 'Voltar para aberto')], pdf: pdfBtn, tab: tabFat,
    libEnt: [rProd, btn(c, 'Entregue')], entAviso: [btn(c, 'Entregue'), c.getByText('Entregue fica liberado', { exact: false })] };
}
const c1 = card('7101');
await snap('fat', cardBoxes(c1), MOB ? c1 : null, 'start');
if (MOB) {
  await hscroll(c1.locator('table'), 'end'); await snap('fat_end', cardBoxes(c1), null); await hscroll(c1.locator('table'), 0);
  await snap('fat_foot', cardBoxes(c1), c1.locator('dl'), 'center');
}
await btn(c1, 'Faturamento ciente').click(); await p.waitForTimeout(1600);
await snap('fat_ciente', cardBoxes(c1), MOB ? c1 : null, 'start');
if (MOB) { await hscroll(c1.locator('table'), 'end'); await snap('fat_ciente_end', cardBoxes(c1), null); await hscroll(c1.locator('table'), 0); await snap('fat_ciente_foot', cardBoxes(c1), c1.locator('dl'), 'center'); }

// O PCP libera a páprica (Pronto: Faturamento) — feito direto no banco simulado
D.order_items.filter((i) => i.product_code === '471' && D.orders.find((o) => o.id === i.order_id)?.order_number === '7101').forEach((i) => { i.stage = 'faturado'; });
D.orders.forEach((o) => recalc(D, o.id));
await go('/rotas');
await snap('fat_lib', cardBoxes(c1), MOB ? c1 : null, 'start');
if (MOB) { await hscroll(c1.locator('table'), 'end'); await snap('fat_lib_end', cardBoxes(c1), null); await hscroll(c1.locator('table'), 0); }
await snap('fat_foot2', cardBoxes(c1), MOB ? c1.locator('dl') : null, 'center');
// Exportar PDF
await top(); await p.waitForTimeout(300);
await snap('fat_pdf', cardBoxes(c1), null);
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), pdfBtn.click()]);
await dl.saveAs(path.resolve('rotas/faturamento.pdf')); console.log('pdf salvo');

// ---- Montar rota: cadastrar veículo ----
await top(); await tabMontar.click(); await p.waitForTimeout(1400);
const nova = p.locator('main section.card', { hasText: 'Nova rota' }), lista = p.locator('main section.card', { hasText: 'Pedidos aguardando entrega' });
const criar = btn(nova, 'Criar rota'), cad = btn(nova, 'Cadastrar veículo');
const carga = nova.locator('div.rounded-xl', { hasText: 'peso da carga' });
const veicSel = nova.locator('select'), motorista = nova.getByPlaceholder('Digite o nome do motorista'), nome = nova.getByPlaceholder('Ex.: Santos e Guarujá');
const chk = (n) => lista.locator('label', { hasText: `#${n}` });
const montarBoxes = () => ({ lista, nova, carga, criar, cad, botoes: [criar, cad], veiculo: veicSel, motorista, nome, tab: tabMontar,
  kg: ['7101', '7102', '7103', '7104'].map((n) => chk(n).locator('span.num')), r7101: chk('7101'), r7104: chk('7104'), campos: [veicSel, motorista], cargaCriar: [carga, criar], motoCarga: [motorista, carga] });
await snap('veic_btn', montarBoxes(), MOB ? cad : null, 'center');
await cad.click(); await p.waitForTimeout(900);
const dlg = p.locator('[role=dialog]').last();
await dlg.getByPlaceholder('Ducato').fill('Ducato'); await dlg.getByPlaceholder('PLV1G74').fill('PLV1G74'); await dlg.getByPlaceholder('3500').fill('3500'); await p.waitForTimeout(300);
const salvar = btn(dlg, 'Salvar');
const dlgBoxes = () => ({ dialog: dlg, campos: [dlg.getByPlaceholder('Ducato'), dlg.getByPlaceholder('3500')], salvar, lista: dlg.locator('ul') });
await snap('veic_dlg', dlgBoxes(), null);
await salvar.click(); await p.waitForTimeout(1500);
await snap('veic_ok', dlgBoxes(), MOB ? dlg.locator('ul') : null, 'center');
await btn(dlg, 'Fechar').click(); await p.waitForTimeout(800);

// ---- Montar rota: pedidos, peso da carga e capacidade ----
await top();
await snap('montar', montarBoxes(), MOB ? lista : null, 'start');
for (const n of ['7101', '7102', '7103', '7104']) await chk(n).locator('input').check();
const duc = D.vehicles.find((v) => v.plate === 'PLV1G74');
if (!duc) console.log('SEM DUCATO'); else await veicSel.selectOption(duc.id);
await p.waitForTimeout(700);
if (MOB) await snap('montar_sel_lista', montarBoxes(), lista, 'start');
await snap('montar_sel', montarBoxes(), MOB ? carga : null, 'center');
await chk('7101').locator('input').uncheck();
await nome.fill('Itaquá, Guarulhos e Arujá'); await motorista.fill('Marcos Ribeiro'); await p.waitForTimeout(700);
await snap('montar_ok', montarBoxes(), MOB ? carga : null, 'center');
await criar.click(); await p.waitForTimeout(1600);
await top();
const rt = p.locator('main table').first();
await snap('rotas', { tabela: rt, nova: rt.locator('tbody tr', { hasText: 'Marcos Ribeiro' }), tab: tabRotas }, null);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
