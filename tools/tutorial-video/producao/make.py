# Monta o tutorial Produção e Faturamento (pipeline v3): linha do tempo com passos e legenda palavra a palavra, áudio (voz + trilha + efeitos) e HTML do compositor.
import json, sys, base64, io, os, subprocess, re
import numpy as np
from PIL import Image, ImageFilter
from scipy import signal
from scipy.io import wavfile
import soundfile as sf

MODE = sys.argv[1]; SR = 48000
S = json.load(open('producao/script.json', encoding='utf-8'))
# falas com ajustes só para o celular (outra foto ou outra caixa)
for c in S:
    c['beats'] = [{**b, **b['mobile']} if MODE == 'mobile' and 'mobile' in b else b for b in c['beats']]
M = json.load(open(f'producao/shots_{MODE}/meta.json', encoding='utf-8'))
WD = json.load(open('producao/vo_words.json', encoding='utf-8'))
CNPJ = lambda s: s.replace('cê ene pê jota', 'CNPJ').replace('cê pê éfe', 'CPF')

def box(shot, key):
    if not key: return None
    if key in M.get(shot, {}): return M[shot][key]
    print('SEM CAIXA', shot, key); return None

def speech_bounds(path):
    a, sr = sf.read(path); a = a if a.ndim == 1 else a.mean(1)
    e = np.convolve(np.abs(a), np.ones(480) / 480, 'same'); idx = np.where(e > 0.01)[0]
    return idx[0] / sr, idx[-1] / sr

t = 0.0; chapters = []; beats = []; step = 0; k = 0
for c in S:
    c0 = t; card = None
    if not c.get('intro') and not c.get('outro'): card = (t, t + 2.4); t += 2.4
    if c.get('intro'): t += 3.6
    if c.get('outro'): t += 0.6
    for b in c['beats']:
        vo = f'c{k:03d}'; s, e = speech_bounds(f'producao/vo/{vo}.wav')
        lead = 1.25 if b.get('cursor') else 0.85 if b.get('hl') else 0.35  # sem cursor, o destaque entra mais cedo
        vs = t + lead - s; dur = lead + (e - s) + 0.45
        if b.get('label'): step += 1
        script_words = CNPJ(b['say']).split()
        ww = WD[vo]['words']
        if len(script_words) == len(ww):
            words = [dict(w=sw, s=round(vs + w['s'], 3), e=round(vs + w['e'], 3)) for sw, w in zip(script_words, ww)]
        else:  # quantidade diferente (números falados por extenso etc.): espalha no tempo da fala
            n = len(script_words)
            words = [dict(w=sw, s=round(vs + s + (e - s) * i / n, 3), e=round(vs + s + (e - s) * (i + 1) / n, 3)) for i, sw in enumerate(script_words)]
        beats.append(dict(t0=t, t1=t + dur, shot=b['shot'], vo=vo, voStart=vs, caption=CNPJ(b['say']), words=words,
                          focus=box(b['shot'], b.get('focus')), cursor=box(b['shot'], b.get('cursor')), click=bool(b.get('click')),
                          hl=box(b['shot'], b.get('hl')), label=b.get('label'), step=step if b.get('label') else None, ch=len(chapters)))
        t += dur; k += 1
    if c.get('outro'): t += 3.0
    chapters.append(dict(num=c['ch'], title=c['title'], sub=c.get('sub'), end1=c.get('end1'), end2=c.get('end2'), summary=c.get('summary'), t0=c0, t1=t, card=card))

first = Image.open(f'producao/shots_{MODE}/{beats[0]["shot"]}.png')
TL = dict(dur=round(t + 0.3, 2), chapters=chapters, beats=beats, steps=step,
          canvas=[1920, 1080] if MODE == 'web' else [1080, 1920], screen=list(first.size))

