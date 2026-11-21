# Texturas de la torre de la Iglesia de la Granada dibujadas "a regla".
#
# Las fotos de la torre están tomadas desde abajo y en ángulo: aunque se enderecen, cada cara
# sale con las cornisas a distinta altura y las pilastras de las esquinas cortadas, así que al
# girar la esquina nada casa. Aquí se dibuja cada cuerpo con medidas en metros (100 px/m),
# simétrico y con las cuatro caras iguales, usando los colores de las fotos. En la caña solo
# se aprovecha la foto para los detalles (balcones, reloj, azulejo de la Virgen, ventanas):
# se recortan, se igualan al color del muro y se pegan a alturas comunes en todas las caras.
#
# Uso: python3 dibujar_torre.py <carpeta_fotos> <carpeta_salida>
# (lo llama también hacer_texturas.py al final)
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

PXM = 100  # píxeles por metro

BLANCO = (236, 227, 213)
CAL = (228, 220, 206)
ROSA = (214, 150, 128)
SALMON = (196, 112, 90)
TERRACOTA = (176, 92, 72)
AZUL = (38, 74, 150)
AZUL_CLARO = (120, 150, 200)
ALMAGRA = (160, 58, 42)
ORO = (208, 143, 74)
HUECO = (38, 36, 40)
BRONCE = (78, 84, 80)
SOMBRA = (150, 140, 128)


class Lienzo:
    # Dibujo en metros: x desde la izquierda, z desde abajo
    def __init__(self, ancho_m, alto_m, fondo):
        self.w = int(round(ancho_m * PXM))
        self.h = int(round(alto_m * PXM))
        self.alto_m = alto_m
        self.im = Image.new("RGB", (self.w, self.h), fondo)
        self.d = ImageDraw.Draw(self.im)

    def px(self, x, z):
        return (x * PXM, (self.alto_m - z) * PXM)

    def rect(self, x0, z0, x1, z1, color):
        a = self.px(x0, z1)
        b = self.px(x1, z0)
        self.d.rectangle([a[0], a[1], b[0] - 1, b[1] - 1], fill=color)

    def linea_h(self, z, grosor, color):
        self.rect(0, z - grosor / 2, self.w / PXM, z + grosor / 2, color)

    def elipse(self, cx, cz, rx, rz, color, borde=None, grosor=0):
        a = self.px(cx - rx, cz + rz)
        b = self.px(cx + rx, cz - rz)
        if borde:
            self.d.ellipse([a, b], fill=color, outline=borde, width=int(grosor * PXM))
        else:
            self.d.ellipse([a, b], fill=color)

    def poligono(self, pts, color):
        self.d.polygon([self.px(p[0], p[1]) for p in pts], fill=color)

    def arco(self, x0, x1, z0, z_arranque, color):
        # Hueco de medio punto: rectángulo hasta el arranque y semicírculo encima
        r = (x1 - x0) / 2
        self.rect(x0, z0, x1, z_arranque, color)
        self.elipse((x0 + x1) / 2, z_arranque, r, r, color)

    def rombos_v(self, xc, z0, z1, ancho, color, paso=0.55):
        # Cadena vertical de rombos (las franjas de azulejo de las pilastras)
        n = int((z1 - z0) / paso)
        for i in range(n):
            zc = z0 + paso * (i + 0.5)
            self.poligono([(xc, zc + paso * 0.45), (xc + ancho / 2, zc), (xc, zc - paso * 0.45), (xc - ancho / 2, zc)], color)

    def guardar(self, ruta):
        self.im.save(ruta, quality=90)


def campana(c, xc, z_boca, alto):
    # Silueta de campana colgada dentro del hueco
    r = alto * 0.55
    c.poligono([(xc - r, z_boca), (xc + r, z_boca), (xc + r * 0.55, z_boca + alto * 0.75), (xc - r * 0.55, z_boca + alto * 0.75)], BRONCE)
    c.elipse(xc, z_boca + alto * 0.75, r * 0.55, alto * 0.25, BRONCE)
    c.rect(xc - 0.04, z_boca + alto, xc + 0.04, z_boca + alto + 0.35, HUECO)


