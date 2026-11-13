# Recorta texturas de la hoja de vistas del burro y las deja sin costuras (para mat.color_map).
# Uso: python3 burro/hacer_texturas_desde_foto.py <hoja.jpg> public/textures <vista_previa.png>
import sys
import numpy as np
from PIL import Image
src, outdir, prev = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
P = {
 'burro_pelaje': (473, 380, 518, 425),
 'burro_barriga': (600, 492, 676, 523),
 'burro_hocico': (366, 424, 386, 442),
 'burro_crin': (1785, 150, 1796, 230),
 'burro_pata': (540, 592, 553, 655),
 'burro_madera': (975, 300, 1028, 342),
 'burro_cuerda': (573, 297, 690, 328),
 'burro_saco': (595, 400, 650, 452),
 'burro_lona': (525, 385, 575, 428),
 'burro_manta_verde': (1853, 272, 1882, 330),
 'burro_manta_gris': (1740, 452, 1790, 488),
 'burro_cuero': (985, 365, 1055, 425),
 'burro_metal': (710, 445, 745, 478),
}
# Las de la madera, el cuero y el saco salen más claras que en la foto: se oscurecen un poco
OSCURECER = {'burro_madera': 0.72, 'burro_cuero': 0.78, 'burro_saco': 0.88}
N = 512
y, x = np.mgrid[0:N, 0:N] / (N - 1)
# Peso alto en el centro y 0 en los bordes: los bordes salen de la copia desplazada media baldosa,
# que es continua al repetir, así que la textura no tiene costuras.
w = np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y)) * 2
w = np.clip(w * 1.6, 0, 1)[..., None]
tiles = []
for k, b in P.items():
    t = np.asarray(im.crop(b).resize((N, N), Image.BICUBIC)).astype(np.float32)
    o = np.roll(np.roll(t, N // 2, 0), N // 2, 1)
    r = Image.fromarray((t * w + o * (1 - w)).clip(0, 255).astype(np.uint8))
    r = Image.eval(r, lambda v: v) if k not in OSCURECER else r.point(lambda v: int(v * OSCURECER[k]))
    r.save(f'{outdir}/{k}_diff_1k.jpg', quality=88)
    tiles.append(r)
m = Image.new('RGB', (2 * 140 * 7, 2 * 140), 'white')
for i, t in enumerate(tiles):
    # Dos repeticiones por pieza para ver si hay costuras
    s = t.resize((140, 140))
    for dx in (0, 1):
        m.paste(s, ((i % 7) * 280 + dx * 140, (i // 7) * 140))
m.save(prev)
