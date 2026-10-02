import asyncio, json, edge_tts, subprocess, numpy as np, os
N=os.environ.get('NAME','')
from scipy.io import wavfile
S=json.load(open(f'script{N}.json',encoding='utf-8'))
V="pt-BR-FranciscaNeural"
async def one(path,t):
    await edge_tts.Communicate(t.replace('ISA','Isa'),V,rate="+8%").save(path)
async def main():
    k=0
    for c in S:
        for b in c['beats']:
            mp=f'vo2/{N}b{k:03d}.mp3'; wv=f'vo2/{N}b{k:03d}.wav'
            if not os.path.exists(wv) or b.get('_force'):
                await one(mp,b['say']); subprocess.run(['ffmpeg','-y','-loglevel','error','-i',mp,'-ar','48000','-ac','1',wv])
            sr,x=wavfile.read(wv); e=np.convolve(np.abs(x.astype(float)/32768),np.ones(480)/480,'same'); idx=np.where(e>0.01)[0]
            b['vo']=f'{N}b{k:03d}'; b['s']=idx[0]/sr; b['e']=idx[-1]/sr; k+=1
    json.dump(S,open(f'script{N}_t.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
    print('beats',k,'speech total',round(sum(b['e']-b['s'] for c in S for b in c['beats']),1))
asyncio.run(main())
