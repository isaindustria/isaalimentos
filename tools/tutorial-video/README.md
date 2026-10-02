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
