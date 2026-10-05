import sys, json, math
import numpy as np
from PIL import Image
SRC="/Users/janmcqueeny/Projects/drinkdex-worktrees/polish/assets/drinks/"
def srgb2lin(c): c=np.asarray(c,float); return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
def lin2srgb(c): c=np.clip(c,0,1); return np.where(c<=0.0031308,c*12.92,1.055*c**(1/2.4)-0.055)
def rgb2oklab(rgb):
    r,g,b=srgb2lin(rgb)
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=np.cbrt(l),np.cbrt(m),np.cbrt(s)
    return np.array([0.2104542553*l+0.7936177850*m-0.0040720468*s,1.9779984951*l-2.4285922050*m+0.4505937099*s,0.0259040371*l+0.7827717662*m-0.8086757660*s])
def oklab2rgb(lab):
    L,a,b=lab
    l=(L+0.3963377774*a+0.2158037573*b)**3
    m=(L-0.1055613458*a-0.0638541728*b)**3
    s=(L-0.0894841775*a-1.2914855480*b)**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bb=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return lin2srgb(np.array([r,g,bb]))
def lch(L,C,h): return oklab2rgb([L,C*math.cos(h),C*math.sin(h)])
def hexof(rgb): return '#%02X%02X%02X'%tuple(int(round(x*255)) for x in np.clip(rgb,0,1))
def lum(rgb): r,g,b=srgb2lin(rgb); return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
def h2rgb(h): h=h.lstrip('#'); return np.array([int(h[i:i+2],16)/255 for i in (0,2,4)])
CREAM=h2rgb('#F7F2EA'); BONE=h2rgb('#F7F2EA'); ESP=h2rgb('#2B2322')
def sample(id):
    im=Image.open(SRC+id+'.webp').convert('RGB').resize((256,256))
    a=np.asarray(im).astype(float)/255
    a=a[40:230,50:206].reshape(-1,3)
    mx=a.max(1); mn=a.min(1); sat=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
    sel=a[(sat>0.28)&(mx>0.18)]
    if len(sel)<60: return None
    lab=np.array([rgb2oklab(p) for p in sel[::max(1,len(sel)//3000)]])
    h=np.arctan2(lab[:,2],lab[:,1]); C=np.hypot(lab[:,1],lab[:,2])
    bins=np.floor((h+math.pi)/(2*math.pi)*24).astype(int)%24
    w=np.bincount(bins,weights=C,minlength=24)
    # smooth
    ws=w+0.5*np.roll(w,1)+0.5*np.roll(w,-1)
    k=int(np.argmax(ws))
    m=(np.abs(((bins-k+12)%24)-12)<=1)
    hh=math.atan2(np.median(lab[m,2]),np.median(lab[m,1])); cc=float(np.median(C[m])); LL=float(np.median(lab[m,0]))
    return LL,cc,hh
def derive(LL,cc,hh):
    # wash: page tint
    wash=lch(0.935,min(cc*0.35,0.035),hh)
    # deep: block ground, bone text >= 7:1
    L=0.36; C=min(max(cc,0.05)*0.9,0.11)
    while cr(lch(L,C,hh),BONE)<7.5: L-=0.005
    deep=lch(L,C,hh)
    # ink: text on cream and on wash >= 4.5
    L=0.55; C2=min(max(cc,0.05),0.14)
    while min(cr(lch(L,C2,hh),CREAM),cr(lch(L,C2,hh),wash))<4.8: L-=0.005
    ink=lch(L,C2,hh)
    # vivid: sampled colour itself for rules/edges (decorative)
    vivid=lch(min(max(LL,0.55),0.72),min(cc,0.16),hh)
    return dict(wash=hexof(wash),deep=hexof(deep),ink=hexof(ink),vivid=hexof(vivid),
      boneOnDeep=round(cr(deep,BONE),2),inkOnCream=round(cr(ink,CREAM),2),inkOnWash=round(cr(ink,wash),2),espOnWash=round(cr(ESP,wash),2))
if __name__=='__main__':
    out={}
    for id in sys.argv[1:]:
        s=sample(id)
        if s is None: print(id,'NO SAMPLE'); continue
        out[id]=derive(*s); out[id]['hue']=round(math.degrees(s[2])); out[id]['chroma']=round(s[1],3)
        print(id, json.dumps(out[id]))
    json.dump(out,open(sys.argv[0].replace('.ink.py','.ink.json'),'w'),indent=1)
