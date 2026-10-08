#!/usr/bin/env python3
"""Every text/glyph pair in the glow mockups, WCAG 2.x. Prints a markdown table for spec.md."""
import json, math
def hx(s): s=s.lstrip('#'); return tuple(int(s[i:i+2],16) for i in (0,2,4))
def over(fg,bg):
    r,g,b,a=fg; return tuple(round(a*c+(1-a)*d) for c,d in zip((r,g,b),bg))
def lum(c):
    f=lambda v:(v/255)/12.92 if v/255<=0.04045 else ((v/255+0.055)/1.055)**2.4
    return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])
def cr(a,b):
    x,y=sorted((lum(a),lum(b)),reverse=True); return (x+0.05)/(y+0.05)
H=lambda c:'#%02X%02X%02X'%c
W=(255,255,255)
paper,mat,lining,cellar=hx('F7F2EA'),hx('FBF8F2'),hx('3E0A12'),hx('2F070D')
liningG,cellarG,paperG=hx('4B1B23'),hx('3E191E'),hx('EFEBE3')   # worst grain pixels (v3 spec 4)
text,muted,taupeInk,wine=hx('2B2322'),hx('6A6058'),hx('736247'),hx('5B0F1A')
onL,onLM,onLF=hx('E9E5DF'),hx('B8A09B'),hx('A7837F')
reelInk,reelDim=hx('FFFDF9'),hx('A99E94')
tung,tungInk,ice,iceInk,rose,gim=hx('E9B26A'),hx('8A5A12'),hx('A9DDEB'),hx('1B5868'),hx('D9848E'),hx('C9BDB6')
smoke=(24,14,16,.84); wineglass=(47,7,13,.95); marker=(14,11,11,.78); sheet=(30,12,16,.86); frostpane=(47,7,13,.74)
pool=(233,178,106,.12)
G={
 'lining':lining,'cellar':cellar,'lining, worst grain':liningG,'cellar, worst grain':cellarG,'paper':paper,'paper, worst grain':paperG,'mat':mat,
 'smoke glass over white':over(smoke,W),'smoke glass over paper':over(smoke,paper),
 'wine glass over white':over(wineglass,W),
 'marker over white':over(marker,W),
 'sheet tint over a white blur':over(sheet,W),
 'frosted bar tint over a white blur':over(frostpane,W),
 'lamp pool peak over worst lining grain':over(pool,liningG),
 'glass tile over worst lining grain':over((255,253,249,.06),liningG),
 'field (.32 smoke) over lining':over((14,11,11,.32),lining),
 'ice tag over sheet over white':over((169,221,235,.08),over(sheet,W)),
 'ice button fill over lining':over((169,221,235,.06),lining),
 'tally / panel (.30 smoke) over worst lining grain':over((14,11,11,.30),liningG),
 'tungsten wash (paper)':hx('F7E9D2'),
}
rows=[
 # (text, ground, target, use)
 ('tungsten',tung,'lining',4.5,'"You can make 44", "6.6%", tally figure'),
 ('tungsten',tung,'lining, worst grain',4.5,''),
 ('tungsten',tung,'lamp pool peak over worst lining grain',4.5,'a figure inside a pool'),
 ('tungsten',tung,'tally / panel (.30 smoke) over worst lining grain',4.5,'tally, Dex panel %'),
 ('tungsten',tung,'cellar',4.5,''),
 ('tungsten ink',tungInk,'paper',4.5,'figures on paper (Profile tab counts)'),
 ('tungsten ink',tungInk,'paper, worst grain',4.5,''),
 ('tungsten ink',tungInk,'mat',4.5,''),
 ('ice',ice,'lining',4.5,'"+ Add", chip check, glyphs'),
 ('ice',ice,'lining, worst grain',4.5,''),
 ('ice',ice,'ice button fill over lining',4.5,'"+ Add" label'),
 ('ice',ice,'ice tag over sheet over white',4.5,'"#0127 in their Dex" tag'),
 ('ice',ice,'marker over white',4.5,'check on the "In your Dex" plate'),
 ('ice',ice,'smoke glass over white',3.0,'active-tab filament (UI)'),
 ('ice ink',iceInk,'paper',4.5,'ice on paper (tags, links)'),
 ('ice ink',iceInk,'paper, worst grain',4.5,''),
 ('ice ink',iceInk,'mat',4.5,''),
 ('rose',rose,'lining, worst grain',3.0,'heart glyph, unread dot (glyph only)'),
 ('rose',rose,'sheet tint over a white blur',3.0,'heart in the sheet title'),
 ('onLining',onL,'sheet tint over a white blur',4.5,'sheet titles, names'),
 ('onLiningMuted',onLM,'sheet tint over a white blur',4.5,'sheet secondary text'),
 ('onLining',onL,'frosted bar tint over a white blur',4.5,'post page bar title, glyphs'),
 ('onLining',onL,'wine glass over white',4.5,'scrolled bars'),
 ('onLiningMuted',onLM,'wine glass over white',4.5,''),
 ('onLiningMuted',onLM,'lamp pool peak over worst lining grain',4.5,'muted text inside a pool'),
 ('onLining',onL,'lamp pool peak over worst lining grain',4.5,''),
 ('onLiningMuted',onLM,'glass tile over worst lining grain',4.5,'"in 173 drinks"'),
 ('onLiningMuted',onLM,'field (.32 smoke) over lining',4.5,'search placeholder'),
 ('onLiningMuted',onLM,'tally / panel (.30 smoke) over worst lining grain',4.5,'Dex panel text'),
 ('onLiningMuted',onLM,'cellar, worst grain',4.5,'not-yet card name and number'),
 ('onLiningFaint',onLF,'cellar, worst grain',3.0,'lock glyph (glyph only)'),
 ('reelInk',reelInk,'marker over white',4.5,'plates and markers over photos'),
 ('glassInkMuted',gim,'marker over white',4.5,'nameplate subline over photos'),
 ('reelInk',reelInk,'smoke glass over white',4.5,'active tab label'),
 ('reelInkDim',reelDim,'smoke glass over white',4.5,'resting tab labels'),
 ('reelInkDim',reelDim,'smoke glass over paper',4.5,''),
 ('text',text,'mat',4.5,'collected card name'),
 ('taupeInk',taupeInk,'mat',4.5,'padding zeros of "#0001" on mat'),
 ('lining',lining,None,4.5,'bone checkbox tick, Follow label'),
 ('muted',muted,'tungsten wash (paper)',4.5,'(reserved: a lit row on paper)'),
]
out=['| Text | Ground (composited) | Hex of ground | Ratio | Needs | Where |','|---|---|---|---|---|---|']
fails=0
for name,fg,gname,t,use in rows:
    if gname is None:
        bg=onL; gname='onLining (bone fill)'
    else: bg=G[gname]
    r=cr(fg,bg); ok=r>=t; fails+= not ok
    out.append(f'| {name} `{H(fg)}` | {gname} | `{H(bg)}` | {r:.2f} | {t} | {use} |')
print('\n'.join(out)); print('\nFAILS:',fails)
# per-drink light as a story ring (UI 3:1) on the worst lining grain
glow=json.load(open('img/glow.json'))
worst=min(glow.items(),key=lambda kv:cr(hx(kv[1]),liningG))
print('worst drink light on worst lining grain:',worst,round(cr(hx(worst[1]),liningG),2))
below=[k for k,v in glow.items() if cr(hx(v),liningG)<3.0]
print('below 3:1:',below)
# paper spill at the first text line: boxShadow 0 20 40 -12 alpha .62 (sigma 20)
def cov(d,sig): return 0.5*math.erfc(d/(sig*math.sqrt(2)))
for d in (12,24,40,56):
    a=.62*cov(d-(20-12),20)+.36*cov(d+2,17)
    print('spill alpha',d,'pt below the print:',round(a,3))
for gl in ['ED352F','ED3D2F','2FD5ED','7788ED']:
    sp=over(hx(gl)+(0.10,),paperG); print('muted on 0.10',gl,'spill over worst paper grain',round(cr(muted,sp),2),'text',round(cr(text,sp),2))
