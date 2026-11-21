# Texturas de la pradera de la Iglesia de la Granada.
#
# Hierba, orillas, camino y lecho del riachuelo salen de los atlas de la app (catálogo de
# hierbas y de agua cristalina, láminas 5x2), recortados igual que los recorta la app y hechos
# "sin costura" fundiendo los bordes con la propia imagen desplazada media baldosa.
# Las flores se pintan encima de la MISMA hierba (T-09): así los rodales floridos y el prado
# casan sin línea, porque las dos texturas se proyectan alineadas en metros.
#
# Uso: python3 dibujar_pradera.py <carpeta_salida>   (se lanza desde la raíz del repo)
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ATLAS_HIERBAS = "public/assets/aistudio/Gemini_Generated_Image__8__fcd86848.jpeg"
ATLAS_AGUA = "public/assets/aistudio/Gemini_Generated_Image__7__6ea2e795.jpeg"
COLS = [[0.025, 0.191], [0.218, 0.384], [0.415, 0.581], [0.611, 0.777], [0.807, 0.973]]
ROWS = [[0.172, 0.464], [0.592, 0.884]]
N = 512


def celda(atlas, n):
    # n = 1..10 como T-01..T-10 (o T-21..T-30)
    im = Image.open(atlas).convert("RGB")
    c = COLS[(n - 1) % 5]
    r = ROWS[(n - 1) // 5]
    w, h = im.size
    m = 0.006  # un poco más adentro para no coger el marco
    caja = (int((c[0] + m) * w), int((r[0] + m) * h), int((c[1] - m) * w), int((r[1] - m) * h))
    return im.crop(caja).resize((N, N), Image.LANCZOS)


def sin_costura(im):
    # Funde cada borde con la imagen desplazada media baldosa: la textura se puede repetir
    a = np.asarray(im).astype(np.float32)
    b = np.roll(np.roll(a, N // 2, 0), N // 2, 1)
    t = np.linspace(-1, 1, N)
    wx = np.clip(1.6 - 1.6 * np.abs(t), 0, 1)  # 1 en el centro, 0 en los bordes
    w = np.minimum(wx[None, :], wx[:, None])[..., None]
    w = w * w * (3 - 2 * w)
    return Image.fromarray(np.clip(a * w + b * (1 - w), 0, 255).astype(np.uint8))


def flor(d, x, y, r, petalo, centro, n_pet=5, rng=None):
    for k in range(n_pet):
        ang = 2 * math.pi * k / n_pet + rng.uniform(0, 0.6)
        px = x + math.cos(ang) * r * 0.55
        py = y + math.sin(ang) * r * 0.55
        sombra = tuple(int(v * 0.72) for v in petalo)
        d.ellipse([px - r * 0.55, py - r * 0.55, px + r * 0.55, py + r * 0.55], fill=sombra)
        d.ellipse([px - r * 0.45, py - r * 0.5, px + r * 0.4, py + r * 0.35], fill=petalo)
    d.ellipse([x - r * 0.28, y - r * 0.28, x + r * 0.28, y + r * 0.28], fill=centro)


def espiga(d, x, y, largo, color, rng):
    # Lavanda vista desde arriba en ángulo: espiga de bolitas moradas
    ang = rng.uniform(0, 2 * math.pi)
    for k in range(7):
        t = k / 6.0
        px = x + math.cos(ang) * largo * t
        py = y + math.sin(ang) * largo * t
        r = 3.2 - 1.6 * t
        c = tuple(int(v * (0.8 + 0.35 * t)) for v in color)
        d.ellipse([px - r, py - r, px + r, py + r], fill=c)


def pintar(base, tipo, semilla):
    im = base.copy()
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(semilla)
    margen = 14
    def pos():
        return rng.uniform(margen, N - margen), rng.uniform(margen, N - margen)
    if tipo == "amapolas":
        for i in range(70):
            x, y = pos()
            flor(d, x, y, rng.uniform(7, 11), (205, 28, 22), (25, 18, 20), 4, rng)
        for i in range(25):
            x, y = pos()
            flor(d, x, y, rng.uniform(4, 6), (245, 245, 235), (235, 190, 40), 6, rng)
    elif tipo == "lavanda":
        for i in range(55):
            x, y = pos()
            for k in range(5):
                espiga(d, x + rng.normal(0, 6), y + rng.normal(0, 6), rng.uniform(12, 20), (120, 85, 175), rng)
    elif tipo == "botones":
        for i in range(90):
            x, y = pos()
            flor(d, x, y, rng.uniform(5, 8), (250, 205, 30), (200, 140, 20), 5, rng)
        for i in range(30):
            x, y = pos()
            flor(d, x, y, rng.uniform(4, 6), (245, 245, 235), (235, 190, 40), 8, rng)
    elif tipo == "mezcla":
        colores = [[(205, 28, 22), (25, 18, 20)], [(250, 205, 30), (200, 140, 20)], [(245, 245, 235), (235, 190, 40)],
                   [(150, 110, 210), (240, 220, 120)], [(240, 130, 170), (250, 230, 140)]]
        for i in range(110):
            x, y = pos()
            c = colores[int(rng.integers(0, len(colores)))]
            flor(d, x, y, rng.uniform(5, 9), c[0], c[1], 5, rng)
    return im


def main(salida):
    os.makedirs(salida, exist_ok=True)
    prado = sin_costura(celda(ATLAS_HIERBAS, 9))      # T-09 pradera florida con margaritas
    prado.save(os.path.join(salida, "ig_prado.jpg"), quality=88)
    for tipo, sem in [["amapolas", 1], ["lavanda", 2], ["botones", 3], ["mezcla", 4]]:
        pintar(prado, tipo, sem).save(os.path.join(salida, "ig_prado_" + tipo + ".jpg"), quality=88)
    sin_costura(celda(ATLAS_HIERBAS, 4)).save(os.path.join(salida, "ig_orilla.jpg"), quality=88)   # T-04
    sin_costura(celda(ATLAS_HIERBAS, 8)).save(os.path.join(salida, "ig_camino.jpg"), quality=88)   # T-08
    sin_costura(celda(ATLAS_AGUA, 3)).save(os.path.join(salida, "ig_lecho.jpg"), quality=88)       # T-23
    print("pradera dibujada")


if __name__ == "__main__":
    main(sys.argv[1])
