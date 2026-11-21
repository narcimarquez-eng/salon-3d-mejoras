from PIL import Image, ImageFilter
import numpy as np, sys
# Uso: python3 hacer_textura_bronce.py <carpeta con la foto de perfil 22d6874c-image.jpg>
U=sys.argv[1].rstrip('/')+'/' if len(sys.argv) > 1 else './'
k=2.048
im=Image.open(U+'22d6874c-image.jpg').convert('RGB')
x0,y0=int(905*k),int(470*k); n=int(250*k)
sq=im.crop((x0,y0,x0+n,y0+n)).resize((1024,1024),Image.LANCZOS)
a=np.asarray(sq).astype(np.float32)/255
blur=np.asarray(sq.filter(ImageFilter.GaussianBlur(120))).astype(np.float32)/255
mean=a.reshape(-1,3).mean(0)
a=np.clip(a/np.maximum(blur,0.03)*mean,0,1)
N=1024
t=np.linspace(0,1,N); d=np.minimum(t,1-t)*2
w=np.clip(d*2.5,0,1); w=w*w*(3-2*w)
a=a*w[None,:,None]+np.roll(a,N//2,1)*(1-w[None,:,None])
a=a*w[:,None,None]+np.roll(a,N//2,0)*(1-w[:,None,None])
Image.fromarray((np.clip(a*np.array([0.95,0.74,0.58])*0.92,0,1)*255).astype(np.uint8)).save('bronce_platero_diff_1k.jpg',quality=90)
hs=np.asarray(Image.fromarray((a.mean(2)*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)/255
gx=(np.roll(hs,-1,1)-np.roll(hs,1,1))*0.5; gy=(np.roll(hs,-1,0)-np.roll(hs,1,0))*0.5
s=6.0; nx=-gx*s; ny=gy*s; nz=np.ones_like(nx); l=np.sqrt(nx*nx+ny*ny+nz*nz)
Image.fromarray(((np.stack([nx/l,ny/l,nz/l],2)*0.5+0.5)*255).astype(np.uint8)).save('bronce_platero_nor_gl_1k.jpg',quality=92)
Image.fromarray((np.clip(0.62-(hs-hs.mean())*0.9,0.25,0.85)*255).astype(np.uint8)).save('bronce_platero_rough_1k.jpg',quality=90)
t2=Image.open('bronce_platero_diff_1k.jpg'); big=Image.new('RGB',(2048,2048))
for i in range(2):
  for j in range(2): big.paste(t2,(i*1024,j*1024))
big.resize((1024,1024)).save('tile2x2.png')
