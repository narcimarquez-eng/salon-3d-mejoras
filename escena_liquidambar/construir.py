# Mete el GLB del liquidambar y las texturas (base64) en la plantilla y escribe
# escena_liquidambar/liquidambar_pradera.html, que se abre con doble clic (three.js viene del CDN).
# Uso: python3 escena_liquidambar/construir.py  (desde la raiz del repo)
import base64
s = open('escena_liquidambar/plantilla.html', encoding='utf-8').read()
def b64(ruta, tipo):
    return 'data:' + tipo + ';base64,' + base64.b64encode(open(ruta, 'rb').read()).decode()
s = s.replace('__GLB__', b64('liquidambar/liquidambar.glb', 'model/gltf-binary'))
s = s.replace('__TRIGO__', b64('escena_liquidambar/trigo.png', 'image/png'))
s = s.replace('__FLORES__', b64('escena_liquidambar/flores.png', 'image/png'))
s = s.replace('__HOJAS__', b64('escena_liquidambar/hojas_sueltas.png', 'image/png'))
open('escena_liquidambar/liquidambar_pradera.html', 'w', encoding='utf-8').write(s)
print('escena_liquidambar/liquidambar_pradera.html', round(len(s) / 1e6, 2), 'MB')
