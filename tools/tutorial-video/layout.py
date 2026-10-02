import json, os
N=os.environ.get('NAME','')
S=json.load(open(f'script{N}_t.json',encoding='utf-8')); M=json.load(open('shots/meta.json',encoding='utf-8'))
CUSTOM={'dash_bell':{'bellArea':[1180,0,740,760]}}
def box(shot,key):
    if not key: return None
    if key in CUSTOM.get(shot,{}): return CUSTOM[shot][key]
    if key in M.get(shot,{}): return M[shot][key]
    base=shot.split('_')[0]
    for s,v in M.items():
        if s.split('_')[0]==base and key in v: return v[key]
    print('SEM CAIXA',shot,key); return None
t=0.0; chapters=[]; beats=[]; clicks=[]
for c in S:
    c0=t
    if not c.get('intro') and not c.get('outro') and not c.get('nocard'):
        card=(t,t+2.3); t+=2.3
    else: card=None
    if c.get('intro'): t+=3.2   # titulo de abertura antes da voz
    for b in c['beats']:
        dur=b['e']-b['s']+0.3; vs=t+0.25-b['s']
        B=dict(t0=t,t1=t+dur+0.3,shot=b['shot'],vo=b['vo'],voStart=vs,caption=b['say'],focus=box(b['shot'],b.get('focus')),cursor=box(b['shot'],b.get('cursor')),click=bool(b.get('click')),hl=box(b['shot'],b.get('hl')),ch=len(chapters))
        if B['click'] and B['cursor']: clicks.append(t+0.95)
        beats.append(B); t=B['t1']
    if c.get('outro'): t+=3.5
    chapters.append(dict(num=c['ch'],title=c['title'],sub=c.get('sub'),end1=c.get('end1'),end2=c.get('end2'),t0=c0,t1=t,card=card,intro=bool(c.get('intro')),outro=bool(c.get('outro'))))
json.dump(dict(dur=round(t+0.3,2),chapters=chapters,beats=beats,clicks=clicks),open(f'timeline{N}.json','w',encoding='utf-8'),ensure_ascii=False)
print('duracao',round(t,1),'s', len(beats),'cenas')