def cuerpo_campanas(ruta):
    # Cara de 6,2 x 7,2 m (z 27,8 a 35,0 en el modelo)
    c = Lienzo(6.2, 7.2, BLANCO)
    W = 6.2
    # Cenefa de azulejos abajo: medallones azules encadenados entre filetes de almagra
    c.rect(0, 0, W, 0.12, ALMAGRA)
    c.rect(0, 1.28, W, 1.4, ALMAGRA)
    c.linea_h(0.7, 0.07, AZUL)
    n = 6
    for i in range(n):
        xc = W * (i + 0.5) / n
        c.elipse(xc, 0.7, 0.36, 0.42, AZUL)
        c.elipse(xc, 0.7, 0.2, 0.25, AZUL_CLARO)
        xm = W * i / n
        if i > 0:
            for k in range(4):
                ang = k * math.pi / 2
                c.elipse(xm + 0.14 * math.cos(ang), 0.7 + 0.14 * math.sin(ang), 0.1, 0.1, AZUL)
    # Cuerpo: pilastras de esquina con rombos, calles laterales y arco central
    z0 = 1.4
    z1 = 6.25
    for lado in [0, 1]:
        if lado == 0:
            x0 = 0.0
        else:
            x0 = W - 0.6
        c.rect(x0, z0, x0 + 0.6, z1, BLANCO)
        c.rect(x0 + 0.06, z0, x0 + 0.1, z1, ALMAGRA)
        c.rect(x0 + 0.5, z0, x0 + 0.54, z1, ALMAGRA)
        c.rombos_v(x0 + 0.3, z0 + 0.2, z1 - 0.2, 0.22, AZUL)
    for lado in [-1, 1]:
        # Calle lateral: hornacina rehundida con relieve rojo y óvalo encima
        xc = W / 2 + lado * 1.85
        c.rect(xc - 0.42, 2.0, xc + 0.42, 4.1, ALMAGRA)
        c.rect(xc - 0.34, 2.08, xc + 0.34, 4.02, CAL)
        c.rect(xc - 0.12, 2.6, xc + 0.12, 3.5, ALMAGRA)
        c.elipse(xc, 3.65, 0.13, 0.11, ALMAGRA)
        c.elipse(xc, 5.0, 0.24, 0.32, BLANCO, ALMAGRA, 0.07)
        # Pilastra junto al arco con su cadena de rombos
        xp = W / 2 + lado * 1.12
        c.rect(xp - 0.2, z0, xp + 0.2, z1, BLANCO)
        c.rect(xp - 0.2, z0, xp - 0.17, z1, ALMAGRA)
        c.rect(xp + 0.17, z0, xp + 0.2, z1, ALMAGRA)
        c.rombos_v(xp, z0 + 0.2, z1 - 0.2, 0.16, AZUL, 0.45)
    # Arco central del campanario: rosca de almagra, intradós ocre y campana
    xa0 = W / 2 - 0.85
    xa1 = W / 2 + 0.85
    c.arco(xa0 - 0.14, xa1 + 0.14, 1.6, 4.45, ALMAGRA)
    c.arco(xa0 - 0.04, xa1 + 0.04, 1.6, 4.45, ORO)
    c.arco(xa0 + 0.08, xa1 - 0.08, 1.6, 4.45, HUECO)
    campana(c, W / 2, 2.2, 1.25)
    c.rect(xa0 - 0.2, 1.4, xa1 + 0.2, 1.6, BLANCO)
    # Friso alto: filete, rectángulos azules alternos y filete de oro
    c.rect(0, 6.25, W, 6.35, ALMAGRA)
    xs = [0.3, 1.0, 1.75, 2.55, 3.65, 4.45, 5.2, 5.9]
    for i in range(len(xs)):
        ancho = 0.22
        if i % 2 == 1:
            ancho = 0.42
        c.rect(xs[i] - ancho / 2, 6.55, xs[i] + ancho / 2, 6.78, AZUL)
    c.rect(0, 6.95, W, 7.2, ORO)
    c.guardar(ruta)


