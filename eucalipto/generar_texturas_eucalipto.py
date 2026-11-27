# Texturas del eucalipto a partir del atlas del usuario (eucalipto/fotos/atlas_eucalipto.jpg):
#   public/eucalipto/hojas.png   2048x2048, 4x4 celdas de 512:
#       0-1 ramilletes colgantes (tallo arriba), 2-4 ramas de hojas (tallo abajo),
#       5 hojas redondas plateadas, 6 ramita pequena, 7 ramita plateada, 8-9 frutos (cuelgan),
#       10-11 tiras de corteza que cuelgan, 12-13 ramitas peladas
#   public/eucalipto/corteza.jpg  corteza lisa que se desprende en tiras (gris, ocre y rosada), repetible
#   public/eucalipto/corteza_base.jpg  corteza rugosa de la base del tronco, repetible
# Fondo de cuadros gris neutro (saturacion 0): alpha por color y luminancia; los recortes van por dentro
# de las lineas de la rejilla. Uso: python3 eucalipto/generar_texturas_eucalipto.py  (desde la raiz)
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

im = Image.open('eucalipto/fotos/atlas_eucalipto.jpg').convert('RGB')
K = im.size[0] / 2000.0
A = np.asarray(im).astype(float)

# (x0, y0, x1, y1) en coordenadas de 2000 px, por dentro de la rejilla; True = cuelga (tallo arriba)
PIEZAS = [
    ((1340, 102, 1726, 553), True),    # 0 ramillete colgante ancho
    ((1740, 102, 1994, 553), True),    # 1 ramillete colgante estrecho
    ((740, 568, 1160, 897), False),    # 2 rama de hojas grande
    ((1508, 568, 1792, 897), False),   # 3 rama de hojas
    ((1806, 568, 1994, 897), False),   # 4 rama fina
    ((1174, 568, 1494, 897), False),   # 5 hojas redondas plateadas (juveniles)
    ((1206, 910, 1394, 1108), False),  # 6 ramita pequena
    ((1406, 910, 1594, 1108), False),  # 7 ramita plateada
    ((1606, 910, 1794, 1108), True),   # 8 frutos
    ((1806, 910, 1994, 1108), True),   # 9 rama con frutos
    ((36, 910, 196, 1108), True),      # 10 tiras de corteza que se desprenden (cuelgan)
    ((206, 910, 396, 1108), True),     # 11 tira de corteza retorcida (cuelga)
    ((406, 910, 596, 1108), False),    # 12 ramita pelada en Y
    ((606, 910, 796, 1108), False),    # 13 ramita pelada curva
]


def pieza(c):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    p = A[y0:y1, x0:x1].copy()
    lum = p.mean(axis=2)
    sat = p.max(axis=2) - p.min(axis=2)
    a = np.maximum(np.clip((178 - lum) / 30, 0, 1), np.clip((sat - 9) / 12, 0, 1)) * np.clip((222 - lum) / 18, 0, 1)
    # las lineas de la rejilla (gris oscuro sin color) y las sombras de los cuadros no son hoja
    lab, n = ndimage.label(ndimage.binary_dilation(a > 0.4, iterations=3))
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        a = a * np.isin(lab, 1 + np.where(tam >= tam.max() * 0.06)[0])
    maciza = (a > 0.97).astype(float)
    def rell(sig):
        num = np.dstack([ndimage.gaussian_filter(p[..., k] * maciza, sig) for k in range(3)])
        return num, ndimage.gaussian_filter(maciza, sig)[..., None]
    n2, d2 = rell(2.0)
    n8, d8 = rell(10.0)
    vecino = n2 / np.maximum(d2, 1e-3)
    lejos = np.where(d8 > 1e-4, n8 / np.maximum(d8, 1e-4), p[maciza > 0].mean(axis=0))
    p = np.where(maciza[..., None] > 0, p, np.where(d2 > 0.02, vecino, lejos))
    img = Image.fromarray(np.dstack([np.clip(p, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(a > 0.4)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


C = 512
atlas = Image.new('RGBA', (2048, 2048), (0, 0, 0, 0))
for i, (c, cuelga) in enumerate(PIEZAS):
    img = pieza(c)
    s = min((C - 8) / img.width, (C - 6) / img.height)
    img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    x, y = (i % 4) * C, (i // 4) * C
    oy = y + 3 if cuelga else y + C - 3 - img.height
    atlas.alpha_composite(img, (x + (C - img.width) // 2, oy))
arr = np.asarray(atlas).astype(float)
m = arr[..., 3]
num = np.dstack([ndimage.gaussian_filter(arr[..., k] * (m > 127), 8) for k in range(3)])
den = ndimage.gaussian_filter((m > 127).astype(float), 8)[..., None]
fondo = np.where(den > 1e-3, num / np.maximum(den, 1e-3), [70, 95, 85])
arr[..., :3] = np.where((m > 127)[..., None], arr[..., :3], fondo)
Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA').save('public/eucalipto/hojas.png', optimize=True)


def repetible(c, w, h, nh=40, nv=50):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    f = np.asarray(im.crop((x0, y0, x1, y1)).resize((w, h), Image.LANCZOS)).astype(float)
    col = np.convolve(np.pad(f.mean(axis=(0, 2)), 30, mode='edge'), np.ones(61) / 61, mode='same')[30:-30]
    f = f * (col.mean() / col)[None, :, None]
    wv = np.linspace(0, 1, nv)[:, None, None]
    f[-nv:] = f[-nv:] * (1 - wv) + f[:nv] * wv
    f = f[:-nv]
    wh = np.linspace(0, 1, nh)[None, :, None]
    f[:, -nh:] = f[:, -nh:] * (1 - wh) + f[:, :nh] * wh
    return f[:, :-nh]


# corteza lisa: panel de tiras de arriba + panel de la segunda fila, uno al lado del otro
t1 = repetible((506, 104, 896, 540), 400, 620, nh=2, nv=2)
t2 = repetible((36, 568, 360, 897), 330, 620, nh=2, nv=2)
t2 = t2 * (t1.mean(axis=(0, 1)) / t2.mean(axis=(0, 1)))
n = 36
w = np.linspace(0, 1, n)[None, :, None]
f = np.concatenate([t1[:, :-n], t1[:, -n:] * (1 - w) + t2[:, :n] * w, t2[:, n:]], axis=1)
f[:, -n:] = f[:, -n:] * (1 - w) + f[:, :n] * w
f = f[:, :-n]
# las tiras de corteza terminan de golpe al repetirse: se mezcla con la misma textura desplazada media
# altura, con un peso que se hace 0 en el borde (alli manda la copia desplazada, que no tiene corte)
H = f.shape[0]
y = np.arange(H)[:, None, None]
w = np.sin(np.pi * y / H) ** 2
w = np.clip((w - 0.08) / 0.84, 0, 1)
f = f * w + np.roll(f, H // 2, axis=0) * (1 - w)
Image.fromarray(np.clip(f, 0, 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save('public/eucalipto/corteza.jpg', quality=88)
fb = repetible((36, 104, 492, 540), 512, 560)
Image.fromarray(np.clip(fb, 0, 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS).save('public/eucalipto/corteza_base.jpg', quality=88)
print('texturas del eucalipto listas')
