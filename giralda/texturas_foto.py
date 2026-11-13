# Texturas de la Giralda sacadas de las fotos del usuario.
# Uso: python3 texturas_foto.py fotos.webp ladrillo_app.png carpeta_salida
#  - fotos.webp: el mosaico de cuatro fotos (se usa la zona lisa y soleada de la cana, foto 1).
#  - ladrillo_app.png: la textura de ladrillo que exporta la app (brick_mudejar, en gris).
# Saca el grano de la piedra de la foto (quitando la variacion de luz), lo repite en espejo
# para que no haya costuras y lo multiplica por el aparejo de ladrillo. Las texturas salen en
# gris claro: el color lo pone el material (medido en las mismas fotos).
import sys
import numpy as np
from PIL import Image, ImageFilter

foto, ladrillo_app, salida = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(foto).convert('RGB')
zona = im.crop((300, 160, 318, 200)).convert('L')          # pano liso de la cana (foto 1)
a = np.asarray(zona, dtype=float)
luz = np.asarray(zona.filter(ImageFilter.GaussianBlur(5)), dtype=float)
g = (a / np.maximum(luz, 1))[:18, :18]
tesela = np.block([[g, g[:, ::-1]], [g[::-1, :], g[::-1, ::-1]]])

def grano(amp):
    t = (tesela - 1.0) * amp + 1.0
    t = Image.fromarray(np.clip(t * 128, 0, 255).astype(np.uint8)).resize((512, 512), Image.BICUBIC)
    return np.asarray(t, dtype=float) / 128

def guardar(valor_lineal, nombre):
    v = np.power(np.clip(valor_lineal, 0, 1), 1 / 2.2)
    Image.fromarray((np.repeat(v[:, :, None], 3, axis=2) * 255).astype(np.uint8)).save(salida + '/' + nombre)

lad = np.asarray(Image.open(ladrillo_app).convert('L').resize((512, 512)), dtype=float)
lad = lad / lad.mean()
guardar(0.85 * lad * grano(2.0), 'giralda_ladrillo_foto.png')
guardar(0.85 * grano(1.5), 'giralda_estuco_foto.png')
print('texturas guardadas en', salida)
