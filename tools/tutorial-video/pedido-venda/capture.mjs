// Fotografa as telas do pedido de venda (dados fictícios) em computador ou celular e guarda a posição dos elementos.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { installMock } from '../mock.mjs';
const MODE = process.argv[2] || 'web';
const MOB = MODE === 'mobile';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const U = 'http://localhost:5179/#';
const S = MOB ? 2.75 : 1.2;
const OUT = path.resolve(`vendas/shots_${MODE}`); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: exe });
const ctx = await b.newContext({ viewport: MOB ? { width: 392, height: 760 } : { width: 1600, height: 900 }, deviceScaleFactor: S, isMobile: MOB, hasTouch: MOB, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p.on('dialog', (d) => d.accept());
const { D, ME } = installMock(p);
await p.route('**/version.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.1' }) }));
const seller = { id: '0000aaaa-0000-4000-8000-00000000aaaa', name: 'Paula Vendas', email: 'paula@exemplo.com', role: 'vendedor', access: 'editor', status: 'ativo', is_superadmin: false, created_at: new Date().toISOString() };
D.profiles.push(seller);
D.customers.forEach((c, i) => { if (i % 2 === 0) { c.seller_id = seller.id; c.seller_name = 'Paula Vendas'; } c.financial_discounts = i % 3 === 0 ? [3, 1] : i % 3 === 1 ? [2] : []; });
D.app_settings.push({ key: 'sale_unit_rules', value: { ander: 'kg', isa: 'kg', 'pote temp': 'un', 'pote frut': 'un', revenda: 'un' } });
const refs = ['ISA', 'pote temp.', 'pote temp.', 'Ander', 'pote frut.', 'Revenda'];
D.products.forEach((x, i) => { x.reference = refs[i % refs.length]; });
D.products.push({ code: '000900', description: 'TEMPERO ISA GRANEL', reference: 'ISA', units_per_box: 1, weight_g: 1000, unit: 'UN', category: null, min_stock: 0, active: true, created_at: '', updated_at: '' });
D.products.push({ code: '000901', description: 'AMEIXA SECA POTE 200G', reference: 'pote frut.', units_per_box: 60, weight_g: 200, unit: 'UN', category: null, min_stock: 0, active: true, created_at: '', updated_at: '' });

const meta = {};
async function box(loc) { try { const bb = await (typeof loc === 'string' ? p.locator(loc) : loc).first().boundingBox({ timeout: 2500 }); return bb && [bb.x * S, bb.y * S, bb.width * S, bb.height * S].map(Math.round); } catch { return null; } }
async function snap(id, boxes = {}, scrollTo) {
  if (scrollTo) { try { await (typeof scrollTo === 'string' ? p.locator(scrollTo) : scrollTo).first().evaluate((e) => e.scrollIntoView({ block: 'center' })); } catch { console.log('  sem scroll', id); } }
  await p.waitForTimeout(700);
  const B = {}; for (const [k, l] of Object.entries(boxes)) { const r = await box(l); if (r) B[k] = r; else console.log('  sem caixa', id, k); }
  await p.screenshot({ path: `${OUT}/${id}.png` }); meta[id] = B; console.log('snap', id);
}
const dlg = () => p.locator('[role=dialog]').last();
const pickFrom = async (label, text, choose) => { const i = p.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await p.waitForTimeout(300); await p.getByRole('option', { name: new RegExp(choose ?? text, 'i') }).first().click(); await p.waitForTimeout(200); };

await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
await p.fill('input[type=email]', 'demo@isaalimentos.com.br'); await p.fill('input[type=password]', 'senha-demo');
await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }); await p.waitForTimeout(1500);

await p.goto(U + '/pedidos'); await p.waitForTimeout(1800);
const cardCli = p.locator('section.card', { hasText: 'Importar cadastro de clientes' });
const cardProd = p.locator('section.card', { hasText: 'Importar produtos' });
await snap('cards', { cli: cardCli, prod: cardProd, impCli: p.getByRole('button', { name: 'Importar cadastro de clientes' }), impProd: p.getByRole('button', { name: 'Importar produtos' }) }, cardCli);

await p.getByRole('button', { name: 'Importar cadastro de clientes' }).click(); await p.waitForTimeout(600);
await snap('imp_cli_open', { dialog: dlg(), modelo: dlg().getByRole('button', { name: 'Baixar modelo' }) }, dlg().getByRole('button', { name: 'Baixar modelo' }));
await dlg().locator('input[type=file]').setInputFiles(path.resolve('vendas/clientes.xlsx')); await p.waitForTimeout(1200);
await snap('imp_cli_prev', { chips: dlg().locator('button', { hasText: /^Todas/ }).locator('xpath=..'), table: dlg().locator('table'), importar: dlg().getByRole('button', { name: 'Importar' }), erro: dlg().locator('td', { hasText: 'não tem 14 dígitos' }) }, dlg().locator('button', { hasText: /^Todas/ }));
await dlg().getByRole('button', { name: 'Importar' }).click(); await p.waitForTimeout(1500);

