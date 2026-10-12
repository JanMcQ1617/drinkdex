import sys
def lin(c):
    c=c/255
    return c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
def L(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16) for i in (0,2,4)]
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def comp(fg,a,bg):
    f=[int(fg.lstrip('#')[i:i+2],16) for i in (0,2,4)]; b=[int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4)]
    return '#%02X%02X%02X'%tuple(round(f[i]*a+b[i]*(1-a)) for i in range(3))
def cr(a,b):
    la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
pairs=[l.split() for l in sys.stdin.read().strip().splitlines() if l.strip() and not l.startswith('//')]
for p in pairs:
    fg,bg=p[0],p[1]
    if '@' in fg:
        h,a=fg.split('@'); fg2=comp(h,float(a),bg); print(f"{p[0]:>14} on {bg}  -> {fg2}  {cr(fg2,bg):6.2f}  {' '.join(p[2:])}")
    else:
        print(f"{fg:>14} on {bg}  {cr(fg,bg):6.2f}  {' '.join(p[2:])}")
