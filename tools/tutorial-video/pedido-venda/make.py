import json, sys, base64, io, os, subprocess, numpy as np
from PIL import Image
from scipy import signal
from scipy.io import wavfile
MODE=sys.argv[1]; SR=48000
S=json.load(open('vendas/script_t.json',encoding='utf-8')); M=json.load(open(f'vendas/shots_{MODE}/meta.json',encoding='utf-8'))
def box(shot,key):
    if not key: return None
    if key in M.get(shot,{}): return M[shot][key]
    print('SEM CAIXA',shot,key); return None
t=0.0; chapters=[]; beats=[]; clicks=[]
for c in S:
    c0=t; card=None
    if not c.get('intro') and not c.get('outro'): card=(t,t+2.3); t+=2.3
    if c.get('intro'): t+=3.2
    for b in c['beats']:
        dur=b['e']-b['s']+0.35; vs=t+0.25-b['s']
        B=dict(t0=t,t1=t+dur+0.3,shot=b['shot'],vo=b['vo'],voStart=vs,caption=b['say'],focus=box(b['shot'],b.get('focus')),cursor=box(b['shot'],b.get('cursor')),click=bool(b.get('click')),hl=box(b['shot'],b.get('hl')),ch=len(chapters))
        if B['click'] and B['cursor']: clicks.append(t+0.95)
        beats.append(B); t=B['t1']
    if c.get('outro'): t+=3.5
    chapters.append(dict(num=c['ch'],title=c['title'],sub=c.get('sub'),end1=c.get('end1'),end2=c.get('end2'),t0=c0,t1=t,card=card,intro=bool(c.get('intro')),outro=bool(c.get('outro'))))
first=Image.open(f'vendas/shots_{MODE}/{beats[0]["shot"]}.png')
TL=dict(dur=round(t+0.3,2),chapters=chapters,beats=beats,clicks=clicks,canvas=[1920,1080] if MODE=='web' else [1080,1920],screen=list(first.size))
json.dump(TL,open(f'vendas/timeline_{MODE}.json','w',encoding='utf-8'),ensure_ascii=False)
# audio
DUR=TL['dur']; N=int(DUR*SR)
_,loop=wavfile.read('bed_loop.wav'); loop=loop.T.astype(np.float32); bed=np.tile(loop,(1,N//loop.shape[1]+1))[:,:N]
tt=np.arange(N)/SR; bed*=np.minimum(1,tt/1.5)*np.clip((DUR-tt)/3.0,0,1)
vo=np.zeros(N,np.float32)
for b in beats:
    sr,x=wavfile.read(f"vendas/vo/{b['vo']}.wav"); x=x.astype(np.float32)
    if x.dtype!=np.float32 or np.abs(x).max()>2: x=x/32768
    x=signal.resample_poly(x,SR,sr).astype(np.float32); j=max(0,int(b['voStart']*SR)); x=x[:N-j]; vo[j:j+len(x)]+=x
hp=signal.butter(2,80/(SR/2),'high',output='sos'); vo=signal.sosfilt(hp,vo).astype(np.float32); vo/=np.abs(vo).max()/0.9
act=(np.convolve(np.abs(vo),np.ones(960)/960,'same')>0.008).astype(np.float32)
d=signal.lfilter([1-np.exp(-1/(0.35*SR))],[1,-np.exp(-1/(0.35*SR))],act); duck=1-0.72*np.clip(d*1.6,0,1)
fx=np.zeros((2,N),np.float32); rng=np.random.default_rng(1)
def add(x,t0,g=1.0):
    i=int(t0*SR); x=x[:max(0,N-i)]; fx[0,i:i+len(x)]+=x*g; fx[1,i:i+len(x)]+=x*g
def click(t0):
    n=int(0.04*SR); q=np.arange(n)/SR; add(((np.sin(2*np.pi*2400*q)*0.5+rng.standard_normal(n)*0.3)*np.exp(-q/0.004)).astype(np.float32),t0,0.35)
def bell(t0,m,g=0.1):
    n=int(1.5*SR); q=np.arange(n)/SR; f=440*2**((m-69)/12); add((np.sin(2*np.pi*f*q+2*np.exp(-q/0.25)*np.sin(2*np.pi*f*3.5*q))*np.exp(-q/0.5)*g).astype(np.float32),t0)
for c in chapters:
    if c['card']: [bell(c['card'][0]+0.35+i*0.06,m,0.07) for i,m in enumerate([79,84,88])]
for t0 in clicks: click(t0)
for i,m in enumerate([72,76,79,84]): bell(0.4+i*0.08,m); bell(DUR-3.3+i*0.08,m)
mix=np.tanh((bed*duck*0.5+fx+np.stack([vo,vo]))*1.05)/1.05
wavfile.write(f'vendas/mix_{MODE}_raw.wav',SR,mix.T.astype(np.float32))
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'vendas/mix_{MODE}_raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000',f'vendas/mix_{MODE}.wav'],check=True)
# html
BRAND=r"D:\Projetos de IA\Isa alimentos\apps\web\public\brand"; I={}
for s in {b['shot'] for b in beats}:
    buf=io.BytesIO(); Image.open(f'vendas/shots_{MODE}/{s}.png').convert('RGB').save(buf,'JPEG',quality=92); I[s]='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
for k in ['logo','mascot']: I[k]='data:image/png;base64,'+base64.b64encode(open(os.path.join(BRAND,k+'.png'),'rb').read()).decode()
h=open('composer2.html',encoding='utf-8').read().replace('__TL__',json.dumps(TL,ensure_ascii=False)).replace('__IMGS__',json.dumps(I))
open(f'tutv_{MODE}_build.html','w',encoding='utf-8').write(h)
print(MODE,'dur',DUR,'screen',TL['screen'])
