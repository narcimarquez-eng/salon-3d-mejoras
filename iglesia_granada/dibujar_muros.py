# Muros laterales, cuerpo alto (clerestorio) y tejas de la Iglesia de la Granada, dibujados
# "a regla" en metros: pilastras verticales, friso de canecillos, impostas y ventanas
# recercadas a nivel. La foto de la plaza está tomada en diagonal y, aunque se enderece, las
# líneas largas salían torcidas; de ella solo se aprovecha la portada norte, que se pega.
# Lo llama hacer_texturas.py al final.
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from dibujar_torre import Lienzo, BLANCO, CAL, ALMAGRA, HUECO, ORO, SOMBRA, pegar_detalle

PXM_MURO = 40  # px por metro en los muros largos (50 m de muro)
LADRILLO = (178, 88, 58)
ZOCALO = (196, 190, 180)


class LienzoMuro(Lienzo):
    def __init__(self, ancho_m, alto_m, fondo, pxm):
        import dibujar_torre
        viejo = dibujar_torre.PXM
        dibujar_torre.PXM = pxm
        Lienzo.__init__(self, ancho_m, alto_m, fondo)
        dibujar_torre.PXM = viejo
        self.pxm = pxm

    def px(self, x, z):
        return (x * self.pxm, (self.alto_m - z) * self.pxm)

    def rect(self, x0, z0, x1, z1, color):
        a = self.px(x0, z1)
        b = self.px(x1, z0)
        self.d.rectangle([int(round(a[0])), int(round(a[1])), int(round(b[0])) - 1, int(round(b[1])) - 1], fill=color)

    def elipse(self, cx, cz, rx, rz, color, borde=None, grosor=0):
        a = self.px(cx - rx, cz + rz)
        b = self.px(cx + rx, cz - rz)
        if borde:
            self.d.ellipse([a, b], fill=color, outline=borde, width=max(1, int(grosor * self.pxm)))
        else:
            self.d.ellipse([a, b], fill=color)


def ventana(c, xc, z0, ancho, alto):
    # Ventana recercada de ladrillo con orejetas (como las del muro de la plaza)
    c.rect(xc - ancho / 2 - 0.3, z0 - 0.25, xc + ancho / 2 + 0.3, z0 + alto + 0.25, LADRILLO)
    c.rect(xc - ancho / 2 - 0.45, z0 + alto - 0.1, xc + ancho / 2 + 0.45, z0 + alto + 0.25, LADRILLO)
    c.rect(xc - ancho / 2 - 0.1, z0 - 0.05, xc + ancho / 2 + 0.1, z0 + alto + 0.05, BLANCO)
    c.rect(xc - ancho / 2, z0, xc + ancho / 2, z0 + alto, HUECO)
    for k in range(1, 3):
        c.rect(xc - ancho / 2, z0 + alto * k / 3, xc + ancho / 2, z0 + alto * k / 3 + 0.05, (90, 90, 95))


def pilastra(c, xc, z0, z1, ancho=0.9):
    # Pilastra encalada: dos líneas de sombra verticales, basa y capitel de almagra
    c.rect(xc - ancho / 2, z0, xc + ancho / 2, z1, BLANCO)
    c.rect(xc - ancho / 2, z0, xc - ancho / 2 + 0.06, z1, SOMBRA)
    c.rect(xc + ancho / 2 - 0.04, z0, xc + ancho / 2, z1, (200, 192, 180))
    c.rect(xc - ancho / 2 - 0.1, z1 - 0.4, xc + ancho / 2 + 0.1, z1, ALMAGRA)
    c.rect(xc - ancho / 2 - 0.08, z0, xc + ancho / 2 + 0.08, z0 + 0.5, (210, 204, 194))


def friso(c, ancho, z0):
    # Entablamento: filete, canecillos blancos sobre almagra y cornisa (a 12 m, como la fachada)
    c.rect(0, z0, ancho, z0 + 0.15, ALMAGRA)
    c.rect(0, z0 + 0.15, ancho, z0 + 0.75, LADRILLO)
    n = int(ancho / 0.55)
    for i in range(n):
        x = (i + 0.5) * ancho / n
        c.rect(x - 0.11, z0 + 0.22, x + 0.11, z0 + 0.7, BLANCO)
    c.rect(0, z0 + 0.75, ancho, z0 + 0.95, ALMAGRA)
    c.rect(0, z0 + 0.95, ancho, z0 + 1.05, ORO)


