# Texturas del liquidambar a partir de los atlas del usuario:
#   liquidambar/fotos/atlas_follaje.jpg -> public/liquidambar/hojas.png (2048x2048, 4x4 celdas de 512x512:
#       0-9 ramilletes de otono con el tallo abajo, 10-11 ramitas con pocas hojas, 12 bolas de semillas)
#   liquidambar/fotos/atlas_arbol.jpg   -> public/liquidambar/corteza.jpg (paneles de corteza, repetible)
# Fondo de cuadros pintado y rejilla gris oscura: la rejilla se repinta con los pixeles de al lado.
# Uso: python3 liquidambar/generar_texturas_liquidambar.py  (desde la raiz del repo)
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

im = Image.open('liquidambar/fotos/atlas_follaje.jpg').convert('RGB')
K = im.size[0] / 2000.0
A = np.asarray(im).astype(float).copy()
for x in [549, 1100, 1376, 1651, 2201]:          # columnas de la rejilla (px reales)
    for dx in range(-2, 4):
        A[:, x + dx] = (A[:, x - 4] + A[:, x + 5]) / 2
for y in [510, 1025]:                             # filas
    for dy in range(-2, 4):
        A[y + dy, :] = (A[y - 4, :] + A[y + 5, :]) / 2

# (x0, y0, x1, y1) en coordenadas de 2000 px. Todos con el tallo abajo.
PIEZAS = [
    (30, 35, 385, 315),     # 0 rojo denso
    (425, 40, 790, 335),    # 1 naranja y verde oliva
    (825, 75, 1185, 305),   # 2 naranja
    (1255, 40, 1535, 340),  # 3 rojo, arbolito
    (1675, 30, 1935, 345),  # 4 naranja, ralo
    (25, 425, 380, 715),    # 5 rojo y ocre, denso
    (420, 430, 780, 710),   # 6 rojo
    (830, 415, 1175, 710),  # 7 naranja en V
    (1230, 445, 1550, 705), # 8 naranja, dos ramitas
    (1655, 425, 1955, 715), # 9 amarillo verdoso
    (55, 780, 355, 1100),   # 10 ramita con hojas rojas
    (430, 820, 710, 1075),  # 11 ramita fina
    (1490, 768, 1580, 1005),  # 12 bola de semillas con su rabillo (cuelga)
]


def pieza(c, todas=False):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    p = A[y0:y1, x0:x1]
    lum = p.mean(axis=2)
    sat = p.max(axis=2) - p.min(axis=2)
    a = np.maximum(np.clip((170 - lum) / 40, 0, 1), np.clip((sat - 26) / 20, 0, 1))
    lab, n = ndimage.label(ndimage.binary_dilation(a > 0.4, iterations=3))
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        a = a * np.isin(lab, 1 + np.where(tam >= tam.max() * 0.08)[0])
    aa = np.clip(a, 0.2, 1)[..., None]
    p = np.clip((p - (1 - aa) * 210) / aa, 0, 255)
    img = Image.fromarray(np.dstack([p, a * 255]).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(a > 0.4)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


C = 512
atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
for i, c in enumerate(PIEZAS):
    img = pieza(c)
    s = min((C - 8) / img.width, (C - 6) / img.height)
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    x, y = (i % 4) * C, (i // 4) * C
    if i == 12:   # la bola cuelga: tallo arriba
        atlas.alpha_composite(img, (x + (C - img.width) // 2, y + 3))
    else:         # tallo abajo, centrado
        atlas.alpha_composite(img, (x + (C - img.width) // 2, y + C - 3 - img.height))

arr = np.asarray(atlas).astype(float)
al = arr[..., 3:] / 255
arr[..., :3] *= np.clip(0.65 + 0.35 * (al - 0.5) / 0.4, 0.65, 1.0)
rgb = Image.fromarray(arr[..., :3].astype(np.uint8))
m = Image.fromarray(arr[..., 3].astype(np.uint8))
blur = np.asarray(rgb.filter(ImageFilter.GaussianBlur(10))).astype(float)
den = np.asarray(m.filter(ImageFilter.GaussianBlur(10))).astype(float)[..., None] / 255
fondo = np.where(den > 0.01, np.clip(blur / np.maximum(den, 0.02) * 0.55, 0, 255), [70, 30, 15])
# borde de cada hoja (1-2 px junto a la transparencia): venia blanquecino del fondo claro;
# se sustituye por el color medio de la pieza alrededor
dentro = arr[..., 3] > 127
borde = dentro & ~ndimage.binary_erosion(dentro, iterations=2)
color_local = np.clip(blur / np.maximum(den, 0.02), 0, 255) * 0.8
arr[..., :3] = np.where(borde[..., None], np.minimum(arr[..., :3], color_local), arr[..., :3])
final = np.where(arr[..., 3:] > 40, arr[..., :3], fondo).astype(np.uint8)
out = Image.fromarray(final).convert('RGBA')
out.putalpha(m)
out.save('public/liquidambar/hojas.png', optimize=True)

# ---------- corteza: dos paneles planos del atlas del arbol, uno encima del otro ----------
ia = Image.open('liquidambar/fotos/atlas_arbol.jpg').convert('RGB')
def panel(c):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    f = np.asarray(ia.crop((x0, y0, x1, y1)).resize((256, 600), Image.LANCZOS)).astype(float)
    col = np.convolve(np.pad(f.mean(axis=(0, 2)), 25, mode='edge'), np.ones(51) / 51, mode='same')[25:-25]
    return f * (col.mean() / col)[None, :, None]
p1 = panel((652, 30, 770, 350))
p2 = panel((652, 395, 770, 715))
p2 = p2 * (p1.mean(axis=(0, 1)) / p2.mean(axis=(0, 1)))
nv = 50
wv = np.linspace(0, 1, nv)[:, None, None]
f = np.concatenate([p1[:-nv], p1[-nv:] * (1 - wv) + p2[:nv] * wv, p2[nv:]], axis=0)
f[-nv:] = f[-nv:] * (1 - wv) + f[:nv] * wv
f = f[:-nv]
n = 30
w = np.linspace(0, 1, n)[None, :, None]
f[:, -n:] = f[:, -n:] * (1 - w) + f[:, :n] * w
f = f[:, :-n]
Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).resize((256, 1024), Image.LANCZOS).save('public/liquidambar/corteza.jpg', quality=90)
print('texturas del liquidambar listas; corteza', f.shape[1], 'x', f.shape[0])
