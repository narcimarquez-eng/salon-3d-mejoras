# Genera las texturas de la palmera a partir del atlas del usuario (palmera/fotos/atlas_palmera.jpg):
#   public/palmera/hojas.png  2048x2048: 2 filas x 6 hojas (341x832, tallo abajo y nervio centrado)
#                             + 1 fila de 6 celdas de 341x384 (racimos de datiles con el tallo arriba, fibra)
#   public/palmera/tronco.jpg 512x1024 repetible (anillos del estipe)
# Uso: python3 palmera/generar_texturas_palmera.py   (desde la raiz del repo)
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

im = Image.open('palmera/fotos/atlas_palmera.jpg').convert('RGB')
K = im.size[0] / 2000.0
A = np.asarray(im).astype(float)

# (x0, y0, x1, y1) en coordenadas de 2000 px y lado donde esta el tallo
HOJAS = [
    ((25, 70, 253, 678), 'abajo'),      # verde grande
    ((502, 171, 658, 600), 'abajo'),    # verde estrecha
    ((26, 783, 511, 1005), 'izq'),      # verde horizontal
    ((220, 63, 550, 192), 'izq'),       # verde pequena
    ((925, 1028, 1093, 1371), 'abajo'), # verde corta
    ((680, 865, 1165, 1076), 'der'),    # verde curvada
    ((145, 535, 585, 732), 'der'),      # verde horizontal 2
    ((29, 1019, 499, 1258), 'der'),     # verde oliva (vieja)
    ((515, 947, 657, 1345), 'abajo'),   # verde oliva vertical
    ((1351, 57, 1483, 550), 'arriba'),  # seca gris
    ((1493, 65, 1632, 462), 'arriba'),  # seca parda
    ((68, 1266, 594, 1470), 'der'),     # seca dorada
]
RACIMOS = [  # tallo arriba
    ((1481, 780, 1616, 1030), 'arriba'),  # datiles maduros
    ((1347, 792, 1465, 1025), 'arriba'),  # datiles verdes
    ((1230, 789, 1313, 969), 'arriba'),   # datiles rojos
    ((1620, 781, 1792, 1045), 'arriba'),  # datiles verde-amarillos
    ((1143, 785, 1220, 960), 'arriba'),   # racimo pequeno
    ((1631, 1065, 1955, 1258), None),     # fibra (para la cabeza del tronco)
]


def pieza(c, tallo):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    pad = 6
    p = A[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
    lum = p.mean(axis=2)
    sat = p.max(axis=2) - p.min(axis=2)
    a = np.maximum(np.clip((sat - 12) / 14, 0, 1), np.clip((lum - 78) / 25, 0, 1))
    # solo la pieza principal (los foliolos sueltos se unen con la dilatacion; fuera trozos vecinos)
    lab, n = ndimage.label(ndimage.binary_dilation(a > 0.4, iterations=3))
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        a = a * (lab == 1 + int(np.argmax(tam)))
    rgba = np.dstack([p, a * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    if tallo is None:
        return img
    # girar para que el eje principal quede vertical con el tallo abajo
    ys, xs = np.nonzero(a > 0.5)
    cx, cy = xs.mean(), ys.mean()
    cov = np.cov(np.vstack([xs - cx, ys - cy]))
    w, v = np.linalg.eigh(cov)
    eje = v[:, np.argmax(w)]                      # (dx, dy) en la imagen
    ref = {'abajo': (0, 1), 'arriba': (0, -1), 'izq': (-1, 0), 'der': (1, 0)}[tallo]
    if eje[0] * ref[0] + eje[1] * ref[1] < 0:
        eje = -eje                                # eje apunta hacia el tallo
    # angulo para llevar "eje" a (0, 1) (hacia abajo en la imagen)
    ang = np.degrees(np.arctan2(eje[0], eje[1]))
    img = img.rotate(-ang, resample=Image.BICUBIC, expand=True)   # ahora el tallo queda abajo
    al = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(al > 40)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # centrar el nervio: centro de masas horizontal en el medio
    al = np.asarray(img)[..., 3].astype(float)
    cxm = (al.sum(axis=0) * np.arange(al.shape[1])).sum() / al.sum()
    half = int(max(cxm, al.shape[1] - cxm)) + 2
    out = Image.new('RGBA', (2 * half, img.height), (0, 0, 0, 0))
    out.paste(img, (int(half - cxm), 0))
    return out


def colocar(atlas, img, x, y, cw, ch, tallo_arriba):
    s = min((cw - 6) / img.width, (ch - 6) / img.height)
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    ox = x + (cw - img.width) // 2
    oy = y + 3 if tallo_arriba else y + ch - 3 - img.height
    atlas.alpha_composite(img, (ox, oy))


atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
for i, (c, tallo) in enumerate(HOJAS):
    img = pieza(c, tallo)
    colocar(atlas, img, (i % 6) * 341, (i // 6) * 832, 341, 832, False)
for i, (c, tallo) in enumerate(RACIMOS):
    img = pieza(c, tallo)
    if tallo is not None:
        img = img.rotate(180, expand=True)   # racimos colgando: tallo arriba en la celda
    colocar(atlas, img, i * 341, 1664, 341, 384, tallo is not None)

# color bajo alpha 0: el de la pieza desenfocado y oscurecido (sin halos al hacer mipmaps)
arr = np.asarray(atlas).astype(float)
rgb = Image.fromarray(arr[..., :3].astype(np.uint8))
m = Image.fromarray(arr[..., 3].astype(np.uint8))
blur = np.asarray(rgb.filter(ImageFilter.GaussianBlur(10))).astype(float)
den = np.asarray(m.filter(ImageFilter.GaussianBlur(10))).astype(float)[..., None] / 255
fondo = np.clip(blur / np.maximum(den, 0.02) * 0.55, 0, 255)
fondo = np.where(den > 0.01, fondo, [40, 45, 25])
final = np.where(arr[..., 3:] > 40, arr[..., :3], fondo).astype(np.uint8)
out = Image.fromarray(final).convert('RGBA')
out.putalpha(m)
out.save('public/palmera/hojas.png', optimize=True)

# ---------- tronco: dos parches de estipe cosidos y repetibles ----------
def parche(c):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    a = im.crop((x0 + 16, y0 + 10, x1 - 16, y1 - 10)).resize((256, 640), Image.LANCZOS)
    f = np.asarray(a).astype(float)
    col = np.convolve(np.pad(f.mean(axis=(0, 2)), 20, mode='edge'), np.ones(41) / 41, mode='same')[20:-20]
    return f * (col.mean() / col)[None, :, None]

t1 = parche((886, 57, 1060, 476))
t2 = parche((1066, 58, 1207, 476))
t2 = t2 * (t1.mean(axis=(0, 1)) / t2.mean(axis=(0, 1)))
n = 32
w = np.linspace(0, 1, n)[None, :, None]
tex = np.concatenate([t1[:, :-n], t1[:, -n:] * (1 - w) + t2[:, :n] * w, t2[:, n:]], axis=1)
tex[:, -n:] = tex[:, -n:] * (1 - w) + tex[:, :n] * w
tex = tex[:, :-n]
nv = 70
wv = np.linspace(0, 1, nv)[:, None, None]
tex[-nv:] = tex[-nv:] * (1 - wv) + tex[:nv] * wv
tex = tex[:-nv]
Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).resize((512, 1024), Image.LANCZOS).save('public/palmera/tronco.jpg', quality=90)
print('texturas de la palmera listas; tronco', tex.shape[1], 'x', tex.shape[0], 'px')
