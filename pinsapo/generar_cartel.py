# Dibuja el cartel "Feliz Natal" (public/pinsapo/cartel_feliz_natal.png, 1024x384):
# tablas de madera, letras rojas con borde blanco, nieve arriba, acebo y estrellas.
# Uso: python3 pinsapo/generar_cartel.py
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np
import math, random

W, H = 1024, 384
random.seed(3)
rng = np.random.default_rng(3)

# --- tablas de madera: vetas con ruido estirado en horizontal ---
img = np.zeros((H, W, 3))
tablas = 3
for t in range(tablas):
    y0, y1 = t * H // tablas, (t + 1) * H // tablas
    base = np.array([118, 74, 42]) * rng.uniform(0.85, 1.1)
    ruido = rng.normal(0, 1, (y1 - y0, W // 16))
    ruido = np.asarray(Image.fromarray(((ruido - ruido.min()) / np.ptp(ruido) * 255).astype(np.uint8)).resize((W, y1 - y0), Image.BICUBIC)).astype(float) / 255
    veta = 0.75 + 0.35 * ruido + 0.06 * np.sin(np.linspace(0, 40, W))[None, :] * rng.uniform(0.5, 1)
    img[y0:y1] = base[None, None, :] * veta[..., None]
    img[y0:y0 + 3] *= 0.45            # junta entre tablas
    img[y1 - 3:y1] *= 0.6
im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')
d = ImageDraw.Draw(im)
# clavos
for t in range(tablas):
    yc = t * H // tablas + H // tablas // 2
    for xc in (26, W - 26):
        d.ellipse((xc - 7, yc - 7, xc + 7, yc + 7), fill=(60, 60, 62), outline=(30, 30, 30))
        d.ellipse((xc - 3, yc - 4, xc + 1, yc), fill=(140, 140, 145))
# marco
d.rectangle((6, 6, W - 7, H - 7), outline=(70, 40, 20), width=8)

# --- texto ---
fuente = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 150)
texto = 'Feliz Natal'
bb = d.textbbox((0, 0), texto, font=fuente)
tx = (W - (bb[2] - bb[0])) // 2 - bb[0]
ty = (H - (bb[3] - bb[1])) // 2 - bb[1] + 18
sombra = Image.new('RGBA', (W, H), (0, 0, 0, 0))
ImageDraw.Draw(sombra).text((tx + 8, ty + 10), texto, font=fuente, fill=(20, 8, 4, 190))
im.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(5)))
d = ImageDraw.Draw(im)
d.text((tx, ty), texto, font=fuente, fill=(196, 18, 28), stroke_width=9, stroke_fill=(252, 248, 236))
d.text((tx, ty), texto, font=fuente, fill=(196, 18, 28))
# brillo dorado bajo el texto
d.line((tx + 10, ty + bb[3] - bb[1] + 30, W - tx - 10, ty + bb[3] - bb[1] + 30), fill=(232, 182, 60), width=6)

# --- nieve en el borde de arriba ---
pts = [(0, 0)]
x = 0
while x < W:
    pts.append((x, 26 + 14 * math.sin(x * 0.03) + random.uniform(-6, 6)))
    x += 18
pts += [(W, 30), (W, 0)]
d.polygon(pts, fill=(250, 252, 255))
for i in range(40):
    xs, ys = random.uniform(0, W), random.uniform(28, 50)
    d.ellipse((xs - 5, ys - 6, xs + 5, ys + 6), fill=(250, 252, 255))


def acebo(cx, cy, s):
    for ang in (-35, 35, 180 + 35):
        a = math.radians(ang)
        hx, hy = cx + math.cos(a) * 46 * s, cy + math.sin(a) * 30 * s
        d.ellipse((min(cx, hx) - 10 * s, min(cy, hy) - 10 * s, max(cx, hx) + 10 * s, max(cy, hy) + 10 * s), fill=(28, 110, 48), outline=(12, 60, 24), width=3)
    for dx, dy in ((-9, -4), (9, -4), (0, 9)):
        d.ellipse((cx + dx * s - 10 * s, cy + dy * s - 10 * s, cx + dx * s + 10 * s, cy + dy * s + 10 * s), fill=(210, 24, 30), outline=(120, 10, 14), width=2)


def estrella(cx, cy, r):
    p = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.45
        a = -math.pi / 2 + i * math.pi / 5
        p.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(p, fill=(248, 206, 70), outline=(170, 120, 20))


acebo(70, 74, 1.0)
acebo(W - 70, 74, 1.0)
for (cx, cy, r) in ((120, 320, 18), (W - 120, 320, 18), (60, 210, 12), (W - 60, 210, 12)):
    estrella(cx, cy, r)
im.convert('RGB').save('public/pinsapo/cartel_feliz_natal.jpg', quality=92)
print('cartel listo')
