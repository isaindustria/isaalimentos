# ISA Alimentos · Sistema de Gestão

Sistema para a ISA Indústria de Alimentos e Temperos: **estoque**, **pedidos das lojas (PDF)**, **necessidade de produção** e **CRM de clientes**.
Mesmo código roda como **site** (Vercel ou qualquer host estático) e como **programa Windows** (instalador e versão portátil), ambos usando o **mesmo banco Supabase**.

## Estrutura

```
apps/web        Aplicação (React + Vite + Tailwind + Supabase)
apps/desktop    Casca Electron (instalador NSIS + portátil, auto-update via GitHub Releases)
supabase/       Migrations SQL (schema + seed dos 45 produtos)
docs/           Especificação de design
```

## 1. Banco de dados (Supabase)

1. Crie um projeto em https://supabase.com (região `sa-east-1`, São Paulo).
2. No **SQL Editor**, execute em ordem:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_products.sql`
3. Em **Authentication → Providers → Email**, mantenha e-mail/senha habilitado. Se quiser que o usuário entre sem confirmar e-mail, desative "Confirm email".
4. Em **Settings → API** copie a `Project URL` e a chave pública (`anon`/`publishable`).

O **primeiro usuário** que criar conta vira **administrador** automaticamente.

## 2. Configuração local

```bash
npm install
cp apps/web/.env.example apps/web/.env   # preencha URL, chave e o repositório GitHub
npm run dev                              # http://localhost:5173
npm test                                 # testes dos parsers com os arquivos reais da pasta "automatizando processos_"
```

## 3. Site (web)

Deploy na Vercel: importe o repositório, o `vercel.json` já define build e pasta de saída.
Defina as variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e `VITE_GITHUB_REPO` no projeto Vercel.

Quando uma nova versão é publicada, o site em aberto detecta pelo `version.json` e mostra o botão **"Atualizar agora"**.

## 4. Programa Windows (instalável + portátil)

```bash
npm run desktop:dev        # abre o programa apontando para o build web local
npm run desktop:build      # gera apps/desktop/release/ISA-Alimentos-Setup-x.y.z.exe e ISA-Alimentos-Portable-x.y.z.exe
```

> Se o build local falhar com "Cannot create symbolic link", ative o **Modo de Desenvolvedor** do Windows (Configurações → Sistema → Para desenvolvedores) ou rode o terminal como administrador. No GitHub Actions isso não acontece.

### Atualização automática

1. Ajuste `homepage`/`repository` em `apps/desktop/package.json` para o seu repositório GitHub.
2. No GitHub, em **Settings → Secrets → Actions**, crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Para lançar uma versão:
   ```bash
   npm version 1.0.1 --workspaces --include-workspace-root --no-git-tag-version
   git commit -am "release: v1.0.1"
   git tag v1.0.1
   git push && git push --tags
   ```
   O workflow `.github/workflows/release.yml` compila e publica o instalador e o portátil em **Releases**.
4. O programa instalado verifica a cada 6 horas (e ao abrir). Ao encontrar versão nova aparece a faixa **"Baixar atualização"** e depois **"Reiniciar e atualizar"**.
   A versão **portátil** não se substitui sozinha: o botão abre a página de download da nova versão.

### Branding

Assets da marca (pasta `LOGOS E IMAGENS`) já aplicados:
- `apps/web/public/brand/logo.png` (coração ISA, extraído do catálogo em 512px), `mascot.png` (cupido), `logo-watermark.png`.
- `apps/web/public/favicon.png`, `icon-192.png` e `apps/desktop/build/icon.ico` gerados a partir do logo.
- Paleta em `apps/web/src/index.css`: vermelho `--brand` (#E21420), amarelo `--brand-yellow` (#F5D000), verde `--brand-green` (#3FA33F).

## 5. Base de UI e tempo real

- Componentes: **shadcn/ui** (`apps/web/components.json`, estilo radix-nova, Tailwind v4). Os primitivos do app ficam em `src/components/primitives.tsx` e compõem `src/components/ui/*`.
- Skills instaladas em `.claude/skills/` (`find-skills`, `shadcn`): use-as como base para novas telas.
- Tempo real (Supabase Realtime): presença de quem está online no cabeçalho, aviso de "fulano está editando" no pedido, e atualização automática das listas quando outra pessoa altera pedidos, estoque, produção ou clientes.
- Abertura animada: mostrada no programa Windows e no PWA instalado (no navegador comum, não).

## 6. Fluxo de uso

1. **Estoque → Importar planilha**: lê o XLSX do ERP, considera só os locais 1 e 5, soma linhas repetidas e substitui o estoque anterior.
2. **Pedidos → Importar PDF**: lê todos os pedidos de compra (uma loja por página), cria os clientes pelo CNPJ de entrega e identifica os produtos por aproximação de texto.
   Itens com dúvida vão para **Conferência**; ao confirmar, o sistema aprende o código do cliente e não pergunta de novo.
3. **Produção**: total pedido − estoque disponível. Exporta Excel, imprime e salva a ordem para acompanhar o que foi produzido.
4. **Clientes**: dados, pedidos e histórico de contatos (ligação, WhatsApp, visita…).

## Regras implementadas (do documento de requisitos)

- Produto identificado pelo **código** (coluna A) e descrição (coluna C) da planilha.
- Estoque disponível = **local 1 + local 5**; nova importação substitui a anterior.
- Quantidades do PDF são **caixas**; convertidas em unidades pelo campo "unidades por caixa" do produto (48 por padrão, lido de `CXA 1 X 48`).
- Necessidade de produção = **total pedido − estoque**; saldo restante quando o estoque cobre o pedido.
- Descrição não encontrada ou empate entre produtos → **conferência manual**, sem associação automática.