# ---- áudio ----
DUR = TL['dur']; N = int(DUR * SR)
_, loop = wavfile.read('bed_loop.wav'); loop = loop.T.astype(np.float32)
bed = np.tile(loop, (1, N // loop.shape[1] + 1))[:, :N]
tt = np.arange(N) / SR; bed *= np.minimum(1, tt / 1.0) * np.clip((DUR - tt) / 2.5, 0, 1)
vo = np.zeros(N, np.float32)
for b in beats:
    x, sr = sf.read(f"producao/vo/{b['vo']}.wav", dtype='float32'); x = x if x.ndim == 1 else x.mean(1)
    x = signal.resample_poly(x, SR, sr).astype(np.float32); j = max(0, int(b['voStart'] * SR)); x = x[:N - j]; vo[j:j + len(x)] += x
hp = signal.butter(2, 80 / (SR / 2), 'high', output='sos'); pres = signal.butter(2, [3000 / (SR / 2), 7000 / (SR / 2)], 'band', output='sos')
vo = signal.sosfilt(hp, vo); vo = (vo + 0.25 * signal.sosfilt(pres, vo)).astype(np.float32); vo /= np.abs(vo).max() / 0.9
act = (np.convolve(np.abs(vo), np.ones(960) / 960, 'same') > 0.008).astype(np.float32)
d = signal.lfilter([1 - np.exp(-1 / (0.35 * SR))], [1, -np.exp(-1 / (0.35 * SR))], act); duck = 1 - 0.7 * np.clip(d * 1.6, 0, 1)
fx = np.zeros((2, N), np.float32); rng = np.random.default_rng(1)

def add(x, t0, g=1.0):
    i = int(t0 * SR); x = x[:max(0, N - i)]; fx[0, i:i + len(x)] += x * g; fx[1, i:i + len(x)] += x * g
def whoosh(t0, d=0.55, g=0.3):
    n = int(d * SR); x = rng.standard_normal(n); q = np.arange(n) / SR; out = np.zeros(n)
    for s0 in range(0, n, 512):
        f = 500 * (5000 / 500) ** (s0 / n)
        sos = signal.butter(2, [f / 1.4 / (SR / 2), min(0.99, f * 1.4 / (SR / 2))], 'band', output='sos'); out[s0:s0 + 512] = signal.sosfilt(sos, x[s0:s0 + 512])
    add((out * np.sin(np.pi * q / d) ** 2 * g).astype(np.float32), t0 - d * 0.4)
def click(t0):
    n = int(0.04 * SR); q = np.arange(n) / SR
    add(((np.sin(2 * np.pi * 2400 * q) * 0.5 + rng.standard_normal(n) * 0.3) * np.exp(-q / 0.004)).astype(np.float32), t0, 0.32)
def pop(t0):
    n = int(0.18 * SR); q = np.arange(n) / SR; f = 600 + 900 * np.exp(-q / 0.02)
    add((np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-q / 0.05) * 0.18).astype(np.float32), t0)
def bell(t0, m, g=0.09):
    n = int(1.5 * SR); q = np.arange(n) / SR; f = 440 * 2 ** ((m - 69) / 12)
    add((np.sin(2 * np.pi * f * q + 2 * np.exp(-q / 0.25) * np.sin(2 * np.pi * f * 3.5 * q)) * np.exp(-q / 0.5) * g).astype(np.float32), t0)

for c in chapters:
    if c['card']:
        whoosh(c['card'][0] + 0.2, 0.6, 0.35)
        for i, m in enumerate([79, 84, 88]): bell(c['card'][0] + 0.45 + i * 0.07, m, 0.06)
for i, b in enumerate(beats):
    if i and beats[i - 1]['shot'] != b['shot']: whoosh(b['t0'] + 0.3, 0.45, 0.18)
    if b['click'] and b['cursor']: click(b['t0'] + 1.35)
    if b['label']: pop(b['t0'] + 1.25)
for i, m in enumerate([72, 76, 79, 84]): bell(0.3 + i * 0.08, m, 0.1)
o = chapters[-1]; whoosh(o['t0'], 0.6, 0.35)
for k2, _ in enumerate(o.get('summary') or []): pop(o['t0'] + 0.8 + k2 * 0.55)
mix = np.tanh((bed * duck * 0.5 + fx + np.stack([vo, vo])) * 1.05) / 1.05
wavfile.write(f'producao/mix_{MODE}_raw.wav', SR, mix.T.astype(np.float32))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'producao/mix_{MODE}_raw.wav', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', f'tutpf_{MODE}_mix.wav'], check=True)

# ---- imagens e HTML ----
BRAND = r"D:\Projetos de IA\Isa alimentos\apps\web\public\brand"; I = {}
for s in {b['shot'] for b in beats}:
    buf = io.BytesIO(); Image.open(f'producao/shots_{MODE}/{s}.png').convert('RGB').save(buf, 'JPEG', quality=92)
    I[s] = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
for k2 in ['logo', 'mascot']:
    I[k2] = 'data:image/png;base64,' + base64.b64encode(open(os.path.join(BRAND, k2 + '.png'), 'rb').read()).decode()
# logo com contorno branco para aparecer bem no fundo vermelho
lg = Image.open(os.path.join(BRAND, 'logo.png')).convert('RGBA'); pad = 24
big = Image.new('RGBA', (lg.width + pad * 2, lg.height + pad * 2), (0, 0, 0, 0)); big.paste(lg, (pad, pad), lg)
al = big.split()[3].filter(ImageFilter.MaxFilter(17)); white = Image.new('RGBA', big.size, (255, 255, 255, 255)); white.putalpha(al); white.alpha_composite(big)
buf = io.BytesIO(); white.save(buf, 'PNG'); I['logoW'] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
h = open('composer3.html', encoding='utf-8').read().replace('__TL__', json.dumps(TL, ensure_ascii=False)).replace('__IMGS__', json.dumps(I))
open(f'tutpf_{MODE}_build.html', 'w', encoding='utf-8').write(h)
json.dump(TL, open(f'timelinepf_{MODE}.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(MODE, 'dur', DUR, 'passos', step)
