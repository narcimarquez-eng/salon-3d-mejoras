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
# algo mas oscura y rojiza: con la luz del visor la corteza salia palida
c=c*np.array([0.82,0.72,0.64])
Image.fromarray(np.clip(c,0,255).astype(np.uint8)).resize((512,1024),Image.LANCZOS).save(OUT+'corteza.jpg',quality=88)
