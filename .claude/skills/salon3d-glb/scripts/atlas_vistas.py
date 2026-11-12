"""Junta en una textura pequeña solo las vistas que usa un modelo (para juegos).

Una hoja de vistas es casi todo fondo blanco: proyectar la hoja entera mete en el .glb una
imagen enorme. Esta herramienta recorta cada vista (con un margen, para que el color estirado
por preparar_hoja_fotos.py siga alrededor), puede girar la cenital 90° para que la cabeza
quede a la izquierda, las coloca en filas y escala el conjunto al ancho pedido.

Uso:
    python3 atlas_vistas.py hoja_preparada.jpg salida.jpg ancho vistas.json [ancho_fila]

ancho_fila: ancho máximo de cada fila antes de escalar (por defecto, la mitad del total).
Para figuras altas (personajes de pie) conviene una sola fila: pon un número grande.

vistas.json: [{"nombre": "perfil", "rect": [x0, y0, x1, y1], "girar": 0}, ...]
  girar: 0, o 90 para girar a izquierdas (una cenital con la cabeza arriba pasa a tenerla a
  la izquierda, y entonces se usa el eje "z" normal en el script).

Imprime, para cada vista, la función que pasa un píxel de la hoja a un píxel del atlas:
el script del modelo mide en la hoja y convierte con esos números (ver lobo_acorazado/).
"""
import json
import os
import sys
import tempfile

from PIL import Image

MARGEN = 10


def main():
    src, dst, ancho = sys.argv[1], sys.argv[2], int(sys.argv[3])
    vistas = json.load(open(sys.argv[4]))
    hoja = Image.open(src).convert('RGB')
    trozos = []
    for v in vistas:
        x0, y0, x1, y1 = v['rect']
        x0, y0 = max(0, x0 - MARGEN), max(0, y0 - MARGEN)
        x1, y1 = min(hoja.width, x1 + MARGEN), min(hoja.height, y1 + MARGEN)
        im = hoja.crop((x0, y0, x1, y1))
        if v.get('girar', 0) == 90:
            im = im.transpose(Image.Transpose.ROTATE_90)
        trozos.append((v, (x0, y0, x1, y1), im))
    # Filas: se llenan en orden hasta el ancho de la vista más ancha (o de dos seguidas)
    limite = max(max(t[2].width for t in trozos), sum(t[2].width for t in trozos) // 2)
    if len(sys.argv) > 5:
        limite = int(sys.argv[5])
    filas, fila, ancho_fila = [], [], 0
    for t in trozos:
        if fila and ancho_fila + t[2].width > limite:
            filas.append(fila)
            fila, ancho_fila = [], 0
        fila.append(t)
        ancho_fila += t[2].width
    if fila:
        filas.append(fila)
    w_total = max(sum(t[2].width for t in f) for f in filas)
    h_total = sum(max(t[2].height for t in f) for f in filas)
    lienzo = Image.new('RGB', (w_total, h_total), (40, 40, 40))
    y = 0
    colocadas = []
    for f in filas:
        x = 0
        for v, rect, im in f:
            lienzo.paste(im, (x, y))
            colocadas.append((v, rect, x, y, im.width, im.height))
            x += im.width
        y += max(t[2].height for t in f)
    s = ancho / w_total
    alto = round(h_total * s)
    lienzo.resize((ancho, alto), Image.LANCZOS).save(dst, quality=85, optimize=True)
    print(f'{dst}: {ancho}x{alto}, escala {s:.4f}')
    for v, (x0, y0, x1, y1), ox, oy, w, h in colocadas:
        g = v.get('girar', 0)
        # píxel de la hoja (px, py) -> píxel del atlas
        if g == 90:
            # girar a izquierdas: (lx, ly) -> (ly, ancho_trozo - 1 - lx)
            print(f"{v['nombre']}: atlas_x = {ox * s:.2f} + (py - {y0}) * {s:.5f};  "
                  f"atlas_y = {oy * s:.2f} + ({x1 - x0 - 1} - (px - {x0})) * {s:.5f}")
        else:
            print(f"{v['nombre']}: atlas_x = {ox * s:.2f} + (px - {x0}) * {s:.5f};  "
                  f"atlas_y = {oy * s:.2f} + (py - {y0}) * {s:.5f}")
    json.dump([{'nombre': v['nombre'], 'rect': list(r), 'ox': ox, 'oy': oy, 'girar': v.get('girar', 0),
                'escala': s} for v, r, ox, oy, w, h in colocadas], open(os.path.join(tempfile.gettempdir(), os.path.basename(dst) + '.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
