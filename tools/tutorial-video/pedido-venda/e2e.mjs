// Teste de ponta a ponta do pedido de venda contra o simulador (nenhum dado real).
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { installMock } from '../mock.mjs';
const exe = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const U = 'http://localhost:5179/#';
const OUT = path.resolve('vendas/shots'); fs.mkdirSync(OUT, { recursive: true });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

async function session(role) {
  const b = await chromium.launch({ executablePath: exe });
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 }, locale: 'pt-BR' })).newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  p.on('dialog', (d) => d.accept());
  const { D, ME } = installMock(p);
  const seller = { id: '0000aaaa-0000-4000-8000-00000000aaaa', name: 'Paula Vendas', email: 'paula@exemplo.com', role: 'vendedor', access: 'editor', status: 'ativo', is_superadmin: false, created_at: new Date().toISOString() };
  D.profiles.push(seller);
  D.customers[0].seller_id = seller.id; D.customers[0].seller_name = 'Paula Vendas'; D.customers[0].financial_discounts = [3, 1];
  D.app_settings.push({ key: 'sale_unit_rules', value: { ander: 'kg', isa: 'kg', 'pote temp': 'un', 'pote frut': 'un', revenda: 'un' } });
  D.products.push({ code: '000900', description: 'TEMPERO ISA GRANEL', reference: 'ISA', units_per_box: 1, weight_g: 1000, unit: 'UN', category: null, min_stock: 0, active: true, created_at: '', updated_at: '' });
  D.products.push({ code: '000901', description: 'AMEIXA SECA POTE 200G', reference: 'pote frut.', units_per_box: 60, weight_g: 200, unit: 'UN', category: null, min_stock: 0, active: true, created_at: '', updated_at: '' });
  if (role === 'vendedor') { Object.assign(ME, { role: 'vendedor', access: 'editor', is_superadmin: false }); Object.assign(D.profiles[0], ME); }
  await p.goto(U + '/login', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForSelector('input[type=email]', { timeout: 120000 }); await p.waitForTimeout(1500);
  await p.fill('input[type=email]', 'demo@x.com'); await p.fill('input[type=password]', 'senha-demo'); await p.getByRole('button', { name: 'Entrar' }).click(); await p.waitForURL((u) => !u.hash.includes('login'), { timeout: 20000 }).catch(() => console.log('login falhou')); await p.waitForTimeout(1500);
  const nov = p.getByText(/Novidade da versão 1\.7\.0/);
  await nov.waitFor({ timeout: 6000 }).catch(() => {});
  ok(await nov.isVisible(), `[${role}] janela de novidade aparece ao entrar`);
  if (role === 'admin') { const ok2 = await p.evaluate(async () => { const v = document.querySelector('[role=dialog] video'); if (!v) return 'sem video'; v.muted = true; await new Promise((r) => { v.onloadedmetadata = r; v.load(); setTimeout(r, 8000); }); return v.duration; }); ok(ok2 > 100, 'vídeo da novidade carrega (' + ok2 + ' s)'); await p.screenshot({ path: OUT + '/07_novidade.png' }); }
  await p.getByRole('button', { name: 'Entendi' }).click(); await p.waitForTimeout(400);
  return { b, p, D, seller };
}
const pickFrom = async (p, label, text, choose) => { const i = p.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await p.waitForTimeout(300); await p.getByRole('option', { name: new RegExp(choose ?? text, 'i') }).first().click(); };

