# Genera las texturas de la Iglesia de la Granada (Moguer) a partir de las fotos del usuario.
# Cada textura es un trozo de foto enderezado con una homografía (4 esquinas -> rectángulo).
# Uso: python3 hacer_texturas.py <carpeta_fotos> <carpeta_salida>
# Las coordenadas son píxeles de la foto original (esquinas: arriba-izq, arriba-der, abajo-der, abajo-izq).
import sys
import os
import numpy as np
from PIL import Image, ImageEnhance

FOTOS = {
    "oeste_noche": "345eb02b-image.jpg",   # fachada principal (oeste) de noche
    "norte": "e9ec7ccd-image.jpg",         # lado de la plaza (norte) con la torre
    "campanas": "6aa9291f-image.jpg",      # cuerpo de campanas desde abajo
    "remate": "0c115f80-image.png",        # remate de la torre (dron)
    "puerta_sur": "1e447070-image.jpg",    # portada lateral sur
    "prensa": "fa0652fe-image.jpg",        # vista aérea noreste (cúpula)
    "aerea": "c1a9e357-image.jpg",         # vista aérea oeste (tejas)
}

# nombre: (foto, [TL, TR, BR, BL], ancho, alto, ajuste)
# ajuste: None | "dia" (quita el naranja de la luz nocturna)
S = 1 / 0.3418  # la fachada se midió sobre la foto reducida
TEXTURAS = {
    "ig_fachada_oeste": ("oeste_noche", [(444 * S, 250 * S), (1179 * S, 200 * S), (1400 * S, 990 * S), (345 * S, 1040 * S)], 1024, 940, "dia"),
    "ig_muro_norte": ("norte", [(35, 694), (845, 675), (845, 900), (35, 868)], 2048, 260, None),
    "ig_clerestorio": ("norte", [(400, 606), (815, 604), (815, 688), (400, 692)], 1024, 200, None),
    "ig_torre_cana_norte": ("norte", [(828, 474), (955, 474), (985, 918), (849, 918)], 256, 1024, None),
    "ig_torre_cana_oeste": ("oeste_noche", [(272 * S, 285 * S), (470 * S, 285 * S), (340 * S, 1040 * S), (40 * S, 1040 * S)], 256, 1024, "dia"),
    "ig_torre_campanas": ("campanas", [(200, 345), (344, 397), (356, 549), (200, 507)], 512, 512, None),
    "ig_torre_cuerpo_a": ("remate", [(628, 1562), (1266, 1562), (1266, 2199), (628, 2199)], 512, 512, None),
    "ig_torre_cuerpo_b": ("remate", [(750, 1050), (1170, 1050), (1170, 1544), (750, 1544)], 384, 448, None),
    "ig_torre_linterna": ("remate", [(853, 790), (1050, 790), (1050, 1032), (853, 1032)], 256, 320, None),
    "ig_balaustrada": ("remate", [(467, 2199), (1391, 2199), (1391, 2388), (467, 2388)], 1024, 210, None),
    "ig_portada_sur": ("puerta_sur", [(310, 110), (1090, 700), (1090, 1905), (310, 1900)], 640, 900, None),
    "ig_cupula": ("prensa", [(340, 885), (480, 885), (480, 945), (340, 945)], 512, 224, None),
    "ig_tambor": ("prensa", [(262, 958), (470, 958), (470, 1018), (262, 1018)], 512, 160, None),
    "ig_teja": ("aerea", [(1688, 705), (1748, 705), (1748, 765), (1688, 765)], 256, 256, None),
}


def homografia(dst, src):
    # Coeficientes de PIL PERSPECTIVE: llevan un punto del rectángulo de salida (dst) a la foto (src)
    A = []
    b = []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.append(u)
        b.append(v)
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def dia(im):
    # La foto de la fachada es nocturna con focos de sodio: se equilibra hacia la luz de día y
    # el cielo que queda en los bordes del hastial se pinta del color del muro
    a = np.asarray(im).astype(np.float32)
    cielo = (a[..., 2] > a[..., 0] * 1.5) & (a[..., 2] > 50)
    a[cielo] = (205, 190, 170)
    a[..., 0] *= 0.93
    a[..., 1] *= 0.97
    a[..., 2] *= 1.08
    a = np.clip(a * 1.03, 0, 255).astype(np.uint8)
    im = Image.fromarray(a)
    return ImageEnhance.Color(im).enhance(0.85)


def main(fotos, salida):
    os.makedirs(salida, exist_ok=True)
    cache = {}
    for nombre, (foto, quad, w, h, ajuste) in TEXTURAS.items():
        if foto not in cache:
            cache[foto] = Image.open(os.path.join(fotos, FOTOS[foto])).convert("RGB")
        im = cache[foto]
        coef = homografia([(0, 0), (w, 0), (w, h), (0, h)], quad)
        t = im.transform((w, h), Image.PERSPECTIVE, coef, resample=Image.BICUBIC)
        if ajuste == "dia":
            t = dia(t)
        t.save(os.path.join(salida, nombre + ".jpg"), quality=86)
        print(nombre, w, h)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