def muro_lateral(ruta, largo, portada=None):
    # Muro de las naves laterales: 13,6 m (zócalo, paño con ventanas, friso a 11 m y pretil).
    # x = 0 es el extremo este; portada = (x_centro, imagen) para la portada de la plaza.
    c = LienzoMuro(largo, 13.6, CAL, PXM_MURO)
    ruido = np.random.default_rng(5).normal(0, 2.0, (c.h, c.w, 1)).astype(np.float32)
    c.im = Image.fromarray(np.clip(np.asarray(c.im).astype(np.float32) + ruido, 0, 255).astype(np.uint8))
    c.d = ImageDraw.Draw(c.im)
    c.rect(0, 0, largo, 0.7, ZOCALO)
    c.rect(0, 0.7, largo, 0.78, (175, 168, 158))
    friso(c, largo, 10.95)
    c.rect(0, 13.45, largo, 13.6, (205, 198, 188))
    # Pilastras cada 6,3 m, sin tocar la portada
    paso = 6.3
    n = int(largo / paso)
    for i in range(n + 1):
        x = 0.6 + i * paso
        if x > largo - 0.4:
            continue
        if portada and abs(x - portada[0]) < 4.0:
            continue
        pilastra(c, x, 0.0, 10.95)
    # Ventanas recercadas en el centro de cada paño, todas a la misma altura
    for i in range(n):
        x = 0.6 + (i + 0.5) * paso
        if x > largo - 1.5:
            continue
        if portada and abs(x - portada[0]) < 5.0:
            continue
        ventana(c, x, 7.6, 1.0, 1.4)
    if portada and portada[1] is not None:
        pegar_detalle_m(c, portada[1], portada[0], 0.0, 13.6)
    c.im.save(ruta, quality=88)


def pegar_detalle_m(c, img, x_m, z_m, alto_m):
    # Pega una imagen (ya recortada) con base en z_m, centrada en x_m, igualando su borde al muro
    esc = alto_m * c.pxm / img.height
    d = img.resize((max(1, int(img.width * esc)), max(1, int(img.height * esc))), Image.LANCZOS)
    a = np.asarray(d).astype(np.float32)
    borde = np.concatenate([a[0], a[:, 0], a[:, -1]])
    a = a * (np.array(CAL, np.float32) / np.maximum(np.median(borde, axis=0), 1))
    d = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    mascara = Image.new("L", d.size, 0)
    m = max(2, int(min(d.size) * 0.04))
    ImageDraw.Draw(mascara).rectangle([m, m, d.width - m, d.height], fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(m * 0.6))
    x = int(x_m * c.pxm - d.width / 2)
    y = int((c.alto_m - z_m) * c.pxm - d.height)
    c.im.paste(d, (x, y), mascara)


def clerestorio(ruta):
    # Cuerpo alto: 30 m x 7 m en 5 paños de 6 m (se repite sin costura): pilastras, ventana
    # recercada en cada paño, dos impostas de almagra y la fila de mechinales bajo la cornisa
    c = LienzoMuro(30.0, 7.0, CAL, PXM_MURO)
    c.rect(0, 0, 30.0, 0.5, (205, 198, 188))
    c.rect(0, 4.6, 30.0, 4.72, ALMAGRA)
    c.rect(0, 5.0, 30.0, 5.12, ALMAGRA)
    c.rect(0, 6.55, 30.0, 6.7, ALMAGRA)
    for i in range(5):
        x0 = i * 6.0
        pilastra(c, x0 + 0.45, 0.5, 4.6, 0.7)
        pilastra(c, x0 + 5.55, 0.5, 4.6, 0.7)
        ventana(c, x0 + 3.0, 2.0, 0.9, 1.2)
        for k in range(4):
            c.elipse(x0 + 0.75 + k * 1.5, 5.8, 0.09, 0.09, HUECO)
    c.im.save(ruta, quality=88)


