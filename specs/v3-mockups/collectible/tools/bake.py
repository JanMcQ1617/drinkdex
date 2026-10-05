import os, numpy as np
from PIL import Image, ImageEnhance, ImageFilter
SRC='img'
def warm(im):
    a=np.asarray(im.convert('RGB')).astype(np.float32)/255
    lum=(0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2])[...,None]
    mult=np.array([1.02,0.955,0.875],np.float32)
    w=np.clip((lum-0.25)/0.6,0,1)
    out=np.clip((a*(1-w)+a*mult*w)*1.03,0,1)
    im2=Image.fromarray((out*255).astype(np.uint8))
    im2=ImageEnhance.Color(im2).enhance(1.22)
    return ImageEnhance.Contrast(im2).enhance(1.06)
def ghost(im):
    g=im.convert('L').resize((512,512),Image.LANCZOS)
    a=np.clip((np.asarray(g).astype(np.float32)/255-0.10)/0.85,0,1)
    lo=np.array([0x26,0x05,0x0B],np.float32)/255; hi=np.array([0x6C,0x2A,0x35],np.float32)/255
    out=lo+(hi-lo)*a[...,None]**1.35
    emb=np.asarray(g.filter(ImageFilter.GaussianBlur(0.8)).filter(ImageFilter.EMBOSS)).astype(np.float32)/255-0.5
    out=out+emb[...,None]*np.array([0.62,0.48,0.48])
    return Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8))
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.webp') or 'locked' in f: continue
    im=Image.open(os.path.join(SRC,f))
    warm(im).resize((900,900),Image.LANCZOS).save('img/warm/'+f,quality=84)
    ghost(im).save('img/ghost/'+f,quality=82)
print(len(os.listdir('img/warm')), len(os.listdir('img/ghost')))
