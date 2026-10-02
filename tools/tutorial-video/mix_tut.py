import numpy as np, json, subprocess, os
NM=os.environ.get('NAME','')
from scipy import signal
from scipy.io import wavfile
SR=48000; TL=json.load(open(f'timeline{NM}.json',encoding='utf-8')); DUR=TL['dur']; N=int(DUR*SR)
_,loop=wavfile.read('bed_loop.wav'); loop=loop.T.astype(np.float32)
reps=N//loop.shape[1]+1; bed=np.tile(loop,(1,reps))[:,:N]
t=np.arange(N)/SR; bed*=np.minimum(1,t/1.5)*np.clip((DUR-t)/3.0,0,1)
vo=np.zeros(N,np.float32)
for b in TL['beats']:
    _,x=wavfile.read(f"vo2/{b['vo']}.wav"); x=x.astype(np.float32)/32768; j=int(b['voStart']*SR); j=max(0,j); x=x[:N-j]; vo[j:j+len(x)]+=x
hp=signal.butter(2,90/(SR/2),'high',output='sos'); pres=signal.butter(2,[2800/(SR/2),6000/(SR/2)],'band',output='sos')
vo=signal.sosfilt(hp,vo); vo=(vo+0.3*signal.sosfilt(pres,vo)).astype(np.float32); vo/=np.abs(vo).max()/0.9
act=(np.convolve(np.abs(vo),np.ones(960)/960,'same')>0.008).astype(np.float32)
# envelope de ducking (ataque 80 ms, soltura 600 ms) via filtro simples
d=signal.lfilter([1-np.exp(-1/(0.35*SR))],[1,-np.exp(-1/(0.35*SR))],act); d=np.maximum(d,signal.lfilter([1-np.exp(-1/(0.06*SR))],[1,-np.exp(-1/(0.06*SR))],act)*0.0+d)
duck=1-0.72*np.clip(d*1.6,0,1)
fx=np.zeros((2,N),np.float32); rng=np.random.default_rng(1)
def add(x,t0,g=1.0,pan=0.0):
    i=int(t0*SR); x=x[:max(0,N-i)]; fx[0,i:i+len(x)]+=x*g*(1-pan)/1.0; fx[1,i:i+len(x)]+=x*g*(1+pan)/1.0
def whoosh(t0,d=0.7):
    n=int(d*SR); x=rng.standard_normal(n); tt=np.arange(n)/SR; out=np.zeros(n)
    for k in range(0,n,512):
        f=400*(6000/400)**(k/n); s=signal.butter(2,[f/1.4/(SR/2),min(0.99,f*1.4/(SR/2))],'band',output='sos'); out[k:k+512]=signal.sosfilt(s,x[k:k+512])
    add((out*np.sin(np.pi*tt/d)**2*0.35).astype(np.float32),t0-d*0.5)
def click(t0):
    n=int(0.04*SR); tt=np.arange(n)/SR; x=(np.sin(2*np.pi*2400*tt)*0.5+rng.standard_normal(n)*0.3)*np.exp(-tt/0.004); add(x.astype(np.float32),t0,0.35,0.1)
def bell(t0,m,g=0.12):
    n=int(1.5*SR); tt=np.arange(n)/SR; f=440*2**((m-69)/12); x=np.sin(2*np.pi*f*tt+2*np.exp(-tt/0.25)*np.sin(2*np.pi*f*3.5*tt))*np.exp(-tt/0.5); add((x*g).astype(np.float32),t0,1,rng.uniform(-.4,.4))
for c in TL['chapters']:
    if c['card']: whoosh(c['card'][0]+0.15); [bell(c['card'][0]+0.35+i*0.06,m,0.07) for i,m in enumerate([79,84,88])]
for t0 in TL['clicks']: click(t0)
for i,m in enumerate([72,76,79,84]): bell(0.4+i*0.08,m,0.1); bell(DUR-3.3+i*0.08,m,0.1)
mix=bed*duck*0.55+fx+np.stack([vo,vo])
mix=np.tanh(mix*1.05)/1.05
wavfile.write(f'tut{NM}_raw.wav',SR,mix.T.astype(np.float32))
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'tut{NM}_raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000',f'tut{NM}_mix.wav'],check=True)
print('ok',DUR)
