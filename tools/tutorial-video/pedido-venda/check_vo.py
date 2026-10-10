# Transcreve cada fala (com tempo de cada palavra) e aponta as que saíram erradas.
import json, difflib, re, unicodedata
from faster_whisper import WhisperModel
S = json.load(open('vendas/script2.json', encoding='utf-8'))
m = WhisperModel('medium', device='cpu', compute_type='int8')
def norm(s):
    s = s.lower().replace('cê ene pê jota', 'cnpj')
    s = unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9 ]', '', s).split()
out = {}; bad = []; k = 0
for c in S:
    for b in c['beats']:
        f = f'vendas/vo2/c{k:03d}.wav'
        segs, _ = m.transcribe(f, language='pt', word_timestamps=True); segs = list(segs)
        got = ' '.join(s.text for s in segs)
        words = [dict(w=w.word.strip(), s=w.start, e=w.end) for s in segs for w in s.words]
        r = difflib.SequenceMatcher(None, norm(b['say']), norm(got)).ratio()
        out[f'c{k:03d}'] = dict(ratio=r, words=words, text=got)
        if r < 0.9:
            bad.append(f'c{k:03d}'); print(f'c{k:03d}', round(r, 2), '|', b['say'], '\n   ->', got)
        k += 1
json.dump(out, open('vendas/vo2_words.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('RUINS', ' '.join(bad))
