# Recomprime las imagenes de un GLB: las opacas a JPEG y las que tienen transparencia a PNG
# con paleta de 256 colores (el recorte por alpha 0/1 no necesita mas). No toca la geometria.
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