def tejas(ruta):
    # Teja árabe dibujada (sin costuras): 4,2 m = 12 hiladas de 0,35 m y 19 canales de 0,221 m.
    # Colores sacados de las cubiertas de las fotos (pardo, ocre y algo de liquen anaranjado).
    pxm = 100
    W = int(4.2 * pxm)
    H = int(4.2 * pxm)
    rng = np.random.default_rng(7)
    im = Image.new("RGB", (W, H), (70, 52, 40))
    d = ImageDraw.Draw(im)
    filas = 12
    cols = 19
    fh = H / filas
    cw = W / cols
    for f in range(filas):
        for k in range(cols):
            tonos = [[128, 94, 68], [140, 104, 74], [116, 86, 64], [158, 112, 66]]  # el último, liquen
            base = np.array(tonos[int(rng.integers(0, 4))], float) * rng.uniform(0.85, 1.12)
            x0 = k * cw
            y0 = f * fh
            # Canal (oscuro) y cobija (clara, abombada)
            d.rectangle([x0, y0, x0 + cw, y0 + fh], fill=tuple(int(v) for v in base * 0.55))
            col = tuple(int(min(255, v)) for v in base)
            d.ellipse([x0 + cw * 0.12, y0 - fh * 0.05, x0 + cw * 0.88, y0 + fh * 1.05], fill=col)
            d.line([x0 + cw * 0.5, y0 + fh * 0.1, x0 + cw * 0.5, y0 + fh * 0.9], fill=tuple(int(min(255, v * 1.15)) for v in base), width=2)
            d.line([x0, y0 + fh - 1, x0 + cw, y0 + fh - 1], fill=(45, 34, 28), width=2)
    im.save(ruta, quality=88)


def main(fotos, salida, homografia):
    # Portada norte: foto de frente del usuario, enderezada en metros. Escala sacada de la
    # propia foto: base de la portada en y = 2350 y friso en y = 1600, que en el modelo está a
    # 10,95 m (1,46 cm/px). Salen 8,8 m de ancho, puerta de 4,4 x 5,8 m y copete a ~14 m.
    foto = Image.open(os.path.join(fotos, "36d32d30-image.jpg")).convert("RGB")
    m_px = 10.95 / (2350 - 1600)
    z_cornisa = (2350 - 1850) * m_px
    pared = [(-4.4, 0.0), (4.4, 0.0), (-4.4, z_cornisa), (4.4, z_cornisa)]
    fotop = [(300, 2350), (905, 2350), (345, 1850), (935, 1850)]
    c = homografia(pared, fotop)  # pared (m) -> foto (px)

    def a_foto(X, Z):
        d = c[6] * X + c[7] * Z + 1
        return ((c[0] * X + c[1] * Z + c[2]) / d, (c[3] * X + c[4] * Z + c[5]) / d)

    X0, X1, Z1 = -5.2, 5.2, 13.6
    w = int((X1 - X0) * PXM_MURO)
    h = int(Z1 * PXM_MURO)
    esq = [a_foto(X0, Z1), a_foto(X1, Z1), a_foto(X1, 0.0), a_foto(X0, 0.0)]
    coef = homografia([(0, 0), (w, 0), (w, h), (0, h)], esq)
    portada = foto.transform((w, h), Image.PERSPECTIVE, coef, resample=Image.BICUBIC)
    largo = 54.7 - 4.5
    # El muro norte se ve desde la plaza: x = 0 es el este; la portada está a 22,2 m de la fachada
    muro_lateral(os.path.join(salida, "ig_muro_norte.jpg"), largo, (54.7 - 22.2, portada))
    # El muro sur lleva encima su propia portada (otra pieza): aquí sin portada ni ventanas en ese tramo
    muro_lateral(os.path.join(salida, "ig_muro_sur.jpg"), largo, (54.7 - 22.2, None))
    clerestorio(os.path.join(salida, "ig_clerestorio.jpg"))
    tejas(os.path.join(salida, "ig_teja.jpg"))
    print("muros dibujados")
