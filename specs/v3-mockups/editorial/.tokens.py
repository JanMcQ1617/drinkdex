import json, math, sys
import numpy as np
sys.path.insert(0,'.')
exec(open('.ink.py').read().split("if __name__")[0])
BONE=h2rgb('#E9E5DF'); CREAM=h2rgb('#F7F2EA'); ESP=h2rgb('#2B2322'); WHITE=h2rgb('#FFFFFF')
GILT_ON_DARK=h2rgb('#D9BF84')
LIQ={"amber":"#D3892A","orange":"#E8792B","cream":"#EBDCC0","clear":"#E4E8E4","coffee":"#3A200E","violet":"#7B4A9E","pink":"#E46E97","gold":"#E3AE33","darkBrown":"#4E2711"}
def mix(a,b,t): return a*(1-t)+b*t
def tok(LL,cc,hh):
    cc=max(cc,0.035)
    seam=lch(0.905,min(cc*0.42,0.05),hh)
    L=0.36; C=min(cc*0.9,0.11)
    while cr(lch(L,C,hh),BONE)<8.5: L-=0.005
    deep=lch(L,C,hh)
    L=0.55; C2=min(cc,0.14)
    while min(cr(lch(L,C2,hh),CREAM),cr(lch(L,C2,hh),seam))<4.6: L-=0.005
    ink=lch(L,C2,hh)
    # deep on seamless must be >= 7
    muted=mix(BONE,deep,0.30)
    return dict(seam=hexof(seam),deep=hexof(deep),ink=hexof(ink),onDeepMuted=hexof(muted),
        c_bone_deep=round(cr(BONE,deep),2), c_muted_deep=round(cr(muted,deep),2), c_deep_seam=round(cr(deep,seam),2),
        c_ink_cream=round(cr(ink,CREAM),2), c_ink_seam=round(cr(ink,seam),2), c_gilt_deep=round(cr(GILT_ON_DARK,deep),2), c_esp_seam=round(cr(ESP,seam),2))
photo="negroni aviation clover-club espresso-martini paloma daiquiri paper-plane jungle-bird zombie division-bell saturn bramble boulevardier white-negroni negroni-sbagliato naked-and-famous".split()
out={}
for id in photo:
    s=sample(id); out[id]=tok(*s)
# fallbacks
for id,liq in [("ramos-gin-fizz","cream"),("mezcal-de-pechuga","amber"),("bacanora","amber"),("mezcal-negroni","orange"),("kingston-negroni","orange"),("cynar-negroni","darkBrown")]:
    lab=rgb2oklab(h2rgb(LIQ[liq])); out[id]=tok(lab[0],math.hypot(lab[1],lab[2]),math.atan2(lab[2],lab[1])); out[id]['src']='liquid:'+liq
for k,v in out.items(): print(k, v)
json.dump(out,open('.tokens.json','w'),indent=1)
# brand pairs
pairs=[('#E9E5DF','#3E0A12','bone on wineDeep'),('#D9BF84','#3E0A12','giltOnDark on wineDeep'),('#B08A3E','#3E0A12','gilt on wineDeep'),('#D9BF84','#2B2322','giltOnDark on espresso'),('#A99E94','#2B2322','reelInkDim on reelBar'),('#5B0F1A','#E9E5DF','wine on bone'),('#C9AFA8','#3E0A12','wineMist on wineDeep'),('#7D5F1C','#F7F2EA','giltInk on cream'),('#6A6058','#F7F2EA','textMuted on cream'),('#6A6058','#E3DDD3','textMuted on slot'),('#E9E5DF','#5B0F1A','bone on wine'),('#B9A6A0','#3E0A12','mutedOnCover'),('#F7F2EA','#0E0B0B','reel')]
for a,b,n in pairs: print(n, round(cr(h2rgb(a),h2rgb(b)),2))
