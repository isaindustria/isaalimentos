# Trilha "produzida": groove latin-house 100 bpm, e-piano FM, baixo com sidechain, marimba, reverb de convolucao.
# Gera music.wav e sfx.wav (estereo 48k float) seguindo a linha do tempo do video.
import numpy as np, json
from scipy import signal
from scipy.io import wavfile

import os
SR = 48000; DUR = 38.4; N = int(SR * DUR)
BPM = 100; BEAT = 60 / BPM; S16 = BEAT / 4
rng = np.random.default_rng(7)
T = {'sections': [['breakdown', 0, 99]], 'gap': [-1, -1], 'intro': [0, 0.1], 'breakdownT': [50, 51], 'endHit': 99, 'events': {}}

def buf(): return np.zeros((2, N))
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def tt(n): return np.arange(n) / SR
def sos(kind, f, order=2):
    if kind == 'bp': return signal.butter(order, [f[0] / (SR / 2), f[1] / (SR / 2)], 'band', output='sos')
    return signal.butter(order, f / (SR / 2), kind, output='sos')
def filt(x, kind, f, order=2): return signal.sosfilt(sos(kind, f, order), x)
def add(b, x, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    x = x[: N - i]
    l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
    b[0, i:i + len(x)] += x * gain * l * 1.414; b[1, i:i + len(x)] += x * gain * r * 1.414
def sweep_filter(x, kind, f0, f1, q=0.7, block=256):
    # filtro que varia no tempo (bloco a bloco, estado preservado)
    out = np.zeros_like(x); zi = None; n = len(x)
    for s in range(0, n, block):
        p = s / max(1, n - 1); f = f0 * (f1 / f0) ** p
        if kind == 'bp': c = signal.butter(2, [max(30, f / (1 + 1 / q)) / (SR / 2), min(SR / 2 - 100, f * (1 + 1 / q)) / (SR / 2)], 'band', output='sos')
        else: c = signal.butter(2, min(f, SR / 2 - 100) / (SR / 2), kind, output='sos')
        if zi is None or zi.shape[0] != c.shape[0]: zi = np.zeros((c.shape[0], 2))
        out[s:s + block], zi = signal.sosfilt(c, x[s:s + block], zi=zi)
    return out
def env(n, a, d, curve=1.0):
    t = tt(n); e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d); return e ** curve
def noise(n): return rng.standard_normal(n)
def hum(t, amt=0.004): return t + rng.uniform(-amt, amt)
def vel(v, amt=0.12): return v * (1 + rng.uniform(-amt, amt))

# ---------- reverb (IR sintetica estereo, cauda escurecendo) ----------
def make_ir(sec=2.2, pre=0.018, damp=0.6):
    n = int(sec * SR); t = tt(n); ir = np.zeros((2, n + int(pre * SR)))
    for ch in range(2):
        x = noise(n) * np.exp(-t * 6.9 / sec)
        lo = filt(x, 'low', 2500); x = x * np.exp(-t * damp * 3) + lo * (1 - np.exp(-t * damp * 3))
        er = np.zeros(n)
        for k in range(14):  # reflexoes iniciais
            j = int(rng.uniform(0.004, 0.07) * SR); er[j] += rng.uniform(-1, 1) * (1 - k / 14) * 3
        ir[ch, int(pre * SR):] = x + er
    return ir / np.abs(ir).sum(axis=1, keepdims=True).max() * 9
IR = make_ir(); IR_SHORT = make_ir(0.9, 0.008, 1.2)
def reverb(b, ir=IR):
    m = b.mean(axis=0) if b.ndim == 2 else b
    out = np.stack([signal.fftconvolve(m, ir[c])[:N] for c in range(2)]); return out

# ---------- instrumentos ----------
def kick(v=1.0):
    n = int(0.45 * SR); t = tt(n)
    f = 46 + 110 * np.exp(-t / 0.035) + 30 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = filt(noise(n), 'high', 2500) * np.exp(-t / 0.003) * 0.35
    return np.tanh((body + click) * 1.6) * v * 0.9
def clap(v=1.0):
    n = int(0.5 * SR); t = tt(n); x = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.021, 0.034]):
        j = int(off * SR); e = np.exp(-(t[: n - j]) / (0.008 if k < 3 else 0.14)); x[j:] += noise(n - j) * e * (0.8 if k < 3 else 1)
    return filt(filt(x, 'bp', (900, 5200)), 'high', 600) * v * 0.55
def hat(v=1.0, open_=False):
    n = int((0.35 if open_ else 0.08) * SR); t = tt(n)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in [3140, 4410, 5310, 6800, 8270, 9910]) / 6 * 0.4 + noise(n) * 0.6
    return filt(x, 'high', 7000) * np.exp(-t / (0.11 if open_ else 0.022)) * v * 0.32
def shaker(v=1.0):
    n = int(0.12 * SR); t = tt(n)
    return filt(noise(n), 'bp', (4500, 11000)) * (np.minimum(1, t / 0.012) * np.exp(-t / 0.03)) * v * 0.3
