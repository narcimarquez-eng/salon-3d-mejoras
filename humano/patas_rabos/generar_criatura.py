"""Dibuja una criatura de prueba (hombre lagarto) de frente y de espalda.

Sirve para probar el modo "patas y rabos": tiene un rabo que baja entre las
piernas y sale por un lado, hilos finos que unen una pierna con la otra, el
rabo con un tobillo y una mano con el muslo, y una cara con ojos, nariz, boca
y orejas grandes para probar los rasgos en alta resolución.

    python3 generar_criatura.py <carpeta>
"""
from PIL import Image, ImageDraw
import sys, math

W, H = 1000, 1400
BG = (236, 236, 232)
SKIN = (96, 150, 92)
SKIN_D = (70, 116, 70)
BELLY = (196, 186, 120)
SCALE = (60, 100, 62)
CLOTH = (120, 72, 48)
CLOTH_D = (90, 52, 34)
THREAD = (40, 34, 30)

CX = W // 2
TOP = 90
BOT = 1330
FH = BOT - TOP


def ell(d, cx, cy, rx, ry, fill, outline=None, wid=0):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill, outline=outline, width=wid)


def limb(d, p0, p1, r0, r1, fill, steps=60):
    for i in range(steps + 1):
        t = i / steps
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        r = r0 + (r1 - r0) * t
        ell(d, x, y, r, r, fill)


def curve(d, pts, r0, r1, fill, steps=120):
    """Tubo por una curva de Bézier cuadrática a trozos (p0, c, p1, c, p2...)."""
    segs = (len(pts) - 1) // 2
    total = segs * steps
    k = 0
    for s in range(segs):
        p0, c, p1 = pts[2 * s], pts[2 * s + 1], pts[2 * s + 2]
        for i in range(steps + 1):
            t = i / steps
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
            u = (k + i) / total
            ell(d, x, y, r0 + (r1 - r0) * u, r0 + (r1 - r0) * u, fill)
        k += steps