def balaustrada(ruta):
    # Cara de 5,8 x 1,3 m: pedestales blancos con azulejo y balaustres de barro
    W = 5.8
    c = Lienzo(W, 1.3, (205, 196, 186))
    c.rect(0, 0, W, 0.16, SALMON)
    c.rect(0, 1.12, W, 1.3, SALMON)
    pedestales = [0.0, W / 2 - 0.25, W - 0.5]
    for p in pedestales:
        c.rect(p, 0.16, p + 0.5, 1.12, BLANCO)
        c.rect(p + 0.17, 0.35, p + 0.33, 0.92, AZUL)
    tramos = [[0.5, W / 2 - 0.25], [W / 2 + 0.25, W - 0.5]]
    for t in tramos:
        n = 8
        paso = (t[1] - t[0]) / n
        for i in range(n):
            xc = t[0] + paso * (i + 0.5)
            # Balaustre: basa, panza y cuello
            c.rect(xc - 0.09, 0.16, xc + 0.09, 0.26, TERRACOTA)
            c.elipse(xc, 0.5, 0.11, 0.24, TERRACOTA)
            c.rect(xc - 0.04, 0.6, xc + 0.04, 0.98, TERRACOTA)
            c.elipse(xc, 0.88, 0.07, 0.1, TERRACOTA)
            c.rect(xc - 0.09, 1.0, xc + 0.09, 1.12, TERRACOTA)
    c.guardar(ruta)


def cuerpo_a(ruta):
    # Primer cuerpo del remate: 4,4 x 3,2 m (z 36,8 a 40,0)
    W = 4.4
    c = Lienzo(W, 3.2, BLANCO)
    for lado in [0, 1]:
        if lado == 0:
            x0 = 0.0
        else:
            x0 = W - 0.75
        c.rect(x0, 0, x0 + 0.75, 2.9, ROSA)
        c.rect(x0 + 0.3, 0.15, x0 + 0.45, 2.75, AZUL)
        for k in range(9):
            c.rect(x0 + 0.3, 0.3 + k * 0.29, x0 + 0.45, 0.38 + k * 0.29, BLANCO)
        c.elipse(x0 + 0.375, 0.45, 0.2, 0.2, BLANCO, SALMON, 0.04)
    c.arco(1.15, 3.25, 0.25, 1.95, BLANCO)
    c.arco(1.3, 3.1, 0.25, 1.95, SALMON)
    c.arco(1.42, 2.98, 0.25, 1.95, HUECO)
    campana(c, W / 2, 0.7, 0.95)
    c.rect(0.95, 0, 1.15, 2.6, CAL)
    c.rect(3.25, 0, 3.45, 2.6, CAL)
    c.rect(0, 2.9, W, 3.0, SALMON)
    for i in range(6):
        xc = 0.45 + i * 0.7
        c.rect(xc - 0.12, 3.03, xc + 0.12, 3.15, AZUL)
    c.rect(0, 0, W, 0.12, SALMON)
    c.guardar(ruta)


def cuerpo_b(ruta):
    # Segundo cuerpo del remate: 3,0 x 3,1 m (z 40,3 a 43,4)
    W = 3.0
    c = Lienzo(W, 3.1, BLANCO)
    for lado in [0, 1]:
        if lado == 0:
            x0 = 0.0
        else:
            x0 = W - 0.5
        c.rect(x0, 0, x0 + 0.5, 2.55, ROSA)
        for k in range(10):
            col = AZUL
            if k % 2 == 1:
                col = BLANCO
            c.rect(x0 + 0.17, 0.2 + k * 0.22, x0 + 0.33, 0.42 + k * 0.22, col)
    c.rect(0.5, 1.6, 2.5, 2.25, AZUL)
    c.arco(0.85, 2.15, 0.1, 1.75, BLANCO)
    c.arco(0.98, 2.02, 0.1, 1.75, HUECO)
    c.rect(1.47, 0.1, 1.53, 2.0, BRONCE)
    c.rect(0, 2.55, W, 2.65, SALMON)
    for i in range(8):
        xc = 0.2 + i * 0.37
        col = AZUL
        if i % 2 == 1:
            col = BLANCO
        c.rect(xc - 0.13, 2.72, xc + 0.13, 2.95, col)
    c.rect(0, 2.98, W, 3.1, SALMON)
    c.guardar(ruta)


def linterna(ruta):
    # Dos caras de la linterna ochavada (0,8 x 1,6 m cada una); el prisma la repite alrededor
    c = Lienzo(1.6, 1.6, BLANCO)
    for i in range(2):
        x0 = i * 0.8
        c.rect(x0, 0, x0 + 0.1, 1.6, ROSA)
        c.rect(x0 + 0.7, 0, x0 + 0.8, 1.6, ROSA)
        c.arco(x0 + 0.25, x0 + 0.55, 0.3, 1.05, HUECO)
        c.rect(x0, 1.32, x0 + 0.8, 1.42, AZUL)
    c.guardar(ruta)


# ---------- Caña de la torre: muro limpio + detalles recortados de las fotos ----------

