import sys
from rembg import remove, new_session
from PIL import Image
U='/root/.claude/uploads/0ebdc2f6-d599-516f-b615-afc9d6a0214c/'
modelo=sys.argv[1]
s=new_session(modelo)
for nombre,f in [('frente','95480261-image.jpg'),('perfil_izq','4427bae1-image.jpg'),('perfil_der','22d6874c-image.jpg'),('espalda','067cccf1-image.jpg')]:
    im=Image.open(U+f).convert('RGB'); im.thumbnail((1600,1600))
    out=remove(im,session=s)
    out.save(f'{modelo}_{nombre}.png')
    print(nombre, out.size)
