"""Dibuja un guerrero de prueba en pose A, de frente y de espalda."""
from PIL import Image, ImageDraw
import sys, math

W, H = 700, 1000
BG = (12, 18, 32)
SKIN = (223, 180, 139)
SKIN_D = (188, 146, 108)
HAIR = (58, 40, 28)
ARMOR = (156, 62, 58)
ARMOR_D = (112, 42, 40)
METAL = (168, 172, 182)
METAL_D = (120, 124, 134)
CLOTH = (62, 74, 110)
CLOTH_D = (46, 55, 84)
LEATHER = (92, 68, 46)
BOOT = (64, 46, 32)

CX = W // 2
TOP = 70          # coronilla
BOT = 940         # suela
FH = BOT - TOP    # 870

def ell(d, cx, cy, rx, ry, fill, outline=None, wid=0):
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill, outline=outline, width=wid)

def limb(d, p0, p1, r0, r1, fill, steps=40):
    """Tubo que va de p0 a p1 con radio variable."""
    for i in range(steps + 1):
        t = i / steps
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        r = r0 + (r1 - r0) * t
        ell(d, x, y, r, r, fill)

def draw(back: bool) -> Image.Image:
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)

    head_h = 116
    head_w = 82
    head_cy = TOP + head_h // 2
    neck_y = TOP + head_h
    sh_y = neck_y + 26          # hombros
    armpit_y = sh_y + 118
    waist_y = TOP + 430
    hip_y = TOP + 500
    crotch_y = TOP + 468        # 53.8% de la altura
    knee_y = TOP + 660
    ankle_y = BOT - 74

    sh_half = 118               # medio ancho de hombros
    waist_half = 76
    hip_half = 88

    # --- piernas (de atrás hacia delante) ---
    for side in (-1, 1):
        hx = CX + side * 44
        limb(d, (hx, hip_y - 20), (CX + side * 40, knee_y), 42, 34, CLOTH)
        limb(d, (CX + side * 40, knee_y), (CX + side * 38, ankle_y), 34, 27, CLOTH_D if back else CLOTH)
        # bota
        limb(d, (CX + side * 38, ankle_y - 16), (CX + side * 38, BOT - 16), 30, 28, BOOT)
        toe = 0 if back else 26
        d.rounded_rectangle(
            [CX + side * 38 - 30, BOT - 30, CX + side * 38 + 30 + (toe if side > 0 else 0),
             BOT],
            radius=9, fill=BOOT)
        if side < 0:
            d.rounded_rectangle([CX + side * 38 - 30 - toe, BOT - 30, CX + side * 38 + 30, BOT],
                                radius=9, fill=BOOT)

    # --- torso ---
    torso = [
        (CX - sh_half + 12, sh_y),
        (CX + sh_half - 12, sh_y),
        (CX + waist_half, waist_y),
        (CX + hip_half, hip_y + 10),
        (CX - hip_half, hip_y + 10),
        (CX - waist_half, waist_y),
    ]
    d.polygon(torso, fill=ARMOR_D if back else ARMOR)

    # --- brazos en pose A (unos 28 grados) ---
    ang = math.radians(28)
    for side in (-1, 1):
        sx = CX + side * (sh_half - 18)
        sy = sh_y + 14
        ex = sx + side * math.sin(ang) * 330
        ey = sy + math.cos(ang) * 330
        limb(d, (sx, sy), ((sx + ex) / 2, (sy + ey) / 2), 36, 28, SKIN_D if back else SKIN)
        limb(d, ((sx + ex) / 2, (sy + ey) / 2), (ex, ey), 28, 22, SKIN_D if back else SKIN)
        # brazal de cuero
        limb(d, (sx + side * 46, sy + 150), (sx + side * 60, sy + 196), 26, 25, LEATHER)
        # mano
        ell(d, ex, ey + 16, 24, 28, SKIN_D if back else SKIN)
        # hombrera metálica
        ell(d, sx + side * 6, sy - 4, 46, 34, METAL_D if back else METAL)

    # --- cuello y cabeza ---
    d.rectangle([CX - 26, neck_y - 14, CX + 26, sh_y + 10], fill=SKIN_D if back else SKIN)
    ell(d, CX, head_cy, head_w // 2, head_h // 2, SKIN_D if back else SKIN)

    if back:
        # nuca: pelo cubriendo casi toda la cabeza
        ell(d, CX, head_cy - 4, head_w // 2 + 2, head_h // 2 - 6, HAIR)
        d.rectangle([CX - head_w // 2, head_cy, CX + head_w // 2, head_cy + 46], fill=HAIR)
        # correas cruzadas en la espalda
        d.line([(CX - 70, sh_y + 20), (CX + 64, hip_y - 20)], fill=LEATHER, width=22)
        d.line([(CX + 70, sh_y + 20), (CX - 64, hip_y - 20)], fill=LEATHER, width=22)
    else:
        # pelo por arriba
        d.pieslice([CX - head_w // 2 - 2, head_cy - head_h // 2 - 2,
                    CX + head_w // 2 + 2, head_cy + 14],
                   180, 360, fill=HAIR)
        # ojos al 56% de la altura de la cabeza
        eye_y = TOP + int(head_h * 0.56)
        for side in (-1, 1):
            ell(d, CX + side * 19, eye_y, 9, 7, (38, 30, 26))
        # boca
        d.line([(CX - 15, TOP + int(head_h * 0.82)), (CX + 15, TOP + int(head_h * 0.82))],
               fill=(150, 92, 84), width=5)
        # peto: placas
        d.line([(CX, sh_y + 30), (CX, hip_y)], fill=ARMOR_D, width=6)
        for yy in (sh_y + 70, sh_y + 120, sh_y + 170):
            d.line([(CX - 72, yy), (CX + 72, yy)], fill=ARMOR_D, width=6)
        # cinturón
        d.rectangle([CX - hip_half - 2, waist_y + 26, CX + hip_half + 2, waist_y + 62],
                    fill=LEATHER)
        ell(d, CX, waist_y + 44, 20, 18, METAL)

    return img

out = sys.argv[1]
draw(False).save(f'{out}/frente.png')
draw(True).save(f'{out}/espalda.png')
print('ok')
