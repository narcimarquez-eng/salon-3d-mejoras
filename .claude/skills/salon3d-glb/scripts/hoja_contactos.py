#!/usr/bin/env python3
"""Junta varias capturas de la app en una sola imagen, recortando los paneles de la interfaz.

Uso: python3 hoja_contactos.py salida.png captura1.png captura2.png ... [--columnas 3] [--sin-recorte]
"""
import sys

from PIL import Image

# Zona del visor dentro de una captura de 1500 x 950 (sin barras ni panel derecho)
RECORTE = (30, 270, 1140, 860)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit(__doc__)
    columnas = 3
    if '--columnas' in args:
        i = args.index('--columnas')
        columnas = int(args[i + 1])
        del args[i:i + 2]
    recortar = '--sin-recorte' not in args
    args = [a for a in args if a != '--sin-recorte']
    salida, entradas = args[0], args[1:]
    imagenes = []
    for ruta in entradas:
        im = Image.open(ruta).convert('RGB')
        if recortar and im.size == (1500, 950):
            im = im.crop(RECORTE)
        im.thumbnail((740, 420))
        imagenes.append(im)
    ancho = max(im.size[0] for im in imagenes)
    alto = max(im.size[1] for im in imagenes)
    filas = (len(imagenes) + columnas - 1) // columnas
    hoja = Image.new('RGB', (ancho * min(columnas, len(imagenes)), alto * filas), (20, 20, 20))
    for i, im in enumerate(imagenes):
        hoja.paste(im, ((i % columnas) * ancho, (i // columnas) * alto))
    hoja.save(salida)
    print(f'{salida}: {len(imagenes)} capturas')


if __name__ == '__main__':
    main()
