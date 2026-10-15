# Transcreve cada fala (com tempo de cada palavra) e aponta as que saíram erradas (ratio < 0.9).
# Uso: python rotas/check_vo.py            (todas)   |   python rotas/check_vo.py c004 c010 (só estas, atualiza o json)
import json, difflib, re, sys, os, unicodedata
from faster_whisper import WhisperModel
S = json.load(open('rotas/script.json', encoding='utf-8'))
m = WhisperModel('medium', device='cpu', compute_type='int8')
def norm(s):
    s = s.lower().replace('cê ene pê jota', 'cnpj').replace('cê pê éfe', 'cpf')
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
    NUM = {'1': 'um', '2': 'dois', '3': 'tres', '4': 'quatro', '5': 'cinco', '6': 'seis', '7': 'sete', '8': 'oito', '9': 'nove', '10': 'dez'}
    return [NUM.get(w, w) for w in re.sub(r'[^a-z0-9 ]', '', s).split()]  # o Whisper escreve números em algarismos
OUT = 'rotas/vo_words.json'
out = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
only = set(sys.argv[1:]); bad = []; k = 0
for c in S:
    for b in c['beats']:
        key = f'c{k:03d}'; k += 1
        if only and key not in only: continue
        segs, _ = m.transcribe(f'rotas/vo/{key}.wav', language='pt', word_timestamps=True); segs = list(segs)
        got = ' '.join(s.text for s in segs)
        words = [dict(w=w.word.strip(), s=w.start, e=w.end) for s in segs for w in s.words]
        r = difflib.SequenceMatcher(None, norm(b['say']), norm(got)).ratio()
        out[key] = dict(ratio=r, words=words, text=got)
        print(key, round(r, 2), flush=True)
        if r < 0.9:
            bad.append(key); print('   ', b['say'], '\n   ->', got, flush=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
print('RUINS', ' '.join(bad))
