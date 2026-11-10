"""Prepara una hoja de vistas (fondo blanco) para usarla como textura proyectada.

Estira el color de cada figura unos píxeles por fuera de su contorno, para que el fondo
blanco no manche los bordes del modelo cuando la malla es un poco más ancha que la foto.

Uso:
    python3 preparar_hoja_fotos.py hoja.jpg public/textures/<id>.jpg [pasos=60] [ancho_max=0] [umbral=150]

umbral: cuánto debe apartarse un píxel del blanco (suma de |255 - canal|) para contar como
figura. Con 150, los huecos claros entre pelos (crin, cola, tupé) cuentan como fondo y se
rellenan con el color de alrededor en vez de salir como manchas blancas en el modelo.

ancho_max > 0 reduce la imagen a ese ancho (las medidas en píxeles del script deben ser
entonces las de la imagen reducida).
"""
import sys

import numpy as np
from PIL import Image


def desplazar(m, dy, dx):
    r = np.zeros_like(m)
    h, w = m.shape[:2]
    ys = slice(max(dy, 0), h + min(dy, 0))
    yd = slice(max(-dy, 0), h + min(-dy, 0))
    xs = slice(max(dx, 0), w + min(dx, 0))
    xd = slice(max(-dx, 0), w + min(-dx, 0))
    r[ys, xs] = m[yd, xd]
    return r


def main():
    src, dst = sys.argv[1], sys.argv[2]
    pasos = int(sys.argv[3]) if len(sys.argv) > 3 else 60
    ancho_max = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    umbral = int(sys.argv[5]) if len(sys.argv) > 5 else 150
    im = Image.open(src).convert('RGB')
    if ancho_max and im.width > ancho_max:
        im = im.resize((ancho_max, round(im.height * ancho_max / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    figura = np.abs(a - 255).sum(2) > umbral
    # Quita el borde de antialias (mezcla con el blanco) antes de estirar el color
    nucleo = figura.copy()
    for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        nucleo &= desplazar(figura, dy, dx)
    conocido = nucleo.copy()
    color = a * conocido[..., None]
    vecinos = [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)]
    for _ in range(pasos):
        suma = np.zeros_like(color)
        n = np.zeros(conocido.shape, np.float32)
        for dy, dx in vecinos:
            suma += desplazar(color, dy, dx)
            n += desplazar(conocido.astype(np.float32), dy, dx)
        nuevo = (~conocido) & (n > 0)
        color[nuevo] = suma[nuevo] / n[nuevo][:, None]
        conocido |= nuevo
    out = np.where(conocido[..., None], color, a)
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst, quality=90)
    print(f'{dst}: {im.width}x{im.height}')


if __name__ == '__main__':
    main()
