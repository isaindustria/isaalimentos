# ISA Alimentos · Sistema de Gestão — Design

Data: 2026-09-02

## Objetivo

Automatizar o cálculo da necessidade de produção da ISA Indústria de Alimentos e Temperos a partir de dois insumos que a empresa já gera hoje: a planilha "ESTOQUE ATUAL" do ERP e o PDF "Pedido de Compra" das lojas. Em volta disso, oferecer estoque, pedidos e um CRM simples, acessíveis pelo site e por um programa Windows que compartilham o mesmo banco.

## Fontes analisadas

- `DESENVOLVER UM SISTEMA ... 45 PRODUTOS.docx`: regras de negócio (cadastro, importação de estoque, importação de pedidos, cálculo, resultado final).
- `ESTOQUE ATUAL 02.09.2026.XLSX`: 45 produtos, duas linhas por produto (locais 1 e 5), coluna A código, C descrição, E local, G saldo em potes (PT).
- `pedido tempero isa 01.09.26.pdf`: relatório CCPMERM02, 13 páginas, 10 pedidos (uma loja por pedido, identificada pelo CNPJ de entrega). Quantidades em caixas (`CXA 1 X 48`), páginas rotacionadas em 90°, alguns pedidos ocupam duas páginas.

## Arquitetura

- **Um único front-end** (React + Vite + TypeScript + Tailwind) publicado como site estático e empacotado pelo Electron. Não há servidor próprio: o navegador fala direto com o Supabase (Postgres + Auth + RLS).
- **Parsers no cliente**: XLSX com SheetJS, PDF com pdf.js (texto posicionado, rotação tratada via viewport). Ambos são funções puras testadas contra os arquivos reais.
- **Desktop**: Electron com `electron-updater` apontando para GitHub Releases. Instalador NSIS atualiza sozinho; a versão portátil abre a página de download.
- **Web**: `version.json` gerado no build; a página aberta compara com a versão em execução e oferece "Atualizar agora".

## Modelo de dados

`products` (código PK), `product_aliases` (código do cliente / descrição normalizada → produto, aprendidos na conferência), `stock_imports` + `stock_balances` (histórico; só uma importação `is_current`), view `current_stock` (soma por local), `customers` + `customer_interactions` (CRM), `order_imports` + `orders` + `order_items` (com `match_status`, `match_score`, `candidates`), `production_runs` + `production_run_items` (snapshots), `app_settings`, `profiles` (primeiro usuário vira admin).

RLS: empresa única, qualquer usuário autenticado lê e escreve; exclusão de produtos, clientes e importações restrita a admin.

## Fluxos

1. **Importar estoque**: filtra locais configurados (1 e 5), agrega por código, cria produtos ausentes (opcional), grava nova importação como atual.
2. **Importar pedidos**: por página lê cabeçalho (pedido, CNPJ, endereço, data) e itens (código do cliente, descrição, embalagem, quantidade em caixas, preço). Página sem cabeçalho continua o pedido anterior. Cliente é localizado/criado pelo CNPJ. Cada item passa pelo matcher.
3. **Matcher**: alias por código do cliente → alias por descrição normalizada → similaridade (Dice sobre tokens normalizados com sinônimos e tolerância a erros de digitação, com bônus quando a consulta está toda contida no candidato). Automático se `score ≥ 0,80` e distância para o segundo `≥ 0,10` (ou score exato). Empate → `ambiguous`; baixo → `pending`/`not_found`. Nunca associa em dúvida.
4. **Conferência**: agrupa linhas iguais, mostra sugestões ranqueadas; confirmação aplica a todas as linhas iguais e salva alias.
5. **Produção**: `necessidade = max(0, pedido − estoque)`, `saldo = max(0, estoque − pedido)`, unidades e caixas; filtros por pedidos abertos, importação ou período; exporta Excel; salva ordem e acompanha produzido.

## Fora do escopo desta versão

Emissão fiscal, integração de escrita com o ERP, multiempresa, app móvel nativo. O banco pode migrar do Supabase gerenciado para Postgres próprio sem alterar o front (mesmo schema e API PostgREST).
