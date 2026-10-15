# Folha de contato das fotos com as caixas do meta.json desenhadas (para conferir)
import json, sys, math
from PIL import Image, ImageDraw
mode = sys.argv[1]; ids = sys.argv[2].split(','); out = sys.argv[3]; cols = int(sys.argv[4]) if len(sys.argv) > 4 else 2
M = json.load(open(f'shots_{mode}/meta.json', encoding='utf-8'))
ims = []
for i in ids:
    im = Image.open(f'shots_{mode}/{i}.png').convert('RGB'); d = ImageDraw.Draw(im)
    for k, (x, y, w, h) in M.get(i, {}).items():
        d.rectangle([x, y, x + w, y + h], outline=(0, 160, 255), width=4); d.text((x + 4, y + 4), k, fill=(0, 90, 255))
    d.text((10, 10), i, fill=(255, 0, 0)); ims.append(im)
W = 900 if mode == 'web' else 420; sc = W / ims[0].width; H = int(ims[0].height * sc)
rows = math.ceil(len(ims) / cols); S = Image.new('RGB', (W * cols, H * rows), 'white')
for n, im in enumerate(ims): S.paste(im.resize((W, H)), ((n % cols) * W, (n // cols) * H))
S.save(out, quality=85)
