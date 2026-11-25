# Texturas de la escena del liquidambar en la pradera:
#   escena_liquidambar/fotos/atlas_trigo.jpg (fondo magenta) -> escena_liquidambar/trigo.png
#       2048x512, 4 celdas de 512x512 con la mata apoyada abajo: 0 mata grande, 1 mata, 2 mata baja, 3 espigas
#   liquidambar/fotos/atlas_arbol_magenta.jpg -> escena_liquidambar/hojas_sueltas.png
#       512x128, 4 hojas de liquidambar para las que caen del arbol
# Recorte por color (fondo magenta) como en liquidambar/generar_texturas_liquidambar.py: los bordes toman
# el color de la parte maciza vecina y lo transparente el color medio de alrededor (sin halos al reducir).
# Uso: python3 escena_liquidambar/generar_texturas_escena.py  (desde la raiz del repo)
from PIL import Image
import numpy as np
from scipy import ndimage


def recortar(A, c, K, verde=False):
    x0, y0, x1, y1 = [int(v * K) for v in c]
    p = A[y0:y1, x0:x1].copy()
    mag = np.minimum(p[..., 0], p[..., 2]) - p[..., 1]
    a = np.clip((130 - mag) / 80, 0, 1)
    lum = p.mean(axis=2)
    rosa = np.clip((p[..., 2] - p[..., 1] - 18) / 14, 0, 1) * np.clip((lum - 115) / 25, 0, 1)
    a = a * (1 - rosa)
    if verde:
        # trigo: verde y amarillo; un pixel con rojo y azul por encima del verde es fondo mezclado
        tinte = np.clip((np.minimum(p[..., 0], p[..., 2]) - p[..., 1] + 10) / 25, 0, 1)
        a = a * (1 - tinte)
    lab, n = ndimage.label(ndimage.binary_dilation(a > 0.4, iterations=3))
    if n:
        tam = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        a = a * np.isin(lab, 1 + np.where(tam >= tam.max() * 0.05)[0])
    maciza = (a > 0.97).astype(float)
    def relleno(sig):
        num = np.dstack([ndimage.gaussian_filter(p[..., k] * maciza, sig) for k in range(3)])
        den = ndimage.gaussian_filter(maciza, sig)[..., None]
        return num, den
    n2, d2 = relleno(2.0)
    n8, d8 = relleno(10.0)
    vecino = n2 / np.maximum(d2, 1e-3)
    lejos = np.where(d8 > 1e-4, n8 / np.maximum(d8, 1e-4), p[maciza > 0].mean(axis=0))
    p = np.where(maciza[..., None] > 0, p, np.where(d2 > 0.02, vecino, lejos))
    p[..., 2] = np.minimum(p[..., 2], p[..., 1] + 35)
    if verde:
        p[..., 0] = np.minimum(p[..., 0], p[..., 1] * 1.08)
        p[..., 2] = np.minimum(p[..., 2], p[..., 1] * 0.85)
    img = Image.fromarray(np.dstack([np.clip(p, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(a > 0.4)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def montar(piezas, A, K, cw, ch, total_w, total_h, verde=False):
    atlas = Image.new('RGBA', (total_w, total_h), (0, 0, 0, 0))
    for i, c in enumerate(piezas):
        img = recortar(A, c, K, verde)
        s = min((cw - 6) / img.width, (ch - 4) / img.height)
        img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
        atlas.alpha_composite(img, (i * cw + (cw - img.width) // 2, ch - 2 - img.height))
    # color bajo lo transparente: el de la pieza, para que los mipmaps no hagan halos
    arr = np.asarray(atlas).astype(float)
    m = arr[..., 3]
    num = np.dstack([ndimage.gaussian_filter(arr[..., k] * (m > 127), 8) for k in range(3)])
    den = ndimage.gaussian_filter((m > 127).astype(float), 8)[..., None]
    fondo = np.where(den > 1e-3, num / np.maximum(den, 1e-3), arr[m > 127][:, :3].mean(axis=0))
    arr[..., :3] = np.where((m > 127)[..., None], arr[..., :3], fondo)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


im = Image.open('escena_liquidambar/fotos/atlas_trigo.jpg').convert('RGB')
A = np.asarray(im).astype(float)
K = im.size[0] / 2000.0
TRIGO = [(841, 31, 1478, 622), (851, 587, 1138, 1091), (1118, 768, 1349, 1092), (1335, 513, 1702, 1093)]
montar(TRIGO, A, K, 512, 512, 2048, 512, verde=True).save('escena_liquidambar/trigo.png', optimize=True)

im2 = Image.open('liquidambar/fotos/atlas_arbol_magenta.jpg').convert('RGB')
A2 = np.asarray(im2).astype(float)
K2 = im2.size[0] / 2000.0
HOJAS = [(1022, 770, 1168, 960), (1178, 772, 1314, 962), (1328, 768, 1482, 968), (1160, 962, 1252, 1080)]
montar(HOJAS, A2, K2, 128, 128, 512, 128).save('escena_liquidambar/hojas_sueltas.png', optimize=True)
print('texturas de la escena listas')
