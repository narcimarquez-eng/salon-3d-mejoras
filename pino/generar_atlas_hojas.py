# Genera public/pino/hojas.png (2048x2048, 6 columnas x 3 filas de 341x682 px) a partir del
# atlas de Pinus pinea del usuario (pino/fotos/atlas_pinea.jpg), cuyo fondo de cuadros grises
# esta pintado en la imagen (no es transparencia real).
#   Fila 0: 6 penachos de punta de rama (tallo abajo)
#   Fila 1: 2 penachos + 4 ramitas colgantes (tallo arriba)
#   Fila 2: 3 ramitas colgantes + 3 penachos pequenos (tallo abajo)
# Uso: python3 pino/generar_atlas_hojas.py   (desde la raiz del repo)
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

SRC = 'pino/fotos/atlas_pinea.jpg'
OUT = 'public/pino/hojas.png'
im = Image.open(SRC).convert('RGB')
K = im.size[0] / 2000.0          # coordenadas medidas sobre la imagen a 2000 px de ancho
A = np.asarray(im).astype(float)

# (x0, x1, y0, y1) en coordenadas de 2000 px, y si el tallo esta abajo ('b') o arriba ('t')
PENACHOS = [(25, 232, 22, 362), (232, 447, 22, 362), (447, 667, 22, 362), (667, 833, 22, 362),
            (833, 1000, 22, 362), (1000, 1167, 22, 362), (1167, 1333, 22, 362), (1333, 1497, 22, 362)]
COLGANTES = [(25, 232, 370, 745), (232, 447, 370, 745), (447, 667, 370, 745), (667, 833, 370, 745),
             (833, 1000, 370, 745), (1000, 1167, 370, 745), (1167, 1333, 370, 745)]
PEQUENOS = [(1000, 1110, 915, 1085), (1110, 1222, 915, 1085), (1222, 1333, 915, 1085)]
PIEZAS = [(c, 'b') for c in PENACHOS] + [(c, 't') for c in COLGANTES] + [(c, 'b') for c in PEQUENOS]

CW, CH = 341, 682


def recorte(c):
    x0, x1, y0, y1 = [int(v * K) for v in c]
    x0 += 8; y0 += 18; x1 -= 6; y1 -= 6          # fuera la rejilla y el numero de la celda
    p = A[y0:y1, x0:x1]
    r, g, b = p[..., 0], p[..., 1], p[..., 2]
    lum = (r + g + b) / 3
    sat = p.max(axis=2) - p.min(axis=2)
    morado = (b > g + 6) & (r > g)              # lineas de la rejilla
    a = np.maximum(np.clip((168 - lum) / 45, 0, 1), np.clip((sat - 22) / 22, 0, 1))
    a[morado] = 0
    # quedarse con las piezas grandes (fuera numeros y restos de rejilla)
    lab, n = ndimage.label(a > 0.35)
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = np.isin(lab, 1 + np.where(tam >= max(150, tam.max() * 0.04))[0])
        keep = ndimage.binary_dilation(keep, iterations=2)
        a = a * keep
    # quitar el gris del fondo mezclado en los bordes de las aciculas
    bg = 200.0
    aa = np.clip(a, 0.15, 1)[..., None]
    p = np.clip((p - (1 - aa) * bg) / aa, 0, 255)
    ys, xs = np.where(a > 0.1)
    return p[ys.min():ys.max() + 1, xs.min():xs.max() + 1], a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


atlas = np.zeros((2048, 2048, 4))
rng = np.random.default_rng(3)
for i, (c, tallo) in enumerate(PIEZAS):
    rgb, a = recorte(c)
    h, w = a.shape
    s = min((CW - 10) / w, (CH - 8) / h)
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    rgbI = Image.fromarray(rgb.astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    aI = Image.fromarray((a * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    rgbS = np.asarray(rgbI).astype(float)
    # luz: el atlas es verde muy oscuro (de sombra); se aclara hacia el verde amarillento de la foto
    # de la copa, con un poco de variacion entre piezas (unas mas al sol, otras mas oscuras)
    gan = rng.uniform(1.15, 1.45)
    calido = rng.uniform(0.05, 0.3)
    rgbS = rgbS * gan
    rgbS[..., 0] *= 1 + calido
    rgbS[..., 2] *= 0.6
    # los reflejos claros de las aciculas, mas apagados (si no, la copa sale palida a distancia)
    lum = rgbS.mean(axis=2, keepdims=True)
    rgbS = np.where(lum > 110, 110 + (rgbS - 110) * 0.55, rgbS)
    # bordes de las aciculas (mezclados con el gris del fondo): se oscurecen hacia el verde de dentro
    aS = np.asarray(aI).astype(float)[..., None] / 255
    rgbS = rgbS * np.clip(0.55 + 0.45 * (aS - 0.5) / 0.4, 0.55, 1.0)
    col, fil = i % 6, i // 6
    ox = col * CW + (CW - nw) // 2
    oy = fil * CH + ((CH - 4 - nh) if tallo == 'b' else 4)
    atlas[oy:oy + nh, ox:ox + nw, :3] = np.clip(rgbS, 0, 255)
    atlas[oy:oy + nh, ox:ox + nw, 3] = np.asarray(aI)

# color bajo el alpha 0: verde medio desenfocado (sin halo gris/blanco al hacer mipmaps)
img = Image.fromarray(atlas.astype(np.uint8), 'RGBA')
rgb = img.convert('RGB')
m = img.split()[3]
blur = rgb.filter(ImageFilter.GaussianBlur(10))
den = m.filter(ImageFilter.GaussianBlur(10))
bl = np.asarray(blur).astype(float) / np.maximum(np.asarray(den).astype(float)[..., None] / 255, 0.02)
fondo = np.where(np.asarray(den)[..., None] > 3, np.clip(bl * 0.55, 0, 255), [35, 45, 18])
mask = (np.asarray(m) > 40)[..., None]
final = np.where(mask, np.asarray(rgb), fondo).astype(np.uint8)
out = Image.fromarray(final).convert('RGBA')
out.putalpha(m)
out.save(OUT, optimize=True)
print('guardado', OUT, len(PIEZAS), 'piezas')
