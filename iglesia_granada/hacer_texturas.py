# Genera las texturas de la Iglesia de la Granada (Moguer) a partir de las fotos del usuario.
# Cada textura es un trozo de foto enderezado con una homografía (4 esquinas -> rectángulo).
# Uso: python3 hacer_texturas.py <carpeta_fotos> <carpeta_salida>
# Las coordenadas son píxeles de la foto original (esquinas: arriba-izq, arriba-der, abajo-der, abajo-izq).
import sys
import os
import numpy as np
from PIL import Image, ImageEnhance

FOTOS = {
    "oeste_dia": "843bbed9-image.jpg",     # fachada principal (oeste) de día, casi frontal
    "norte": "e9ec7ccd-image.jpg",         # lado de la plaza (norte) con la torre
    "campanas": "6aa9291f-image.jpg",      # cuerpo de campanas desde abajo
    "remate": "0c115f80-image.png",        # remate de la torre (dron)
    "puerta_sur": "1e447070-image.jpg",    # portada lateral sur
    "prensa": "fa0652fe-image.jpg",        # vista aérea noreste (cúpula)
    "aerea": "c1a9e357-image.jpg",         # vista aérea oeste (tejas)
}

# Los cuerpos altos de la torre, los muros laterales, el cuerpo alto y las tejas no salen de
# aquí: se dibujan a regla en dibujar_torre.py y dibujar_muros.py.
# Los recortes de FUENTES no se guardan: solo dan los detalles (balcones, reloj...) que
# dibujar_torre.py pega en la caña.
FUENTES = ["ig_torre_cana_norte", "ig_torre_oeste_dia"]

# nombre: (foto, [TL, TR, BR, BL], ancho, alto, ajuste)
# ajuste: None | "dia" (quita el naranja de la luz nocturna)
TEXTURAS = {
    "ig_torre_cana_norte": ("norte", [(828, 474), (955, 474), (985, 918), (849, 918)], 256, 1024, None),
    "ig_cupula": ("prensa", [(340, 885), (480, 885), (480, 945), (340, 945)], 512, 224, None),
    "ig_tambor": ("prensa", [(262, 958), (470, 958), (470, 1018), (262, 1018)], 512, 160, None),
}


# Texturas en metros reales ("trapecio -> rectángulo"): 4 puntos de la foto con su posición en
# el plano de la pared (X, Z en metros) definen la homografía; luego se recorta el rectángulo
# de pared [X0, X1] x [Z0, Z1] a "px_m" píxeles por metro. Así cornisas y ventanas salen a nivel.
# nombre: (foto, [4 puntos foto], [4 puntos pared], (X0, X1, Z0, Z1), px_m, ajuste)
# Fachada oeste: las juntas con la torre y con la torre inacabada (X = -11,5 y +11,5) en el
# arranque (Z = 0,6, sobre las gradas) y en lo alto del entablamento (Z = 12). La puerta cae
# en X = 0 sin forzarla: la fachada es simétrica.
PLANO_FACHADA = ([(399, 490), (390, 975), (1469, 436), (1496, 978)], [(-11.5, 12.0), (-11.5, 0.6), (11.5, 12.0), (11.5, 0.6)])
TEXTURAS_METRICAS = {
    "ig_fachada_oeste": ("oeste_dia", PLANO_FACHADA[0], PLANO_FACHADA[1], (-11.5, 18.5, 0.6, 23.0), 40, "cielo"),
    # Cara oeste de la torre: 6 m de ancho. El borde de arriba de la foto queda a unos 29,5 m
    # (la ventana de ladrillo cae a 13,8 m y el balcón a 24 m, como en la foto nocturna)
    "ig_torre_oeste_dia": ("oeste_dia", [(195, 0), (428, 0), (355, 975), (25, 975)], [(0, 29.5), (6, 29.5), (6, 0.6), (0, 0.6)], (0, 6, 0.6, 27.5), 32, None),
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


def cielo(im):
    # El cielo azul que queda junto a la silueta se pinta del color del muro encalado
    a = np.asarray(im).astype(np.float32)
    m = (a[..., 2] > a[..., 0] * 1.35) & (a[..., 2] > 90)
    a[m] = (226, 220, 208)
    return Image.fromarray(a.astype(np.uint8))


def guardar(t, nombre, salida, fuentes):
    if nombre in FUENTES:
        fuentes[nombre] = t
    else:
        t.save(os.path.join(salida, nombre + ".jpg"), quality=86)


def main(fotos, salida):
    os.makedirs(salida, exist_ok=True)
    cache = {}
    fuentes = {}
    for nombre, (foto, quad, w, h, ajuste) in TEXTURAS.items():
        if foto not in cache:
            cache[foto] = Image.open(os.path.join(fotos, FOTOS[foto])).convert("RGB")
        im = cache[foto]
        coef = homografia([(0, 0), (w, 0), (w, h), (0, h)], quad)
        t = im.transform((w, h), Image.PERSPECTIVE, coef, resample=Image.BICUBIC)
        if ajuste == "dia":
            t = dia(t)
        guardar(t, nombre, salida, fuentes)
        print(nombre, w, h)
    for nombre, (foto, p_img, p_pared, rect, px_m, ajuste) in TEXTURAS_METRICAS.items():
        if foto not in cache:
            cache[foto] = Image.open(os.path.join(fotos, FOTOS[foto])).convert("RGB")
        X0, X1, Z0, Z1 = rect
        c = homografia(p_pared, p_img)  # pared (m) -> foto (px)

        def a_foto(X, Z):
            d = c[6] * X + c[7] * Z + 1
            return ((c[0] * X + c[1] * Z + c[2]) / d, (c[3] * X + c[4] * Z + c[5]) / d)

        w = int(round((X1 - X0) * px_m))
        h = int(round((Z1 - Z0) * px_m))
        esquinas = [a_foto(X0, Z1), a_foto(X1, Z1), a_foto(X1, Z0), a_foto(X0, Z0)]
        coef = homografia([(0, 0), (w, 0), (w, h), (0, h)], esquinas)
        t = cache[foto].transform((w, h), Image.PERSPECTIVE, coef, resample=Image.BICUBIC)
        if ajuste == "cielo":
            t = cielo(t)
        guardar(t, nombre, salida, fuentes)
        print(nombre, w, h, "(%.1f x %.1f m)" % (X1 - X0, Z1 - Z0))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import dibujar_torre
    import dibujar_muros
    dibujar_torre.main(fuentes, salida)
    dibujar_muros.main(fotos, salida, homografia)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
