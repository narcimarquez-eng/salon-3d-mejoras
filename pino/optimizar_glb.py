# Recomprime las imagenes de un GLB (las opacas a JPEG y las que tienen transparencia a PNG con paleta de
# 256 colores: el recorte por alpha 0/1 no necesita mas) y une los vertices repetidos con indices.
# Uso: python3 pino/optimizar_glb.py entrada.glb salida.glb [calidad_jpeg]
import sys, json, struct, io
from PIL import Image
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
q = int(sys.argv[3]) if len(sys.argv) > 3 else 85
data = open(src, 'rb').read()
jlen = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + jlen])
bstart = 20 + jlen + 8
blen = struct.unpack('<I', data[20 + jlen:24 + jlen])[0]
binc = data[bstart:bstart + blen]

views = [binc[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in gltf['bufferViews']]
for img in gltf.get('images', []):
    vi = img['bufferView']
    im = Image.open(io.BytesIO(views[vi]))
    out = io.BytesIO()
    a = np.asarray(im.convert('RGBA'))[..., 3] if im.mode in ('RGBA', 'LA', 'P') else None
    if a is not None and a.min() < 250:
        # alpha binaria (recorte) + paleta: mucho mas ligero que RGBA completo
        rgba = im.convert('RGBA')
        al = Image.fromarray(np.where(a > 127, 255, 0).astype(np.uint8))
        pal = rgba.convert('RGB').quantize(255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal_arr = np.asarray(pal).copy()
        pal_arr[np.asarray(al) == 0] = 255           # indice 255 = transparente
        p = Image.fromarray(pal_arr, 'P')
        p.putpalette(pal.getpalette()[:765] + [0, 0, 0])
        p.info['transparency'] = 255
        p.save(out, 'PNG', optimize=True, transparency=255)
        img['mimeType'] = 'image/png'
    else:
        im.convert('RGB').save(out, 'JPEG', quality=q, optimize=True)
        img['mimeType'] = 'image/jpeg'
    print(f"imagen {vi}: {len(views[vi]) / 1e6:.2f} MB -> {len(out.getvalue()) / 1e6:.2f} MB ({img['mimeType']})")
    views[vi] = out.getvalue()

# ---------- unir vertices repetidos (el exportador deja cada triangulo con sus 3 vertices propios) ----------
COMP = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
import numpy as np


def leer(acc_i):
    acc = gltf['accessors'][acc_i]
    bv = gltf['bufferViews'][acc['bufferView']]
    fmt, size = COMP[acc['componentType']]
    n = NCOMP[acc['type']]
    raw = views[acc['bufferView']]
    off = acc.get('byteOffset', 0)
    stride = bv.get('byteStride', size * n)
    dt = np.dtype('<' + fmt)
    if stride == size * n:
        return np.frombuffer(raw, dtype=dt, count=acc['count'] * n, offset=off).reshape(acc['count'], n)
    return np.stack([np.frombuffer(raw, dtype=dt, count=n, offset=off + i * stride) for i in range(acc['count'])])


def nuevo_view(datos, target):
    views.append(datos.tobytes())
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': 0, 'byteLength': len(views[-1]), 'target': target})
    return len(gltf['bufferViews']) - 1


antes = despues = 0
for mesh in gltf['meshes']:
    for prim in mesh['primitives']:
        if 'indices' in prim or prim.get('mode', 4) != 4:
            continue
        nombres = sorted(prim['attributes'])
        datos = {k: leer(prim['attributes'][k]) for k in nombres}
        clave = np.concatenate([np.round(datos[k].astype(np.float64), 5) for k in nombres], axis=1)
        _, primero, inversa = np.unique(clave, axis=0, return_index=True, return_inverse=True)
        orden = np.argsort(primero)
        remap = np.empty_like(orden)
        remap[orden] = np.arange(len(orden))
        idx = remap[inversa.reshape(-1)]
        sel = primero[orden]
        antes += len(datos['POSITION'])
        despues += len(sel)
        for k in nombres:
            acc_old = gltf['accessors'][prim['attributes'][k]]
            arr = np.ascontiguousarray(datos[k][sel])
            acc = {'bufferView': nuevo_view(arr, 34962), 'componentType': acc_old['componentType'], 'count': len(sel), 'type': acc_old['type']}
            if acc_old.get('normalized'):
                acc['normalized'] = True
            if k == 'POSITION':
                acc['min'] = arr.min(axis=0).tolist()
                acc['max'] = arr.max(axis=0).tolist()
            gltf['accessors'].append(acc)
            prim['attributes'][k] = len(gltf['accessors']) - 1
        if len(sel) < 65536:
            ct, idx_arr = 5123, idx.astype(np.uint16)
        else:
            ct, idx_arr = 5125, idx.astype(np.uint32)
        gltf['accessors'].append({'bufferView': nuevo_view(idx_arr, 34963), 'componentType': ct, 'count': len(idx_arr), 'type': 'SCALAR'})
        prim['indices'] = len(gltf['accessors']) - 1
if antes:
    print(f"vertices: {antes} -> {despues}")

# quitar los accessors y bufferViews que ya no usa nadie
usados = set()
for mesh in gltf['meshes']:
    for prim in mesh['primitives']:
        usados.update(prim['attributes'].values())
        if 'indices' in prim:
            usados.add(prim['indices'])
for sk in gltf.get('skins', []):
    if 'inverseBindMatrices' in sk:
        usados.add(sk['inverseBindMatrices'])
for an in gltf.get('animations', []):
    for sm in an['samplers']:
        usados.update([sm['input'], sm['output']])
mapa = {}
lista = []
for i, acc in enumerate(gltf['accessors']):
    if i in usados:
        mapa[i] = len(lista)
        lista.append(acc)
gltf['accessors'] = lista
for mesh in gltf['meshes']:
    for prim in mesh['primitives']:
        prim['attributes'] = {k: mapa[v] for k, v in prim['attributes'].items()}
        if 'indices' in prim:
            prim['indices'] = mapa[prim['indices']]
for sk in gltf.get('skins', []):
    if 'inverseBindMatrices' in sk:
        sk['inverseBindMatrices'] = mapa[sk['inverseBindMatrices']]
for an in gltf.get('animations', []):
    for sm in an['samplers']:
        sm['input'] = mapa[sm['input']]
        sm['output'] = mapa[sm['output']]
usados_bv = set(a['bufferView'] for a in gltf['accessors'] if 'bufferView' in a)
usados_bv |= set(im['bufferView'] for im in gltf.get('images', []) if 'bufferView' in im)
mapa_bv = {}
bvs = []
vs = []
for i, bv in enumerate(gltf['bufferViews']):
    if i in usados_bv:
        mapa_bv[i] = len(bvs)
        bvs.append(bv)
        vs.append(views[i])
for acc in gltf['accessors']:
    if 'bufferView' in acc:
        acc['bufferView'] = mapa_bv[acc['bufferView']]
for im in gltf.get('images', []):
    if 'bufferView' in im:
        im['bufferView'] = mapa_bv[im['bufferView']]
gltf['bufferViews'] = bvs
views = vs

nb = bytearray()
for v, b in zip(gltf['bufferViews'], views):
    while len(nb) % 4:
        nb.append(0)
    v['byteOffset'] = len(nb)
    v['byteLength'] = len(b)
    nb += b
while len(nb) % 4:
    nb.append(0)
gltf['buffers'][0]['byteLength'] = len(nb)
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
total = 12 + 8 + len(js) + 8 + len(nb)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(nb), b'BIN\x00')); f.write(nb)
print(f"{dst}: {total / 1e6:.2f} MB")
