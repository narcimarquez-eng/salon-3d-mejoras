# Genera public/pino/corteza_atlas.jpg (repetible en horizontal y vertical) a partir de los
# troncos cilindricos del atlas de corteza del usuario (pino/fotos/atlas_corteza.jpg).
# De cada tronco se toma la franja central (la que mira de frente), se le quita el sombreado
# del cilindro y se cosen con fundidos. Uso: python3 pino/generar_corteza_atlas.py
from PIL import Image
import numpy as np

im = Image.open('pino/fotos/atlas_corteza.jpg').convert('RGB')
K = im.size[0] / 2000.0
# (x0, x1, y0, y1) del tronco en coordenadas de 2000 px de ancho
TRONCOS = [(45, 215, 40, 355), (245, 425, 40, 350), (470, 650, 40, 355), (50, 205, 388, 725),
           (248, 428, 388, 725)]
ALTO = 360          # px de cada franja (se reescalan todas a esta altura)
SOLAPE = 26         # px de fundido entre franjas


def franja(c, arriba=0.2):
    x0, x1, y0, y1 = [int(v * K) for v in c]
    w, h = x1 - x0, y1 - y0
    # centro del cilindro: 56 % del ancho; alto sin los extremos rotos
    a = im.crop((x0 + int(w * 0.22), y0 + int(h * arriba), x1 - int(w * 0.22), y1 - int(h * 0.06)))
    a = a.resize((int(a.width * ALTO / a.height), ALTO), Image.LANCZOS)
    f = np.asarray(a).astype(float)
    # quitar el sombreado de cilindro (oscuro a los lados) y el degradado vertical
    col = f.mean(axis=(0, 2))
    col = np.convolve(np.pad(col, 15, mode='edge'), np.ones(31) / 31, mode='same')[15:-15]
    fil = f.mean(axis=(1, 2))
    fil = np.convolve(np.pad(fil, 40, mode='edge'), np.ones(81) / 81, mode='same')[40:-40]
    f = f * (col.mean() / col)[None, :, None] * (fil.mean() / fil)[:, None, None]
    return f


def coser(a, b, n):
    w = np.linspace(0, 1, n)[None, :, None]
    mid = a[:, -n:] * (1 - w) + b[:, :n] * w
    return np.concatenate([a[:, :-n], mid, b[:, n:]], axis=1)


tiras = [franja(c, 0.3 if i == 1 else 0.2) for i, c in enumerate(TRONCOS)]   # el 2.o tiene el borde de arriba roto
medio = np.mean([t.mean(axis=(0, 1)) for t in tiras], axis=0)
tiras = [t * (medio / t.mean(axis=(0, 1)))[None, None, :] for t in tiras]   # mismo tono medio
tex = tiras[0]
for t in tiras[1:]:
    tex = coser(tex, t, SOLAPE)
# cerrar en horizontal (el final funde con el principio) y en vertical
n = SOLAPE
w = np.linspace(0, 1, n)[None, :, None]
tex[:, -n:] = tex[:, -n:] * (1 - w) + tex[:, :n] * w
tex = tex[:, :-n]
nv = 60
wv = np.linspace(0, 1, nv)[:, None, None]
tex[-nv:] = tex[-nv:] * (1 - wv) + tex[:nv] * wv
tex = tex[:-nv]
# algo mas calido, como la corteza rojiza del pino pinonero
tex = tex * np.array([1.05, 0.95, 0.88])
out = Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8))
print('tamano', out.size, 'proporcion ancho/alto', round(out.width / out.height, 2))
out.resize((1024, 512), Image.LANCZOS).save('public/pino/corteza_atlas.jpg', quality=90)