def draw(back: bool) -> Image.Image:
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)
    s = -1 if back else 1  # la espalda se dibuja como se ve desde atrás

    head_h, head_w = 170, 132
    head_cy = TOP + head_h // 2
    neck_y = TOP + head_h
    sh_y = neck_y + 30
    hip_y = TOP + 640
    crotch_y = TOP + 660
    knee_y = TOP + 900
    ankle_y = BOT - 90

    # --- rabo: nace entre las piernas y baja hasta enroscarse en el suelo ---
    curve(d, [(CX, crotch_y - 30), (CX + 4 * s, crotch_y + 250), (CX + 6 * s, BOT - 150),
              (CX + 10 * s, BOT - 30), (CX - 22 * s, BOT - 18)], 30, 10, SKIN_D)

    # --- piernas ---
    for side in (-1, 1):
        hx = CX + side * 92
        limb(d, (hx, hip_y - 30), (CX + side * 100, knee_y), 58, 44, SKIN)
        limb(d, (CX + side * 100, knee_y), (CX + side * 104, ankle_y), 44, 32, SKIN)
        # pie con dedos
        ell(d, CX + side * 108, BOT - 34, 54, 34, SKIN_D)
        for k in (-1, 0, 1):
            ell(d, CX + side * 108 + k * 30, BOT - 12, 16, 12, SKIN_D)

    # --- taparrabos ---
    d.polygon([(CX - 150, hip_y - 70), (CX + 150, hip_y - 70), (CX + 120, hip_y + 10),
               (CX - 120, hip_y + 10)], fill=CLOTH_D if back else CLOTH)

    # --- torso ---
    torso = [(CX - 150, sh_y), (CX + 150, sh_y), (CX + 112, TOP + 470),
             (CX + 140, hip_y - 60), (CX - 140, hip_y - 60), (CX - 112, TOP + 470)]
    d.polygon(torso, fill=SKIN_D if back else SKIN)
    if not back:
        d.polygon([(CX - 70, sh_y + 40), (CX + 70, sh_y + 40), (CX + 60, hip_y - 80),
                   (CX - 60, hip_y - 80)], fill=BELLY)
        for yy in range(sh_y + 80, hip_y - 80, 46):
            d.line([(CX - 62, yy), (CX + 62, yy)], fill=(170, 160, 100), width=5)
    else:
        for yy in range(sh_y + 30, hip_y - 80, 40):
            for xx in range(CX - 100, CX + 101, 50):
                ell(d, xx, yy, 14, 10, SCALE)

    # --- brazos en pose A ---
    ang = math.radians(24)
    for side in (-1, 1):
        sx = CX + side * 130
        sy = sh_y + 26
        ex = sx + side * math.sin(ang) * 470
        ey = sy + math.cos(ang) * 470
        limb(d, (sx, sy), ((sx + ex) / 2, (sy + ey) / 2), 46, 36, SKIN)
        limb(d, ((sx + ex) / 2, (sy + ey) / 2), (ex, ey), 36, 28, SKIN)
        ell(d, ex, ey + 24, 34, 40, SKIN_D)

    # --- cuello, orejas y cabeza ---
    d.rectangle([CX - 40, neck_y - 20, CX + 40, sh_y + 14], fill=SKIN)
    for side in (-1, 1):
        ex0 = CX + side * (head_w // 2 - 10)
        d.polygon([(ex0, head_cy - 30), (ex0 + side * 92, head_cy - 70), (ex0, head_cy + 26)],
                  fill=SKIN_D)
        if not back:
            d.polygon([(ex0 + side * 8, head_cy - 22), (ex0 + side * 70, head_cy - 56),
                       (ex0 + side * 8, head_cy + 14)], fill=(170, 110, 110))
    ell(d, CX, head_cy, head_w // 2, head_h // 2, SKIN)

    if back:
        for yy in range(TOP + 30, TOP + head_h - 20, 26):
            for xx in range(CX - 40, CX + 41, 40):
                ell(d, xx, yy, 12, 9, SCALE)
    else:
        eye_y = TOP + int(head_h * 0.5)
        for side in (-1, 1):
            # ceja, blanco del ojo, iris y pupila
            d.line([(CX + side * 14, eye_y - 26), (CX + side * 52, eye_y - 32)],
                   fill=(40, 60, 40), width=8)
            ell(d, CX + side * 32, eye_y, 21, 14, (245, 240, 220))
            ell(d, CX + side * 32, eye_y, 10, 12, (210, 150, 20))
            ell(d, CX + side * 32, eye_y, 3, 10, (10, 10, 10))
        # nariz con dos orificios
        d.polygon([(CX, eye_y + 10), (CX + 16, eye_y + 50), (CX - 16, eye_y + 50)],
                  fill=SKIN_D)
        ell(d, CX - 8, eye_y + 50, 5, 3, (20, 30, 20))
        ell(d, CX + 8, eye_y + 50, 5, 3, (20, 30, 20))
        # boca con dientes
        my = TOP + int(head_h * 0.8)
        d.chord([CX - 38, my - 16, CX + 38, my + 18], 0, 180, fill=(90, 30, 30))
        for k in range(-3, 4):
            d.polygon([(CX + k * 10 - 4, my + 1), (CX + k * 10 + 4, my + 1),
                       (CX + k * 10, my + 9)], fill=(250, 250, 240))

    # --- hilos finos que unen partes (cuerdas, pelos sueltos...) ---
    d.line([(CX - 60, knee_y + 40), (CX + 60, knee_y + 60)], fill=THREAD, width=4)
    d.line([(CX + 12 * s, BOT - 120), (CX + 76 * s, BOT - 132)], fill=THREAD, width=4)
    hx = CX - 130 - math.sin(ang) * 470
    d.line([(hx + 20, sh_y + 26 + math.cos(ang) * 470 + 40), (CX - 150, knee_y - 60)],
           fill=THREAD, width=4)
    return img


out = sys.argv[1] if len(sys.argv) > 1 else '.'
draw(False).save(f'{out}/criatura_frente.png')
draw(True).save(f'{out}/criatura_espalda.png')
print('ok')
