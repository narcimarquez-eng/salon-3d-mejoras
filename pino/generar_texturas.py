from PIL import Image, ImageFilter
import numpy as np, math, random
OUT='public/pino/'
# ---------- CORTEZA: centro del tronco, repetible en horizontal y vertical ----------
t=Image.open('pino/fotos/tronco.jpg').convert('RGB')
c=np.asarray(t.crop((860,80,2290,4010)).resize((512,1024),Image.LANCZOS)).astype(float)
def wrap(a,axis,n):
    # funde los ultimos n px con los primeros para que el borde case
    a=a.copy(); L=a.shape[axis]
    for i in range(n):
        w=i/n  # 0 en el borde
        if axis==1:
            a[:,L-n+i]=a[:,L-n+i]*(1-w)+a[:,i]*w
        else:
            a[L-n+i]=a[L-n+i]*(1-w)+a[i]*w
    return a[:, :L-n] if axis==1 else a[:L-n]
c=wrap(c,1,96); c=wrap(c,0,160)
# igualar iluminacion lateral (el tronco es redondo): quitar gradiente horizontal de baja frecuencia
col=c.mean(axis=(0,2)); col=np.convolve(col,np.ones(61)/61,mode='same'); c=c*(col.mean()/col)[None,:,None]
Image.fromarray(np.clip(c,0,255).astype(np.uint8)).resize((512,1024),Image.LANCZOS).save(OUT+'corteza.jpg',quality=88)
# ---------- COPA: atlas 2x2 de matas con el cielo recortado ----------
f=Image.open('pino/fotos/copa.jpg').convert('RGB')
f=f.resize((2000,1500),Image.LANCZOS)
F=np.asarray(f).astype(float)
blue=F[...,2]-(F[...,0]+F[...,1])/2
key=np.clip((15-blue)/25,0,1)
# quitar el tinte azul del cielo en los bordes
F[...,2]=np.minimum(F[...,2],F[...,1]*0.85)
lum=F.mean(axis=2)/255
random.seed(4)
def mata(cx,cy,S,seed,arriba_libre=False):
    random.seed(seed)
    x0,y0=cx-S//2,cy-S//2
    k=key[y0:y0+S,x0:x0+S]; rgb=F[y0:y0+S,x0:x0+S]; L=lum[y0:y0+S,x0:x0+S]
    yy,xx=np.mgrid[0:S,0:S]/S*2-1
    ang=np.arctan2(yy,xx); rad=np.sqrt(xx**2+yy**2)
    # contorno irregular: radio con ondas (penachos de aciculas)
    R=0.78+0*ang
    for h,amp in [(3,.07),(5,.06),(9,.05),(17,.035),(31,.02)]:
        R=R+amp*np.sin(h*ang+random.uniform(0,6.28))
    # hebras: las aciculas claras sobresalen mas que las oscuras
    R=R+0.10*(L-0.45)
    blob=np.clip((R-rad)/0.06,0,1)
    a=k*blob
    a=np.asarray(Image.fromarray((a*255).astype(np.uint8)).resize((512,512),Image.LANCZOS)).astype(float)/255
    rgb=np.asarray(Image.fromarray(rgb.astype(np.uint8)).resize((512,512),Image.LANCZOS)).astype(float)
    a=np.where(a>0.5,1.0,a)  # macizo dentro, el borde lo decide el recorte
    return rgb,a
centros=[(1350,560,640,1),(1660,600,640,2),(640,1060,640,3),(1080,800,700,4)]
atlas=np.zeros((1024,1024,4))
for i,cc in enumerate(centros):
    rgb,a=mata(*cc)
    ox,oy=(i%2)*512,(i//2)*512
    atlas[oy:oy+512,ox:ox+512,:3]=rgb; atlas[oy:oy+512,ox:ox+512,3]=a*255
# sangrado de color bajo el alpha 0 (evita halo azul al filtrar)
img=Image.fromarray(atlas.astype(np.uint8),'RGBA')
rgb=img.convert('RGB'); m=img.split()[3]
blur=rgb.filter(ImageFilter.GaussianBlur(12))
base=Image.new('RGB',img.size,(70,95,30)); base.paste(blur,(0,0))
fill=Image.composite(rgb,Image.blend(base,Image.new('RGB',img.size,(70,95,30)),0.5),m.point(lambda v:255 if v>20 else 0))
fill.putalpha(m); fill.save(OUT+'copa.png',optimize=True)
prev=Image.new('RGB',(1024,1024),(255,0,255)); prev.paste(fill,(0,0),fill); pass
print('ok')
