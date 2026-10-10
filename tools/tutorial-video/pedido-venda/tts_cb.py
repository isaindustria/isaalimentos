import json, os, sys, numpy as np, torch, torchaudio as ta, soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
S=json.load(open('vendas/script2.json',encoding='utf-8')); m=ChatterboxMultilingualTTS.from_pretrained(device='cpu')
REF='../voz/ref_francisca.wav'; os.makedirs('vendas/vo2',exist_ok=True)
only=set(sys.argv[1:])
k=0
for c in S:
    for b in c['beats']:
        f=f'vendas/vo2/c{k:03d}.wav'
        if not only or f'c{k:03d}' in only:
            torch.manual_seed(7+k*13+len(only))
            w=m.generate(b['say'], language_id='pt', audio_prompt_path=REF, exaggeration=0.55, cfg_weight=0.45, temperature=0.7)
            ta.save(f, w, m.sr); print('ok', f, round(w.shape[-1]/m.sr,1), flush=True)
        k+=1
