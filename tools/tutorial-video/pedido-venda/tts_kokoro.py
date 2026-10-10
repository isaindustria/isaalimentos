import json, sys, numpy as np, soundfile as sf
from kokoro import KPipeline
S=json.load(open('vendas/script.json',encoding='utf-8')); p=KPipeline(lang_code='p', repo_id='hexgrad/Kokoro-82M')
k=0
for c in S:
    for b in c['beats']:
        txt=b['say'].replace('ISA','Isa')
        a=np.concatenate([x[2].numpy() if hasattr(x[2],'numpy') else x[2] for x in p(txt, voice='pf_dora', speed=1.05)])
        f=f'vendas/vo/v{k:03d}.wav'; sf.write(f, a, 24000)
        e=np.convolve(np.abs(a),np.ones(240)/240,'same'); idx=np.where(e>0.01)[0]
        b['vo']=f'v{k:03d}'; b['s']=float(idx[0]/24000); b['e']=float(idx[-1]/24000); k+=1
json.dump(S,open('vendas/script_t.json','w',encoding='utf-8'),ensure_ascii=False)
print('beats',k)
