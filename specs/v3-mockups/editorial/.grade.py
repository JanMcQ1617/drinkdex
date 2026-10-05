import sys, json
import numpy as np
from PIL import Image
SRC="/Users/janmcqueeny/Projects/drinkdex-worktrees/polish/assets/drinks/"
ink=json.load(open(sys.argv[1]))
def h2rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)])
def grade(id, strength=0.9, out=None, size=None):
    im=Image.open(SRC+id+'.webp').convert('RGB')
    if size: im=im.resize((size,size),Image.LANCZOS)
    a=np.asarray(im).astype(float)/255
    mx=a.max(2); mn=a.min(2); sat=(mx-mn)/np.maximum(mx,1e-6)
    lumi=(0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2])
    # mask: neutral pixels = backdrop/table/glass
    m=np.clip((0.22-sat)/0.14,0,1)
    w=h2rgb(ink[id]['wash'])
    # target: tint by luminance relative to backdrop median ~0.75; keep shading
    ref=np.median(lumi)
    scale=(lumi/ref)[...,None]
    tgt=np.clip(w[None,None,:]*scale**1.1,0,1)
    # warm toward tint but keep some original
    o=a*(1-m[...,None]*strength)+tgt*(m[...,None]*strength)
    Image.fromarray((np.clip(o,0,1)*255).astype(np.uint8)).save(out, quality=86)
for id in sys.argv[2:]:
    grade(id,out=f"{id}.test.jpg",size=400)