// ---------- ADM ----------
{
  const { b, p, D, seller } = await session('admin');
  await p.goto(U + '/pedidos'); await p.waitForTimeout(1500);
  ok(await p.getByText('Importar cadastro de clientes').isVisible(), 'ADM vê cartão Clientes');
  ok(await p.getByText('Importar produtos').isVisible(), 'cartão Produtos visível');
  await p.screenshot({ path: OUT + '/01_pedidos.png' });

  await p.getByText('Importar cadastro de clientes').click(); await p.waitForTimeout(500);
  await p.locator('[role=dialog] input[type=file]').setInputFiles(path.resolve('vendas/clientes.xlsx')); await p.waitForTimeout(1000);
  const dtxt = await p.locator('[role=dialog]').innerText();
  ok(/Nova 3/.test(dtxt) && /Duplicada 1/.test(dtxt) && /Erro 2/.test(dtxt), 'prévia clientes: 3 novas, 1 duplicada, 2 erros  -> ' + (dtxt.match(/Todas \d+[\s\S]{0,80}/) || [''])[0].replace(/\s+/g, ' '));
  ok(/não tem 14 dígitos/.test(dtxt) && /desconto inválido/.test(dtxt) && /linha 2/.test(dtxt), 'motivos com linha');
  ok(/sem usuário no sistema/.test(dtxt), 'aviso vendedor sem usuário');
  await p.screenshot({ path: OUT + '/02_import_clientes.png' });
  await p.locator('[role=dialog]').getByRole('button', { name: 'Importar' }).click(); await p.waitForTimeout(1200);
  const nc = D.customers.find((c) => c.cnpj === '01234567000189');
  ok(nc && nc.seller_id === seller.id && nc.financial_discounts.join(';') === '3;1', 'cliente incluído com zeros, vendedor ligado e descontos 3;1');
  ok(D.customers.filter((c) => c.name === 'Mercado Zero à Esquerda').length === 2, 'nomes iguais com CNPJ diferente ficam separados');

  await p.getByText('Importar produtos').click(); await p.waitForTimeout(500);
  await p.locator('[role=dialog] input[type=file]').setInputFiles(path.resolve('vendas/produtos.xlsx')); await p.waitForTimeout(1000);
  const ptxt = await p.locator('[role=dialog]').innerText();
  ok(/outra referência/.test(ptxt) && /código vazio/.test(ptxt), 'produtos: mesmo código em outra referência = erro; código vazio = erro');
  await p.screenshot({ path: OUT + '/03_import_produtos.png' });
  await p.locator('[role=dialog]').getByRole('button', { name: 'Importar' }).click(); await p.waitForTimeout(1200);
  ok(D.products.some((x) => x.code === '000123' && x.reference === 'ISA'), 'produto 000123 com zeros à esquerda');

  // reimportar clientes: existente pede confirmação para atualizar
  await p.getByText('Importar cadastro de clientes').click(); await p.waitForTimeout(500);
  await p.locator('[role=dialog] input[type=file]').setInputFiles(path.resolve('vendas/clientes.xlsx')); await p.waitForTimeout(1000);
  const t2 = await p.locator('[role=dialog]').innerText();
  ok(/Já existe 3/.test(t2) && /Nova 0/.test(t2), 'segunda importação: CNPJs viram existentes (sem duplicar)');
  await p.locator('[role=dialog]').getByRole('button', { name: 'Cancelar' }).click();

  // Novo pedido
  await p.goto(U + '/pedidos/novo'); await p.waitForTimeout(1500);
  await pickFrom(p, 'CNPJ', '01234567', 'Mercado Zero');
  ok((await p.getByLabel('Cliente / loja', { exact: true }).inputValue()) === 'Mercado Zero à Esquerda', 'CNPJ sem pontuação preenche o nome');
  ok((await p.locator('#vendedor').inputValue()) === 'Paula Vendas', 'vendedor aparece ao escolher cliente');
  ok(!(await p.locator('#status').count()), 'status saiu da tela do pedido');
  ok(!(await p.getByText('Unidade de venda').count()), 'unidade de venda não aparece na tela');
  const discOpts = await p.locator('#desconto option').allInnerTexts();
  ok(discOpts.join('|') === 'Sem desconto|3%|1%', 'desconto lista 3% em cima e 1% embaixo: ' + discOpts.join('|'));
  await p.selectOption('#desconto', '3');
  await pickFrom(p, 'Referência da linha 1', 'isa', '^ISA$');
  const codes = await (async () => { const i = p.getByLabel('Código da linha 1', { exact: true }); await i.click(); await p.waitForTimeout(200); const t = await p.locator('[role=listbox]').innerText(); await p.keyboard.press('Escape'); return t; })();
  ok(!/000901/.test(codes) && /000900/.test(codes), 'referência filtra a lista de códigos');
  await pickFrom(p, 'Produto da linha 1', 'GRANEL', 'TEMPERO ISA GRANEL');
  ok((await p.getByLabel('Código da linha 1', { exact: true }).inputValue()) === '000900', 'produto preenche código');
  await p.getByLabel('Quantidade da linha 1').fill('10'); await p.getByLabel('Valor unitário da linha 1').fill('6.60');
  await p.getByRole('button', { name: 'Adicionar item' }).click();
  await pickFrom(p, 'Código da linha 2', '000901', '000901');
  { const v = await p.getByLabel('Referência da linha 2', { exact: true }).inputValue(); ok(/^pote frut\.?$/i.test(v), 'código preenche referência: ' + v); }
  await p.getByLabel('Quantidade da linha 2').fill('2.5'); await p.getByLabel('Valor unitário da linha 2').fill('12.40');
  await p.getByRole('button', { name: 'Salvar pedido' }).click(); await p.waitForTimeout(500);
  ok(await p.getByText('Produto vendido por unidade: use número inteiro.').isVisible(), 'unidade aceita só inteiro (erro junto do campo)');
  await p.getByLabel('Quantidade da linha 2').fill('120');
  // troca de referência limpa produto incompatível
  await p.getByRole('button', { name: 'Adicionar item' }).click();
  await pickFrom(p, 'Produto da linha 3', 'AMEIXA', 'AMEIXA');
  await pickFrom(p, 'Referência da linha 3', 'isa', '^ISA$');
  ok((await p.getByLabel('Produto da linha 3', { exact: true }).inputValue()) === '', 'trocar referência limpa produto que não pertence a ela');
  await p.getByLabel('Remover linha 3').click();
  const box = await p.locator('dl').first().innerText();
  ok(/R\$\s?1\.554,00/.test(box) && /46,62/.test(box) && /1\.507,38/.test(box), 'totais: subtotal 1.554,00 − 3% 46,62 = 1.507,38 -> ' + box.replace(/\s+/g, ' '));
  await p.screenshot({ path: OUT + '/04_novo_pedido.png', fullPage: true });
  await p.getByRole('button', { name: 'Salvar pedido' }).dblclick(); await p.waitForTimeout(2000);
  const saved = D.orders.filter((o) => o.customer_name === 'Mercado Zero à Esquerda');
  ok(saved.length === 1, 'clique duplo salva um pedido só');
  const o = saved[0], its = D.order_items.filter((i) => i.order_id === o.id);
  ok(o.subtotal_value === 1554 && o.discount_value === 46.62 && o.total_value === 1507.38 && o.discount_pct === 3, 'pedido gravado com subtotal, desconto e total');
  const kg = its.find((i) => i.sale_unit === 'kg'), un = its.find((i) => i.sale_unit === 'un');
  ok(kg.quantity === 10 && kg.quantity_units === 0 && kg.weight_kg === 10 && kg.total_price === 66, 'item kg: 10 kg × 6,60 = 66,00, entra em kg (sem conversão)');
  ok(un.quantity_units === 120 && un.quantity_boxes === 2 && un.product_reference === 'pote frut.', 'item unidade: 120 un = 2 caixas de 60, com retrato do produto');
  await p.screenshot({ path: OUT + '/05_detalhe.png', fullPage: true });
  // cadastro muda depois: pedido não muda
  D.products.find((x) => x.code === '000900').description = 'NOME NOVO';
  await p.goto(U + `/pedidos/${o.id}/editar`); await p.waitForTimeout(2000);
  ok((await p.getByLabel('Quantidade da linha 1').inputValue()) === '10', 'reabre o pedido salvo no formulário de venda');
  await p.goto(U + `/pedidos/${o.id}`); await p.waitForTimeout(1500);
  ok(await p.getByText('TEMPERO ISA GRANEL').first().isVisible(), 'detalhe mostra o nome do momento do salvamento');
  // pedido antigo continua no formulário antigo
  const legacy = D.orders.find((x) => x.source === 'pdf');
  await p.goto(U + `/pedidos/${legacy.id}/editar`); await p.waitForTimeout(2000);
  ok(await p.getByText('Vlr. caixa').isVisible(), 'pedido antigo (PDF) abre no formulário antigo, sem alterar valores');
  await b.close();
}

