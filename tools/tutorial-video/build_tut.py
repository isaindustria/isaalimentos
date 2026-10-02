import base64, json, glob, os, io
N=os.environ.get('NAME','')
from PIL import Image
BRAND=r"D:\Projetos de IA\Isa alimentos\apps\web\public\brand"
TL=json.load(open(f'timeline{N}.json',encoding='utf-8')); used={b['shot'] for b in TL['beats']}
I={}
for s in used:
    buf=io.BytesIO(); Image.open(f'shots/{s}.png').convert('RGB').save(buf,'JPEG',quality=92); I[s]='data:image/jpeg;base64,'+base64.b64encode(buf.getvalue()).decode()
for k in ['logo','mascot']: I[k]='data:image/png;base64,'+base64.b64encode(open(os.path.join(BRAND,k+'.png'),'rb').read()).decode()
h=open('composer.html',encoding='utf-8').read().replace('__TL__',json.dumps(TL,ensure_ascii=False)).replace('__IMGS__',json.dumps(I))
open(f'tut{N}_build.html','w',encoding='utf-8').write(h); print(len(h)//1024,'KB', len(used),'telas')
