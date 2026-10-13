# Narração do tutorial do cadastro de clientes com Chatterbox Multilingual (MIT), voz de referência ../voz/ref_francisca.wav.
# Uso: python clientes/tts_cb.py            (todas as falas)
#      python clientes/tts_cb.py c004 c010  (só estas)
import json, os, sys, torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
S = json.load(open('clientes/script.json', encoding='utf-8')); m = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
REF = '../voz/ref_francisca.wav'; os.makedirs('clientes/vo', exist_ok=True)
only = set(a for a in sys.argv[1:] if a.startswith('c'))
seed_off = int(os.environ.get('SEED', '0'))
k = 0
for c in S:
    for b in c['beats']:
        f = f'clientes/vo/c{k:03d}.wav'
        if not only or f'c{k:03d}' in only:
            torch.manual_seed(7 + k * 13 + len(only) + seed_off)
            w = m.generate(b['say'], language_id='pt', audio_prompt_path=REF, exaggeration=0.55, cfg_weight=0.45, temperature=0.7)
            ta.save(f, w, m.sr); print('ok', f, round(w.shape[-1] / m.sr, 1), flush=True)
        k += 1