// ---------- VENDEDOR (só tela; a restrição no banco depende da migração) ----------
{
  const { b, p } = await session('vendedor');
  await p.goto(U + '/estoque'); await p.waitForTimeout(1500);
  ok(p.url().endsWith('#/pedidos'), 'vendedor que abre /estoque volta para Pedidos');
  const nav = (await p.locator('aside a[href^="#/"]').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  ok(nav.map((t) => t.split(/\s/)[0]).join('|') === 'Pedidos|Tutoriais|Configurações', 'menu do vendedor só com Pedidos/Tutoriais/Configurações: ' + nav.join('|'));
  ok(!(await p.getByText('Importar cadastro de clientes').count()), 'vendedor não vê cartão Clientes');
  ok(await p.getByRole('button', { name: 'Novo pedido' }).first().isVisible(), 'vendedor pode lançar pedido');
  await p.screenshot({ path: OUT + '/06_vendedor.png' });
  await p.goto(U + '/tutoriais'); await p.waitForTimeout(1500);
  ok(p.url().endsWith('#/tutoriais') && await p.getByText('Todos os tutoriais').isVisible(), 'vendedor abre Tutoriais');
  await p.reload(); await p.waitForTimeout(2000);
  ok(!(await p.getByText(/Novidade da versão/).count()), 'novidade não aparece de novo depois de vista');
  await p.screenshot({ path: OUT + '/08_tutoriais.png' });
  await b.close();
}