await p.getByRole('button', { name: 'Importar produtos' }).click(); await p.waitForTimeout(600);
await dlg().locator('input[type=file]').setInputFiles(path.resolve('vendas/produtos.xlsx')); await p.waitForTimeout(1200);
await snap('imp_prod_prev', { chips: dlg().locator('button', { hasText: /^Todas/ }).locator('xpath=..'), table: dlg().locator('table'), erro: dlg().locator('td', { hasText: 'outra referência' }) }, dlg().locator('button', { hasText: /^Todas/ }));
await dlg().getByRole('button', { name: 'Cancelar' }).click(); await p.waitForTimeout(500);

await p.getByRole('button', { name: 'Ver clientes' }).click(); await p.waitForTimeout(800);
const row = dlg().locator('tbody tr').first();
await snap('clientes', { table: dlg().locator('table'), seller: row.locator('select'), disc: row.locator('input') }, dlg().locator('table'));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

await p.goto(U + '/pedidos/novo'); await p.waitForTimeout(1800);
await snap('novo', { cliente: '#cliente', cnpj: '#cnpj' }, '#cliente');
const c0 = D.customers[0];
await pickFrom('CNPJ', c0.cnpj.slice(0, 8), c0.trade_name ?? c0.name);
await snap('novo_cli', { cliente: '#cliente', cnpj: '#cnpj', desconto: '#desconto', vendedor: p.getByText('Vendedor:').first() }, '#cnpj');
await p.selectOption('#desconto', '3');
await pickFrom('Referência da linha 1', 'isa', '^ISA$');
await snap('item_ref', { ref: p.getByLabel('Referência da linha 1', { exact: true }), prod: p.getByLabel('Produto da linha 1', { exact: true }) }, p.getByLabel('Referência da linha 1', { exact: true }));
await pickFrom('Produto da linha 1', 'GRANEL', 'TEMPERO ISA GRANEL');
await p.getByLabel('Quantidade da linha 1').fill('10'); await p.getByLabel('Valor unitário da linha 1').fill('6.60');
await p.getByRole('button', { name: 'Adicionar item' }).click();
await pickFrom('Código da linha 2', '000901', '000901');
await p.getByLabel('Quantidade da linha 2').fill('120'); await p.getByLabel('Valor unitário da linha 2').fill('12.40');
const itemRow = (n) => p.getByLabel(`Produto da linha ${n}`, { exact: true }).locator('xpath=ancestor::div[contains(@class,"grid-cols-2")][1]');
await snap('itens', { linha1: itemRow(1), linha2: itemRow(2), q1: p.getByLabel('Quantidade da linha 1'), cod2: p.getByLabel('Código da linha 2', { exact: true }), ref2: p.getByLabel('Referência da linha 2', { exact: true }) }, MOB ? itemRow(2) : itemRow(1));
await snap('totais', { totais: p.locator('dl').first(), desconto: '#desconto' }, p.locator('dl').first());
await p.getByLabel('Quantidade da linha 2').fill('2.5');
await p.getByRole('button', { name: 'Salvar pedido' }).click(); await p.waitForTimeout(600);
await snap('erro_un', { q2: p.getByLabel('Quantidade da linha 2'), msg: p.getByText('Produto vendido por unidade').first() }, p.getByLabel('Quantidade da linha 2'));
await p.getByLabel('Quantidade da linha 2').fill('120');
await p.getByRole('button', { name: 'Salvar pedido' }).click(); await p.waitForTimeout(2200);
await snap('detalhe', { itens: p.locator('section.card', { hasText: 'Itens do pedido' }), totais: p.locator('dl').last() }, p.locator('dl').last());
await p.evaluate(() => window.scrollTo(0, 0));
await snap('detalhe_top', {}, null);

// Visão do vendedor
Object.assign(ME, { role: 'vendedor', access: 'editor', is_superadmin: false }); Object.assign(D.profiles[0], ME);
await p.goto(U + '/pedidos'); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
await snap('vendedor', MOB ? { novo: p.getByRole('button', { name: 'Novo pedido' }).first() } : { menu: 'aside', novo: p.locator('main').getByRole('button', { name: 'Novo pedido' }) }, null);
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
await b.close();