def pegar_detalle(muro, foto, caja_foto, x_m, z_m, alto_m, alto_muro_m):
    # Recorta caja_foto (x0, y0, x1, y1) de la foto, la escala a alto_m metros, iguala su borde
    # al color del muro y la pega centrada en x_m con su base en z_m. El borde se funde.
    d = foto.crop(caja_foto)
    esc = alto_m * PXM / d.height
    d = d.resize((max(1, int(d.width * esc)), max(1, int(d.height * esc))), Image.LANCZOS)
    a = np.asarray(d).astype(np.float32)
    borde = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    a = a * (np.array(CAL, np.float32) / np.maximum(np.median(borde, axis=0), 1))
    d = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    mascara = Image.new("L", d.size, 0)
    m = max(2, int(min(d.size) * 0.08))
    ImageDraw.Draw(mascara).rectangle([m, m, d.width - m, d.height - m], fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(m * 0.6))
    x = int(x_m * PXM - d.width / 2)
    y = int((alto_muro_m - z_m) * PXM - d.height)
    muro.paste(d, (x, y), mascara)


def muro_cana():
    # 6 x 27,5 m de encalado con el zócalo y su filete de almagra (a 2,2 m, como en las fotos)
    c = Lienzo(6.0, 27.5, CAL)
    ruido = (np.random.default_rng(3).normal(0, 2.5, (c.h, c.w, 1))).astype(np.float32)
    a = np.asarray(c.im).astype(np.float32) + ruido
    c.im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    c.d = ImageDraw.Draw(c.im)
    c.rect(0, 0, 6.0, 0.6, (200, 196, 188))
    c.rect(0, 2.15, 6.0, 2.25, ALMAGRA)
    return c


def canas(fotos_rect, salida):
    # fotos_rect: recortes ya enderezados de la caña (oeste: 32 px/m de z 0,6 a 27,5; norte:
    # foto de la plaza de 0 a 27,5 m). Las alturas comunes a todas las caras:
    Z_BALCON = 22.6   # balcón alto con frontón (todas las caras)
    oeste = fotos_rect["ig_torre_oeste_dia"].resize((192, 861))
    norte = fotos_rect["ig_torre_cana_norte"].resize((192, 861))
    balcon = (60, 34, 146, 222)
    # Oeste: balcón alto y ventana recercada de ladrillo
    c = muro_cana()
    pegar_detalle(c.im, oeste, balcon, 3.0, Z_BALCON, 4.6, 27.5)
    pegar_detalle(c.im, oeste, (68, 472, 136, 566), 3.0, 10.0, 2.5, 27.5)
    c.guardar(os.path.join(salida, "ig_torre_cara_oeste.jpg"))
    # Norte (plaza): balcón alto, reloj, balcón con guardapolvo, Virgen y ventanita
    c = muro_cana()
    pegar_detalle(c.im, oeste, balcon, 3.0, Z_BALCON, 4.6, 27.5)
    pegar_detalle(c.im, norte, (68, 172, 124, 232), 3.0, 20.4, 1.6, 27.5)
    pegar_detalle(c.im, norte, (52, 248, 150, 428), 3.0, 13.9, 5.6, 27.5)
    pegar_detalle(c.im, norte, (70, 528, 134, 642), 3.0, 7.0, 3.5, 27.5)
    pegar_detalle(c.im, norte, (74, 698, 132, 776), 3.0, 2.8, 2.4, 27.5)
    c.guardar(os.path.join(salida, "ig_torre_cara_norte.jpg"))
    # Sur y este (por encima de los tejados): solo el balcón alto
    c = muro_cana()
    pegar_detalle(c.im, oeste, balcon, 3.0, Z_BALCON, 4.6, 27.5)
    c.guardar(os.path.join(salida, "ig_torre_cara_lado.jpg"))


def main(fotos_rect, salida):
    cuerpo_campanas(os.path.join(salida, "ig_torre_campanas.jpg"))
    balaustrada(os.path.join(salida, "ig_balaustrada.jpg"))
    cuerpo_a(os.path.join(salida, "ig_torre_cuerpo_a.jpg"))
    cuerpo_b(os.path.join(salida, "ig_torre_cuerpo_b.jpg"))
    linterna(os.path.join(salida, "ig_torre_linterna.jpg"))
    canas(fotos_rect, salida)
    print("torre dibujada")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import hacer_texturas
    hacer_texturas.main(sys.argv[1], sys.argv[2])
