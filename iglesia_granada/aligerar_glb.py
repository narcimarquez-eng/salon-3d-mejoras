# Aligera el GLB que exporta la app: pasa las fotos de PNG a JPG y hace que las piezas con
# materiales idénticos compartan uno solo. No toca la geometría.
# Uso: python3 aligerar_glb.py entrada.glb salida.glb [calidad_jpg]
import sys
import io
import json
import struct
from PIL import Image


def leer(ruta):
    b = open(ruta, 'rb').read()
    lj = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + lj])
    p = 20 + lj
    lb = struct.unpack('<I', b[p:p + 4])[0]
    return j, b[p + 8:p + 8 + lb]


def escribir(ruta, j, binario):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binario += b'\0' * ((4 - len(binario) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binario)
    with open(ruta, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(binario), 0x004E4942) + binario)


def main(entrada, salida, calidad=85):
    j, binario = leer(entrada)
    vistas = j['bufferViews']
    trozos = []
    for i, v in enumerate(vistas):
        trozos.append(binario[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
    for im in j.get('images', []):
        if im.get('mimeType') == 'image/png':
            foto = Image.open(io.BytesIO(trozos[im['bufferView']]))
            if foto.mode in ('RGBA', 'LA') and foto.getextrema()[-1][0] < 255:
                continue  # tiene transparencia de verdad: se queda en PNG
            buf = io.BytesIO()
            foto.convert('RGB').save(buf, 'JPEG', quality=calidad, optimize=True)
            trozos[im['bufferView']] = buf.getvalue()
            im['mimeType'] = 'image/jpeg'
    # Recompone el buffer con cada vista alineada a 4 bytes
    nuevo = b''
    for i, v in enumerate(vistas):
        nuevo += b'\0' * ((4 - len(nuevo) % 4) % 4)
        v['byteOffset'] = len(nuevo)
        v['byteLength'] = len(trozos[i])
        nuevo += trozos[i]
    j['buffers'][0]['byteLength'] = len(nuevo)
    # Materiales idénticos (sin contar el nombre) -> uno solo
    claves = {}
    reasignar = {}
    mats = []
    for i, m in enumerate(j.get('materials', [])):
        k = json.dumps({a: b for a, b in m.items() if a != 'name'}, sort_keys=True)
        if k not in claves:
            claves[k] = len(mats)
            mats.append(m)
        reasignar[i] = claves[k]
    for malla in j.get('meshes', []):
        for prim in malla['primitives']:
            if 'material' in prim:
                prim['material'] = reasignar[prim['material']]
    antes = len(j.get('materials', []))
    j['materials'] = mats
    escribir(salida, j, nuevo)
    print('materiales %d -> %d, binario %.2f MB' % (antes, len(mats), len(nuevo) / 1e6))


if __name__ == '__main__':
    q = 85
    if len(sys.argv) > 3:
        q = int(sys.argv[3])
    main(sys.argv[1], sys.argv[2], q)
