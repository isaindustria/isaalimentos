# Narração com a voz neural brasileira pt-BR-FranciscaNeural (edge-tts). Gera vo/cNNN.mp3 e converte para wav 48 kHz mono.
# Uso: python rotas/tts_edge.py            (todas as falas)
#      python rotas/tts_edge.py c004 c010  (só estas)   |  RATE=+0% para a velocidade padrão (o padrão aqui é +10%)
import asyncio, json, os, sys, subprocess
import edge_tts
VOICE = os.environ.get('VOICE', 'pt-BR-FranciscaNeural'); RATE = os.environ.get('RATE', '+10%')
S = json.load(open('rotas/script.json', encoding='utf-8')); os.makedirs('rotas/vo', exist_ok=True)
only = set(a for a in sys.argv[1:] if a.startswith('c'))
async def one(key, text):
    mp3 = f'rotas/vo/{key}.mp3'
    for tent in range(4):
        try:
            await edge_tts.Communicate(text, VOICE, rate=RATE).save(mp3); break
        except Exception as e:
            print('  tentativa', tent + 1, 'falhou:', e, flush=True); await asyncio.sleep(3)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-ar', '48000', '-ac', '1', f'rotas/vo/{key}.wav'], check=True)
    print('ok', key, flush=True)
async def main():
    k = 0
    for c in S:
        for b in c['beats']:
            key = f'c{k:03d}'
            if not only or key in only: await one(key, b['say'])
            k += 1
asyncio.run(main())
