# Vídeo tutorial do sistema

Gera os dois vídeos publicados no site:

- `apps/web/public/site/video/isa-tutorial.mp4`: tutorial completo, cerca de 6 minutos, no topo de `site/docs.html`.
- `apps/web/public/site/video/isa-sistema-1min.mp4`: resumo de 1 minuto na página inicial (`site/index.html#video`).

Nenhum dado real é usado. `mock.mjs` intercepta todas as chamadas ao Supabase dentro do Playwright e responde com o banco fictício de `fixtures.mjs` (clientes, pedidos, insumos e usuários inventados; produtos do catálogo público). Gravações e importações feitas durante a captura ficam só na memória do simulador.

## Como regravar depois de mudar uma tela

Pré-requisitos: Node com `playwright-core` (Chromium do Playwright instalado), Python com `edge-tts`, `numpy`, `scipy`, `Pillow` e `openpyxl`, e `ffmpeg`. Para conferir a narração, `faster-whisper`.

1. Suba o app local: `npx vite --port 5179 --strictPort` em `apps/web`.
2. Fotografe as telas: `node capture.mjs` (gera `shots/*.png` e `shots/meta.json` com a posição dos botões).
3. Ajuste o texto em `script.json` (completo) ou `script_short.json` (1 minuto). Cada item liga uma frase da narração a uma tela, ao botão onde o cursor clica e à área destacada.
4. Gere a narração e a linha do tempo: `python tts.py && python layout.py`.
5. Trilha de fundo e mixagem: `python bed.py && python mix_tut.py`.
6. Monte e renderize: `python build_tut.py && node render_tut.mjs full x saida.mp4`.

Para a versão de 1 minuto, rode os passos 4 a 6 com `NAME=_short` no ambiente.

Para publicar, comprima com `ffmpeg -crf 27 -tune stillimage -movflags +faststart` e substitua os arquivos em `apps/web/public/site/video/`. Se os capítulos mudarem de tempo, atualize os botões de capítulo em `site/docs.html`.

## Tutoriais por atualização (a partir da 1.7.1)

Regra: toda versão que muda uma tela ganha um tutorial em vídeo, em duas versões (computador 16:9 e celular 9:16).
Ele entra em `apps/web/src/lib/tutorials.ts`, aparece na página **Tutoriais** do menu, na janela de novidade
ao entrar na versão nova e no aviso de atualização do programa do Windows.

Exemplo completo em `pedido-venda/`:

1. `node pedido-venda/capture.mjs web` e `... mobile` (telas com banco simulado, dados fictícios).
2. Voz: Kokoro (código aberto, Apache 2.0, roda no computador), voz `pf_dora`, num Python 3.11:
   `python pedido-venda/tts_kokoro.py`.
3. `python pedido-venda/make.py web` e `... mobile` (linha do tempo, trilha de fundo e mixagem; usa `composer2.html`).
4. `NAME=v_web node render_tut.mjs full x saida.mp4` (idem `v_mobile`).
5. Comprima (`ffmpeg -crf 26 -tune stillimage -movflags +faststart`) para `apps/web/public/site/video/`.

### Versão atual do pipeline (1.7.4)

- Roteiro: `pedido-venda/script2.json` (cada fala com `label`, o balão numerado do passo).
- Voz: **Chatterbox Multilingual** (Resemble AI, licença MIT, código aberto), em português, imitando o timbre de `voz/ref_francisca.wav`.
  Rode `python pedido-venda/tts_cb.py` num Python 3.11 com `chatterbox-tts` (cerca de 1 min por frase em CPU).
  Escreva siglas como se fala ("cê ene pê jota") e números por extenso.
- Conferência: `python pedido-venda/check_vo.py` transcreve cada fala, aponta as erradas (regere só elas: `tts_cb.py c010 c013`) e guarda o tempo de cada palavra para a legenda.
- Montagem: `python pedido-venda/make3.py web|mobile` usa `composer3.html` (moldura de navegador/celular, balões por passo, transições, legenda palavra a palavra, resumo final).
- Render: `NAME=v3_web node render_tut.mjs full x saida.mp4`. Comprima com `-vf format=yuv420p -profile:v high -level 4.1`.

### Cadastro de clientes (1.9.6)

Pasta `cadastro-clientes/`, mesmo pipeline da 1.7.4, rodado a partir da pasta do pipeline (os scripts usam caminhos `clientes/...`, então copie a pasta como `clientes/` ao lado de `mock.mjs`).
`setup.mjs` prepara o banco fictício (códigos com zeros à esquerda, dois vendedores, último pedido em dias variados pela visão `customer_last_order`, clientes sem pedido e um inativo).
`pesquisa-de-pessoas-ficticio.xlsx` imita a exportação de um ERP (título "Pesquisa de Pessoas", colunas Cód., Razão Social, Fantasia, CPF/CNPJ...), com uma coluna não reconhecida ("Abat. Financeiro", escolhida como Desconto financeiro), um cliente novo, um CNPJ repetido e um CNPJ com dígito a menos; é gerada por `make_xlsx.py` a partir de `node clientes/dump.mjs > clientes/cust.json`.
Passos: `node clientes/capture.mjs web|mobile`, `python clientes/tts_cb.py`, `python clientes/check_vo.py` (Python com `faster-whisper`) (regere as ruins com `tts_cb.py c010`, mudando a semente com `SEED=1`), `python clientes/make.py web|mobile`, `NAME=cl_web node render_tut.mjs full x saida.mp4`.
No `script.json`, a chave `mobile` de uma fala troca a foto ou a caixa só na versão de celular.

### Vendedor: clientes e pedidos (1.9.8, Vendas parte 4)

Pasta `vendedor/`, mesmo pipeline do cadastro de clientes (copie a pasta como `vendedor/` ao lado de `mock.mjs`).
`setup.mjs` transforma a sessão do simulador na vendedora fictícia Paula (perfil `vendedor`, acesso `editor`, sem superadmin, como exige `isSeller`), deixa só os clientes dela (como a RLS faz no banco real), com códigos, descontos autorizados, último pedido em dias variados, dois sem pedido e um pedido em aberto para o Empório Boa Vista (aviso "Você já tem pedido para esse cliente"); as referências dos produtos viram ISA (kg) e POTE TEMP (unidade).
Passos: `node vendedor/capture.mjs web|mobile`, `python vendedor/tts_cb.py` (Python 3.11 com `chatterbox-tts`), `python vendedor/check_vo.py` (regere as ruins com `SEED=1 python vendedor/tts_cb.py c010`), `python vendedor/make.py web|mobile`, `NAME=vd_web node render_tut.mjs full x saida.mp4` (idem `vd_mobile`). `sheet.py` monta folhas de contato das fotos com as caixas desenhadas, para conferir.
