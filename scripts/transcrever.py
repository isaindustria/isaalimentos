# Transcreve um áudio (mp3, ogg, opus, m4a, wav, webm) em português e grava <arquivo>.txt ao lado.
# Uso: python scripts/transcrever.py caminho/do/audio [...]
import sys
from faster_whisper import WhisperModel

sys.stdout.reconfigure(encoding='utf-8')
m = WhisperModel('medium', device='cpu', compute_type='int8')
for f in sys.argv[1:]:
    segs, info = m.transcribe(f, language='pt', vad_filter=True)
    texto = ' '.join(s.text.strip() for s in segs)
    with open(f + '.txt', 'w', encoding='utf-8') as out:
        out.write(texto + '\n')
    print(f'{f}: {round(info.duration)} s transcritos')
