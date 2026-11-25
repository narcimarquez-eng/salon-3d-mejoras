# Texturas del pinsapo a partir de los atlas del usuario:
#   pinsapo/fotos/atlas_follaje.jpg          -> public/pinsapo/ramas.png (2048x2048, 4x2 celdas de 512x1024,
#                                               ramitas con el tallo abajo y el eje centrado)
#   pinsapo/fotos/atlas_corteza_follaje.jpg  -> public/pinsapo/corteza.jpg (repetible)
# El fondo de cuadros esta pintado en el JPG y la rejilla es gris oscura, como las aciculas: las lineas
# se repintan con los pixeles de al lado antes de recortar.
# Uso: python3 pinsapo/generar_texturas_pinsapo.py  (desde la raiz del repo)
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

im = Image.open('pinsapo/fotos/atlas_follaje.jpg').convert('RGB')
K = im.size[0] / 2000.0
A = np.asarray(im).astype(float).copy()
# borrar la rejilla (columnas y filas de las celdas)
for x0 in [333.3, 666.7, 1000, 1333.3, 1666.7]:
    x = int(round(x0 * K))
    for dx in range(-3, 4):
        A[:, x + dx] = (A[:, x - 5] + A[:, x + 5]) / 2
for y0 in [371.5, 745.5]:
    y = int(round(y0 * K))
    for dy in range(-3, 4):
        A[y + dy, :] = (A[y - 5, :] + A[y + 5, :]) / 2

# (x0, y0, x1, y1) en coordenadas de 2000 px y lado del tallo
PIEZAS = [
    ((35, 75, 640, 415), 'izq'),      # 0 ramillete grande y denso
    ((675, 70, 1265, 372), 'izq'),    # 1 rama larga
    ((1245, 115, 1645, 372), 'izq'),  # 2 rama fina
    ((1680, 125, 1785, 365), 'abajo'),  # 3 ramita derecha (guia)
    ((1815, 120, 1965, 365), 'abajo'),  # 4 ramita doble (guia)
    ((35, 465, 505, 750), 'izq'),     # 5 rama media
    ((1025, 415, 1335, 745), 'der'),  # 6 ramita con pinas
    ((1355, 475, 1605, 745), 'abajo'),  # 7 ramitas con yemas rojas
]


def pieza(c, tallo):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    p = A[y0:y1, x0:x1]
    lum = p.mean(axis=2)
    sat = p.max(axis=2) - p.min(axis=2)
    a = np.maximum(np.clip((172 - lum) / 40, 0, 1), np.clip((sat - 24) / 20, 0, 1))
    lab, n = ndimage.label(ndimage.binary_dilation(a > 0.4, iterations=3))
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        a = a * (lab == 1 + int(np.argmax(tam)))
    # quitar el gris del fondo mezclado en los bordes
    aa = np.clip(a, 0.2, 1)[..., None]
    p = np.clip((p - (1 - aa) * 205) / aa, 0, 255)
    img = Image.fromarray(np.dstack([p, a * 255]).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(a > 0.5)
    cx, cy = xs.mean(), ys.mean()
    w, v = np.linalg.eigh(np.cov(np.vstack([xs - cx, ys - cy])))
    eje = v[:, np.argmax(w)]
    ref = {'abajo': (0, 1), 'arriba': (0, -1), 'izq': (-1, 0), 'der': (1, 0)}[tallo]
    if eje[0] * ref[0] + eje[1] * ref[1] < 0:
        eje = -eje
    img = img.rotate(-np.degrees(np.arctan2(eje[0], eje[1])), resample=Image.BICUBIC, expand=True)
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 40)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    al = np.asarray(img)[..., 3].astype(float)
    cxm = (al.sum(axis=0) * np.arange(al.shape[1])).sum() / al.sum()
    half = int(max(cxm, al.shape[1] - cxm)) + 2
    out = Image.new('RGBA', (2 * half, img.height), (0, 0, 0, 0))
    out.paste(img, (int(half - cxm), 0))
    return out


CW, CH = 512, 1024
atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
for i, (c, tallo) in enumerate(PIEZAS):
    img = pieza(c, tallo)
    s = min((CW - 8) / img.width, (CH - 8) / img.height)
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    x, y = (i % 4) * CW, (i // 4) * CH
    atlas.alpha_composite(img, (x + (CW - img.width) // 2, y + CH - 4 - img.height))

arr = np.asarray(atlas).astype(float)
# bordes de las aciculas un poco mas oscuros (sin halo claro a distancia)
al = arr[..., 3:] / 255
arr[..., :3] *= np.clip(0.6 + 0.4 * (al - 0.5) / 0.4, 0.6, 1.0)
rgb = Image.fromarray(arr[..., :3].astype(np.uint8))
m = Image.fromarray(arr[..., 3].astype(np.uint8))
blur = np.asarray(rgb.filter(ImageFilter.GaussianBlur(10))).astype(float)
den = np.asarray(m.filter(ImageFilter.GaussianBlur(10))).astype(float)[..., None] / 255
fondo = np.where(den > 0.01, np.clip(blur / np.maximum(den, 0.02) * 0.55, 0, 255), [25, 38, 32])
final = np.where(arr[..., 3:] > 40, arr[..., :3], fondo).astype(np.uint8)
out = Image.fromarray(final).convert('RGBA')
out.putalpha(m)
out.save('public/pinsapo/ramas.png', optimize=True)

# ---------- corteza: el parche plano del atlas de corteza, repetible ----------
ic = Image.open('pinsapo/fotos/atlas_corteza_follaje.jpg').convert('RGB')
x0, y0, x1, y1 = [int(v * K) for v in (1450, 75, 1645, 352)]   # sin el nudo de la izquierda (se repetia mucho)
f = np.asarray(ic.crop((x0 + 10, y0 + 12, x1 - 10, y1 - 8))).astype(float)
col = np.convolve(np.pad(f.mean(axis=(0, 2)), 30, mode='edge'), np.ones(61) / 61, mode='same')[30:-30]
fil = np.convolve(np.pad(f.mean(axis=(1, 2)), 30, mode='edge'), np.ones(61) / 61, mode='same')[30:-30]
f = f * (col.mean() / col)[None, :, None] * (fil.mean() / fil)[:, None, None]
n = 40
w = np.linspace(0, 1, n)[None, :, None]
f[:, -n:] = f[:, -n:] * (1 - w) + f[:, :n] * w
f = f[:, :-n]
wv = np.linspace(0, 1, n)[:, None, None]
f[-n:] = f[-n:] * (1 - wv) + f[:n] * wv
f = f[:-n]
Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save('public/pinsapo/corteza.jpg', quality=90)
print('texturas del pinsapo listas; corteza', f.shape[1], 'x', f.shape[0], 'px')
