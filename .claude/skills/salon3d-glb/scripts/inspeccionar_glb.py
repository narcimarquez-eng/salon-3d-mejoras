#!/usr/bin/env python3
"""Resumen de un archivo .glb: peso, triángulos, piezas, materiales, imágenes, esqueletos y animaciones.

Uso: python3 inspeccionar_glb.py archivo.glb [--materiales]

Con --materiales lista cada material con su color, modo de transparencia y si lleva textura.
"""
import json
import struct
import sys


def leer_glb(ruta):
    datos = open(ruta, 'rb').read()
    if datos[:4] != b'glTF':
        raise SystemExit(f'{ruta} no es un GLB')
    largo_json = struct.unpack('<I', datos[12:16])[0]
    return datos, json.loads(datos[20:20 + largo_json])


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    ruta = sys.argv[1]
    datos, j = leer_glb(ruta)
    acc = j.get('accessors', [])
    triangulos = 0
    for malla in j.get('meshes', []):
        for p in malla.get('primitives', []):
            if p.get('mode', 4) != 4:
                continue
            if 'indices' in p:
                triangulos += acc[p['indices']]['count'] // 3
            else:
                triangulos += acc[p['attributes']['POSITION']]['count'] // 3
    anims = [a.get('name', '?') for a in j.get('animations', [])]
    print(f"{ruta}: {len(datos) / 1e6:.2f} MB | {triangulos:,} triángulos | {len(j.get('meshes', []))} piezas | "
          f"{len(j.get('materials', []))} materiales | {len(j.get('images', []))} imágenes | "
          f"{len(j.get('skins', []))} esqueletos | animaciones: {anims}")
    print('extensiones:', j.get('extensionsUsed', []))
    raiz = [n.get('name') for n in j.get('nodes', [])][:3]
    print('primeros nodos:', raiz)
    if '--materiales' in sys.argv:
        for m in j.get('materials', []):
            pbr = m.get('pbrMetallicRoughness', {})
            color = [round(x, 3) for x in pbr.get('baseColorFactor', [1, 1, 1, 1])]
            textura = 'con textura' if 'baseColorTexture' in pbr else 'sin textura'
            print(f"  {m.get('name')}: color {color} | alpha {m.get('alphaMode', 'OPAQUE')} | {textura}")


if __name__ == '__main__':
    main()