def conga(m, v=1.0):
    n = int(0.4 * SR); t = tt(n); f = mtof(m) * (1 + 0.25 * np.exp(-t / 0.015))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13) + filt(noise(n), 'bp', (1500, 4000)) * np.exp(-t / 0.006) * 0.4
    return x * v * 0.45
def rim(v=1.0):
    n = int(0.08 * SR); t = tt(n)
    x = (np.sin(2 * np.pi * 1720 * t) + 0.6 * np.sin(2 * np.pi * 820 * t)) * np.exp(-t / 0.012) + filt(noise(n), 'high', 3000) * np.exp(-t / 0.003)
    return x * v * 0.22
def epiano(m, dur, v=1.0):
    n = int((dur + 1.2) * SR); t = tt(n); f = mtof(m)
    idx = 1.8 * np.exp(-t / 0.35) + 0.25 * v
    mod = np.sin(2 * np.pi * f * t) * idx
    tine = np.sin(2 * np.pi * f * 14 * t) * np.exp(-t / 0.02) * 0.12 * v
    car = np.sin(2 * np.pi * f * t + mod) + 0.25 * np.sin(2 * np.pi * 2 * f * t + mod * 0.5) * np.exp(-t / 0.4)
    e = np.minimum(1, t / 0.004) * np.exp(-t / 1.6) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.18))
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.8 * t)
    return (car * e * trem + tine) * v * 0.16
def marimba(m, v=1.0):
    n = int(0.9 * SR); t = tt(n); f = mtof(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.32) + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.06) + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.015)
    x += filt(noise(n), 'bp', (f * 2, min(18000, f * 8))) * np.exp(-t / 0.004) * 0.25
    return x * np.minimum(1, t / 0.0015) * v * 0.22
def bass(m, dur, v=1.0):
    n = int((dur + 0.15) * SR); t = tt(n); f = mtof(m)
    ph = 2 * np.pi * f * t
    x = np.sin(ph) + 0.35 * np.tanh(3 * np.sin(ph)) * np.exp(-t / 0.12) + 0.15 * np.sin(2 * ph)
    e = np.minimum(1, t / 0.006) * np.where(t < dur, np.exp(-t / 0.9), np.exp(-dur / 0.9) * np.exp(-(t - dur) / 0.03))
    return filt(x * e, 'low', 900) * v * 0.5
def pad(ms, dur, v=1.0):
    n = int((dur + 1.0) * SR); t = tt(n); x = np.zeros(n)
    for m in ms:
        for d in (-7, 0, 7):
            f = mtof(m) * 2 ** (d / 1200)
            for h in range(1, 7): x += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h ** 1.3
    e = np.minimum(1, t / 0.6) * np.where(t < dur, 1, np.exp(-(t - dur) / 0.45))
    return filt(x * e, 'low', 1800) / (len(ms) * 3) * v * 0.22
def bell(m, v=1.0):
    n = int(1.6 * SR); t = tt(n); f = mtof(m)
    x = np.sin(2 * np.pi * f * t + 2.2 * np.exp(-t / 0.25) * np.sin(2 * np.pi * f * 3.5 * t))
    return x * np.exp(-t / 0.5) * np.minimum(1, t / 0.002) * v * 0.12
def pluck(m, v=1.0, dur=0.8):  # Karplus-Strong (corda do arco)
    n = int(dur * SR); p = int(SR / mtof(m)); y = np.zeros(n); y[:p] = rng.uniform(-1, 1, p)
    for i in range(p, n): y[i] = 0.497 * (y[i - p] + y[i - p + 1]) if i - p + 1 < n else 0
    return y * v * 0.35

# ---------- harmonia ----------
CH = [[50, 53, 57, 60, 64], [43, 47, 53, 57, 62], [48, 52, 55, 59, 62], [45, 48, 52, 55, 59]]  # Dm9 G9 Cmaj9 Am9
ROOT = [38, 43, 36, 45]
BAR = BEAT * 4
def chord(bar): return CH[bar % 4]
def sec(t):
    for name, a, b in T['sections']:
        if a <= t < b: return name
    return 'end'

drums, bassb, keys, perc, lead, padb = buf(), buf(), buf(), buf(), buf(), buf()
kicks = []
nb = int(DUR / BEAT) + 1
for b in range(nb):
    t = b * BEAT; s = sec(t)
    if s in ('intro', 'verse', 'drop', 'final') and not (s == 'verse' and t >= T['gap'][0] and t < T['gap'][1]):
        add(drums, kick(vel(1.0, 0.05)), hum(t, 0.002), 1.0); kicks.append(t)
    if s in ('verse', 'drop', 'final') and b % 2 == 1 and t < T['gap'][0] or (s in ('drop', 'final') and b % 2 == 1):
        add(drums, clap(vel(0.9)), hum(t + 0.004), 0.9, rng.uniform(-0.1, 0.1))
    for k in range(4):  # 16 avos com swing
        st = t + k * S16 + (0.028 if k % 2 else 0)
        if s == 'breakdown' and k % 2 == 0: continue
        if s == 'end' or (T['gap'][0] <= st < T['gap'][1]): continue
        add(perc, shaker(vel([0.5, 0.9, 0.6, 1.0][k], 0.25)), hum(st), 0.9 if s != 'intro' else 0.6, 0.35)
        if s in ('drop', 'final') and k == 2: add(drums, hat(vel(0.8), True), hum(st), 0.7, -0.25)
        if s in ('verse', 'drop', 'final') and k in (1, 3): add(drums, hat(vel(0.5, 0.3)), hum(st), 0.6, -0.3)
    if s in ('drop', 'final'):  # congas e aro
        if b % 4 == 3: add(perc, conga(64, vel(0.8)), hum(t + 2 * S16 + 0.028), 1, 0.4); add(perc, conga(59, vel(0.9)), hum(t + 3 * S16 + 0.028), 1, 0.4)
        if b % 4 == 1: add(perc, conga(67, vel(0.6)), hum(t + 3 * S16 + 0.028), 1, -0.4)
        if b % 2 == 0: add(perc, rim(vel(0.7)), hum(t + 3 * S16 + 0.028), 1, -0.5)

