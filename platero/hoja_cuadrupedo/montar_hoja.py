import numpy as np
from PIL import Image
from scipy import ndimage
def limpiar(rgba, borrar=None):
    a=np.asarray(rgba).copy()
    al=a[...,3]
    if borrar:
        # borrar(x,y) -> True si hay que quitar ese pixel
        H,W=al.shape; yy,xx=np.mgrid[0:H,0:W]
        al[borrar(xx,yy)]=0
    m=al>128
    lab,n=ndimage.label(m)
    sizes=ndimage.sum(m,lab,range(1,n+1))
    keep=np.zeros_like(m)
    big=sizes.max()
    for i,sz in enumerate(sizes):
        if sz>big*0.01: keep|=lab==i+1
    al[~keep]=0
    a[...,3]=al
    return Image.fromarray(a)
def sobre_blanco(im):
    bg=Image.new('RGBA',im.size,(255,255,255,255)); bg.alpha_composite(im)
    box=im.getchannel('A').point(lambda v:255 if v>128 else 0).getbbox()
    return bg.convert('RGB').crop(box)
M='isnet-general-use_'
vistas=[]
vistas.append(sobre_blanco(limpiar(Image.open(M+'frente.png'))))
vistas.append(sobre_blanco(limpiar(Image.open(M+'perfil_izq.png'))))
# perfil derecho: quitar la cabeza del niño que asoma por encima del lomo
# bbox del perfil derecho sin tocar, para pasar puntos medidos en la hoja a la foto
_pd=limpiar(Image.open(M+'perfil_der.png'))
_bb=_pd.getchannel('A').point(lambda v:255 if v>128 else 0).getbbox()
_esc=900/(_bb[3]-_bb[1]); _px0=120+286+120+897+120
def _hoja_a_foto(cx,cy):
    sx=1950+cx/3; sy=300+cy/3
    return (_bb[0]+(sx-_px0)/_esc, _bb[1]+(sy-120)/_esc)
_pts=[_hoja_a_foto(-300,268),_hoja_a_foto(0,256),_hoja_a_foto(400,242),_hoja_a_foto(600,208),_hoja_a_foto(900,160)]
print('linea del lomo (foto):',[(round(p[0]),round(p[1])) for p in _pts])
_lx=np.array([p[0] for p in _pts]); _ly=np.array([p[1] for p in _pts])
def nino(x,y):
    linea=np.interp(x,_lx,_ly)
    return (x>=_lx[0])&(x<=_lx[-1])&(y<linea)
vistas.append(sobre_blanco(limpiar(Image.open(M+'perfil_der.png'),nino)))
vistas.append(sobre_blanco(limpiar(Image.open(M+'espalda.png'))))
c=Image.open('cenital_render.png').convert('RGB'); ca=np.asarray(c).astype(int)
mask=(ca.min(2)<235)
al=Image.fromarray((mask*255).astype(np.uint8)); cr=c.copy(); cr.putalpha(al)
vistas.append(sobre_blanco(limpiar(cr)))
H=900; G=120
row=[v.resize((max(1,int(v.width*H/v.height)),H),Image.LANCZOS) for v in vistas]
W=sum(r.width for r in row)+G*(len(row)+1)
hoja=Image.new('RGB',(W,H+2*G),(255,255,255)); x=G
for r in row: hoja.paste(r,(x,G)); x+=r.width+G
hoja.save('hoja_platero.png'); print(hoja.size,[r.size for r in row])
hoja.resize((W//3,(H+2*G)//3)).save('hoja_mini.png')