for bar in range(int(DUR / BAR) + 1):
    t = bar * BAR; s = sec(t + 0.01); ch = chord(bar)
    if s == 'end': continue
    if s in ('intro', 'breakdown'):
        add(padb, pad(ch, BAR, 1.0), t, 1.0)
    # e-piano: comping sincopado
    hits = [(0, 1.2), (6, 0.5), (10, 0.9)] if s in ('drop', 'final') else [(0, 2.0), (10, 0.9)]
    if s in ('verse', 'drop', 'final', 'breakdown'):
        for st, d in hits:
            tt0 = t + st * S16 + (0.028 if st % 2 else 0)
            if T['gap'][0] <= tt0 < T['gap'][1]: continue
            for j, m in enumerate(ch[1:]):
                add(keys, epiano(m + 12, d * BEAT, vel(0.85, 0.15)), hum(tt0 + j * 0.006), 1.0, (j - 1.5) * 0.25)
    if s in ('verse', 'drop', 'final'):
        r = ROOT[bar % 4]
        pat = [(0, r, 2.5), (3, r + 12, 0.8), (6, r, 1.5), (8, r + 7, 0.8), (11, r, 1.0), (14, r + 12, 0.8)] if s != 'verse' else [(0, r, 3), (6, r, 1.5), (11, r + 7, 1.5)]
        for st, m, d in pat:
            tt0 = t + st * S16 + (0.028 if st % 2 else 0)
            if T['gap'][0] <= tt0 < T['gap'][1]: continue
            add(bassb, bass(m, d * S16, vel(0.9, 0.1)), hum(tt0, 0.003))
    if s in ('drop', 'final'):
        mel = [(0, 76), (3, 79), (6, 81), (8, 79), (10, 76), (12, 74), (14, 76)] if bar % 2 == 0 else [(0, 72), (3, 74), (6, 76), (8, 79), (11, 81), (14, 84)]
        for st, m in mel:
            tt0 = t + st * S16 + (0.028 if st % 2 else 0)
            add(lead, marimba(m, vel(0.85, 0.15)), hum(tt0, 0.005), 1.0, 0.2); add(lead, marimba(m - 12, 0.25), hum(tt0 + 0.012), 1.0, -0.3)

# acorde final


# sidechain (respiro do kick) no baixo/teclas/pad
sc = np.ones(N)
for k in kicks:
    i = int(k * SR); n = min(N - i, int(0.4 * SR)); x = tt(n); sc[i:i + n] = np.minimum(sc[i:i + n], 1 - 0.55 * np.exp(-x / 0.11))
sc = np.convolve(sc, np.ones(96) / 96, 'same')
for b_ in (bassb, keys, padb): b_ *= sc

# filtro abrindo na intro, fechando no breakdown
def lp_auto(b, pts):
    out = np.zeros_like(b)
    for c in range(2):
        x = b[c]; y = np.zeros_like(x); zi = None
        for s in range(0, N, 512):
            tm = s / SR; f = np.interp(tm, [p[0] for p in pts], [p[1] for p in pts])
            co = signal.butter(2, f / (SR / 2), 'low', output='sos')
            if zi is None: zi = np.zeros((co.shape[0], 2))
            y[s:s + 512], zi = signal.sosfilt(co, x[s:s + 512], zi=zi)
        out[c] = y
    return out
music = drums * 0.95 + perc * 0.8 + bassb * 1.0 + keys * 0.9 + lead * 0.8 + padb * 0.9
music = music + reverb(keys * 0.35 + lead * 0.5 + padb * 0.3 + drums * 0.08 + perc * 0.12)
I = T['intro'][1]; B0, B1 = T['breakdownT']
music = lp_auto(music, [(0, 3600), (DUR, 3600)])
music = np.tanh(music * 1.15) / 1.15  # saturacao leve tipo fita

def save(name, b):
    wavfile.write(name, SR, (b.T).astype(np.float32))
loop = music[:, int(19.2 * SR):int(38.4 * SR)]
save('bed_loop.wav', loop); print('loop', loop.shape, np.abs(loop).max())
