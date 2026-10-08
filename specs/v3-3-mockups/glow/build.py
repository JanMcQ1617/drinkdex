#!/usr/bin/env python3
"""Builds index.html for the v3.3 "glow" direction (Lit glass & tungsten).

Data is real: names and numbers from src/data/drinks.json, My Bar figures from
the matching logic in src/lib/bar.ts run on src/data/barIndex.json, photos
from assets/drinks (relative paths), the per-drink light from img/glow.json
(sampled from each tungsten photo, see spec.md section 3).
Run: python3 build.py   (then ./render.sh)
"""
import json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '../../..'))
A = '../../../assets/drinks/'
F = '../../../assets/fonts/'
D = json.load(open(os.path.join(ROOT, 'src/data/drinks.json')))
BY = {d['id']: d for d in D}
BYNUM = {d['dexNumber']: d for d in D}
GLOW = json.load(open(os.path.join(HERE, 'img/glow.json')))
PHOTOS = set(GLOW)
TOTAL = len(D)

ICE, TUNG = '#A9DDEB', '#E9B26A'

# Light for drinks with no photograph: the vector face's liquid, by subcategory.
SUB_LIGHT = {
    'Gin': ICE, 'Vodka': ICE, 'Genever': ICE, 'Shochu': ICE, 'Rice Spirit': ICE, 'Baijiu': ICE,
    'Grain Spirit': ICE, 'Aquavit': '#D9E7A0', 'Cane Spirit': '#E8D9A8', 'Agave': '#E8D48A',
    'Rum': '#E39A3B', 'Scotch': '#E3A24B', 'American Whiskey': '#E08A35', 'Irish Whiskey': '#E8A955',
    'World Whisky': '#E3A24B', 'Brandy': '#D9813A', 'Fruit Brandy': '#EBC77A', 'Pomace Brandy': '#E8D9A8',
    'Amaro': '#D0603A', 'Herbal Liqueur': '#A8D86A', 'Liqueur': '#ED8E4A', 'Anise Spirit': '#D9EEF2',
    'Fortified': '#C9563F', 'Port': '#C23A44', 'Sherry': '#E3B45A', 'Vermouth': '#D24A4A',
    'World Spirit': '#E9B26A', 'Palm Spirit': '#E8D9A8',
}


def light(d):
    if d['id'] in GLOW:
        return GLOW[d['id']]
    if d['category'] == 'spirit':
        return SUB_LIGHT.get(d['subcategory'], TUNG)
    return '#ED7A45' if hash(d['id']) % 3 else TUNG


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def no(n, cls=''):
    s = f'{n:04d}'
    z = len(s) - len(s.lstrip('0'))
    return f'<span class="no {cls}"><span class="z">#{s[:z]}</span>{s[z:]}</span>'


def photo(i):
    return A + i + '.webp'


def ghost(i):
    return A + 'ghost/' + i + '.webp'


# ------------------------------------------------------------------ icons
IC = {
    'home': '<path d="M3.8 10.4 12 3.8l8.2 6.6V19a1.6 1.6 0 0 1-1.6 1.6h-4.1v-5.8h-5v5.8H5.4A1.6 1.6 0 0 1 3.8 19z"/>',
    'dex': '<path d="M4.2 4.5h15.6L12 12.6z"/><path d="M12 12.6v7.2"/><path d="M8.2 19.8h7.6"/>',
    'plus': '<path d="M12 5.5v13M5.5 12h13"/>',
    'bottle': '<path d="M9.5 2.8h5v4.6c0 .7 3.2 1.4 3.2 3.8v8.2a2 2 0 0 1-2 2H8.3a2 2 0 0 1-2-2v-8.2c0-2.4 3.2-3.1 3.2-3.8z"/><path d="M6.4 13.2h11.2M6.4 16.8h11.2"/>',
    'heart': '<path d="M12 20.2s-7.6-4.6-7.6-10.4A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.6 2.7c0 5.8-7.6 10.4-7.6 10.4z"/>',
    'comment': '<path d="M20.2 11.6a8.2 8.2 0 0 1-12 7.3L3.8 20l1.2-4.1a8.2 8.2 0 1 1 15.2-4.3z"/>',
    'send': '<path d="M2.9 10.9 21.1 4.9 9.1 13.1z"/><path d="M9.1 13.1 21.1 4.9 12.6 19.1z"/>',
    'bookmark': '<path d="M6.6 3.6h10.8v16.8L12 16.6l-5.4 3.8z"/>',
    'search': '<circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.6 4.6"/>',
    'trophy': '<path d="M7.5 4h9v4.2a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.8H4.8a2.7 2.7 0 0 0 2.9 3.6M16.5 5.8h2.7a2.7 2.7 0 0 1-2.9 3.6"/><path d="M12 12.7v3.6"/><path d="M8.6 20.2h6.8l-.8-3.9H9.4z"/>',
    'chevL': '<path d="M14.8 5.2 8 12l6.8 6.8"/>',
    'chevR': '<path d="M9.2 5.2 16 12l-6.8 6.8"/>',
    'chevD': '<path d="M5.2 9.2 12 16l6.8-6.8"/>',
    'lock': '<rect x="5.8" y="10.6" width="12.4" height="9.4" rx="2"/><path d="M8.6 10.6V8.2a3.4 3.4 0 0 1 6.8 0v2.4"/>',
    'check': '<path d="m5.2 12.6 4.4 4.4 9.2-9.6"/>',
    'stats': '<path d="M5 19.5v-6M10 19.5V5.5M15 19.5v-9M20 19.5v-4"/>',
    'menu': '<path d="M4 7.5h16M4 12h16M4 16.5h16"/>',
    'close': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    'grid': '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
    'sort': '<path d="M8 4.5v15M4.8 16.3 8 19.5l3.2-3.2"/><path d="M14 6h6M14 10h4.5M14 14h3"/>',
}
DOTS = '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>'


def ic(name, size=24, cls='', fill=False, sw=1.75):
    if name == 'more':
        return f'<svg class="ic {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="currentColor">{DOTS}</svg>'
    f = 'currentColor' if fill else 'none'
    return (f'<svg class="ic {cls}" width="{size}" height="{size}" viewBox="0 0 24 24" fill="{f}" stroke="currentColor" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{IC[name]}</svg>')


BOTTLE_SOLID = ('<path fill-rule="evenodd" d="M9.5 2.3h5v4.9c0 .5 3.2 1.2 3.2 3.6v8.6a2.3 2.3 0 0 1-2.3 2.3H8.6a2.3 2.3 0 0 1-2.3-2.3v-8.6c0-2.4 3.2-3.1 3.2-3.6zM8.1 13.4v3.2h7.8v-3.2z"/>')

# Ingredient glyphs: the shape the thing comes in.
ING_SHAPE = {
    'spirit': '<path d="M9.6 2.8h4.8v4.4c0 .7 3.1 1.4 3.1 3.8v8.3a1.9 1.9 0 0 1-1.9 1.9H8.4a1.9 1.9 0 0 1-1.9-1.9V11c0-2.4 3.1-3.1 3.1-3.8z"/>',
    'wine': '<path d="M10.2 2.6h3.6v5.3c2.3.8 3.7 2.4 3.7 4.6v7.2a1.7 1.7 0 0 1-1.7 1.7H8.2a1.7 1.7 0 0 1-1.7-1.7v-7.2c0-2.2 1.4-3.8 3.7-4.6z"/>',
    'bitters': '<path d="M10.6 2.6h2.8v2.8h-2.8z"/><path d="M9.6 5.4h4.8v2.1c2 .6 3.1 2.2 3.1 4.3v7.3a1.7 1.7 0 0 1-1.7 1.7H8.2a1.7 1.7 0 0 1-1.7-1.7v-7.3c0-2.1 1.1-3.7 3.1-4.3z"/>',
    'citrus': '<circle cx="12" cy="12" r="8.2"/><path d="M12 5.6v12.8M5.6 12h12.8M7.5 7.5l9 9M16.5 7.5l-9 9" stroke-width="1.1"/>',
    'mixer': '<path d="M6.8 4h10.4l-1.4 15.6a1.5 1.5 0 0 1-1.5 1.4H9.7a1.5 1.5 0 0 1-1.5-1.4z"/><circle cx="10.8" cy="14.6" r="1"/><circle cx="13.4" cy="10.8" r="1"/><circle cx="12.2" cy="17.6" r="1"/>',
    'syrup': '<path d="M8.2 3.6h7.6v2.6H8.2z"/><path d="M7.4 6.2h9.2a1.4 1.4 0 0 1 1.4 1.4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7.6a1.4 1.4 0 0 1 1.4-1.4z"/>',
}


def ing_glyph(kind, colour, lit):
    shape = ING_SHAPE[kind]
    if lit:
        return (f'<span class="ig lit" style="--c:{colour}"><svg width="26" height="26" viewBox="0 0 24 24" '
                f'fill="{colour}" fill-opacity=".92" stroke="{colour}" stroke-width="1.4" stroke-linejoin="round">{shape}</svg></span>')
    return (f'<span class="ig"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            f'stroke-width="1.5" stroke-linejoin="round">{shape}</svg></span>')


# ------------------------------------------------------------------ chrome
def statusbar(light=True):
    c = 'light' if light else ''
    return f'''<div class="sb {c}"><span class="t">9:41</span><span class="island"></span>
<span class="r"><svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor"><rect x="0" y="8" width="3.2" height="4" rx=".8"/><rect x="5" y="5.5" width="3.2" height="6.5" rx=".8"/><rect x="10" y="3" width="3.2" height="9" rx=".8"/><rect x="15" y="0" width="3.2" height="12" rx=".8"/></svg>
<svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor"><path d="M8.5 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8.5.3 10.6 10.6 0 0 0 1 3.4l1.3 1.3a8.8 8.8 0 0 1 6.2-2.5zm0 3.6c1.4 0 2.7.5 3.6 1.5l1.3-1.3A6.9 6.9 0 0 0 8.5 4a6.9 6.9 0 0 0-4.9 2l1.3 1.3a5.1 5.1 0 0 1 3.6-1.5zm0 3.6a1.6 1.6 0 0 0-1.2.5l1.2 1.2 1.2-1.2a1.6 1.6 0 0 0-1.2-.5z"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill="currentColor" fill-opacity=".45"/></svg></span></div>'''


def homeind(light=True):
    return f'<div class="hi {"light" if light else ""}"></div>'


def tabbar(active, compact=False):
    def tab(key, label, glyph):
        on = ' on' if key == active else ''
        return f'<div class="tb{on}"><span class="gl">{glyph}</span><span class="lb">{label}</span></div>'
    homeg = ic('home', 24, fill=(active == 'home'))
    dexg = ic('dex', 24, fill=(active == 'dex'))
    barg = (f'<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">{BOTTLE_SOLID}</svg>'
            if active == 'bar' else ic('bottle', 24))
    face = f'<span class="face{" on" if active == "profile" else ""}">NV</span>'
    return f'''<div class="tabbar{' compact' if compact else ''}"><i class="gr"></i>
{tab('home', 'Home', homeg)}{tab('dex', 'Dex', dexg)}
<div class="tb fabslot"><span class="fab">{ic('plus', 22, sw=2)}</span></div>
{tab('bar', 'My Bar', barg)}{tab('profile', 'Profile', face)}</div>'''


PEOPLE = {
    'nadia.v': ('Nadia Vélez', 'NV', '#5E2545'),
    'marisol.r': ('Marisol Rivera', 'MR', '#7E2330'),
    'andres.v': ('Andrés Vega', 'AV', '#8A5F10'),
    'cami.lugo': ('Camila Lugo', 'CL', '#3A2E2C'),
    'dlopez': ('Diego López', 'DL', '#736247'),
    'tomas.b': ('Tomás Báez', 'TB', '#5B0F1A'),
    'gabi.ortiz': ('Gabriela Ortiz', 'GO', '#7E2330'),
    'lu.mercado': ('Lucía Mercado', 'LM', '#5E2545'),
    'javi.c': ('Javier Colón', 'JC', '#3A2E2C'),
    'sofi.n': ('Sofía Nieves', 'SN', '#5B0F1A'),
}
LIGHT_INITIALS = {'#8A5F10', '#736247'}  # these two accents take reelInk (5.55, 5.79) not onLining (4.49, 4.69)


def avatar(user, size, cls='', initial=False):
    _, ini, acc = PEOPLE[user]
    if initial:
        ini = ini[0]
    ink = '#FFFDF9' if acc in LIGHT_INITIALS else '#E9E5DF'
    fs = max(11, round(size * 0.4))
    return f'<span class="av {cls}" style="width:{size}px;height:{size}px;background:{acc};color:{ink};font-size:{fs}px;line-height:{size}px">{ini}</span>'


# ------------------------------------------------------------------ collection (Nadia's Dex)
random.seed(1617)
COLLECTED = {1, 4, 5, 7, 8, 11, 13, 16, 17, 20, 23, 24, 25, 33, 47, 52, 92, 93, 97, 99, 100, 104, 106, 107, 108,
             110, 112, 113, 117, 118, 122, 124, 126, 127, 128, 129, 131, 135, 137, 145}
pool = [n for n in range(1, 161) if n not in COLLECTED]
COLLECTED |= set(random.sample(pool, 32))
rest = [n for n in range(161, TOTAL + 1)]
weights = [3 if n < 700 else 1 for n in rest]
while len(COLLECTED) < 137:
    COLLECTED.add(random.choices(rest, weights)[0])
assert len(COLLECTED) == 137


def spectrum(width, height, cls=''):
    """The Dex as a strip: every drink you have, at its number, in its own light."""
    segs = []
    for n in sorted(COLLECTED):
        x = (n - 1) / TOTAL * width
        segs.append(f'<rect x="{x:.2f}" y="0" width="2" height="{height}" fill="{light(BYNUM[n])}"/>')
    return (f'<svg class="spec {cls}" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
            f'{"".join(segs)}</svg>')


# ------------------------------------------------------------------ 1 HOME
def story(user, drink=None, seen=False, own=False):
    name = PEOPLE[user][0]
    label = 'You' if own else user
    if own:
        inner = avatar(user, 57)
        return f'''<div class="st"><div class="ring seen own"><div class="disc">{inner}</div>
<span class="badge">{ic('plus', 14, sw=2.4)}</span></div><div class="sl">{label}</div></div>'''
    g = light(BY[drink])
    cls = 'seen' if seen else 'unseen'
    return f'''<div class="st"><div class="ring {cls}" style="--g:{g}"><div class="disc"><img src="{photo(drink)}" alt=""></div></div>
<div class="sl {'dim' if seen else ''}">{label}</div></div>'''


def print_card(drink, w, h, extra_cls='', dexmark=True):
    d = BY[drink]
    g = light(d)
    sub = {'Spirit-Forward': 'Spirit-forward', 'Creamy & Dessert': 'Creamy and dessert'}.get(d['subcategory'], d['subcategory'])
    mark = f'<span class="plate glass tr">{ic("check", 14, sw=2.2, cls="ice")}In your Dex</span>' if dexmark else ''
    return f'''<div class="printwrap {extra_cls}" style="--g:{g};width:{w}px">
<div class="print" style="width:{w}px;height:{h}px"><img src="{photo(drink)}" alt="">
<span class="plate glass tl">{no(d['dexNumber'], 'onglass')}</span>{mark}
<div class="nameplate glass"><div class="pname">{esc(d['name'])}</div><div class="psub">{sub} · {esc(d['origin'])}</div></div>
</div></div>'''


def home():
    rail = ''.join([
        story('nadia.v', own=True),
        story('marisol.r', 'negroni'),
        story('andres.v', 'aperol-spritz'),
        story('cami.lugo', 'grasshopper'),
        story('dlopez', 'aviation'),
        story('tomas.b', 'espresso-martini', seen=True),
    ])
    return f'''<div class="screen home">
<div class="band lin pools-home">
{statusbar(True)}
<div class="topbar">
  <span class="gb">{ic('plus', 26)}</span>
  <span class="wordmark">Sipply</span>
  <span class="right"><span class="gb">{ic('trophy', 25)}</span><span class="gb">{ic('heart', 25)}<i class="dot"></i></span></span>
</div>
<div class="stories">{rail}</div>
<div class="shelf"></div>
</div>
<div class="post">
  <div class="author">{avatar('marisol.r', 34)}<div class="an"><b>marisol.r</b><span>Poured at home</span></div><span class="gb dim">{ic('more', 22)}</span></div>
  {print_card('negroni', 372, 465)}
  <div class="actions">
    <span class="act liked">{ic('heart', 26, fill=True)}<b>13</b></span>
    <span class="act">{ic('comment', 25)}<b>4</b></span>
    <span class="act">{ic('send', 25)}</span>
    <span class="act end">{ic('bookmark', 25)}</span>
  </div>
  <div class="likes"><span class="stack">{avatar('andres.v', 24, initial=True)}{avatar('cami.lugo', 24, initial=True)}{avatar('dlopez', 24, initial=True)}</span>
    <span>Liked by <b>andres.v</b> and <b class="u">12 others</b></span></div>
  <div class="cap"><b>marisol.r</b> Saturday's first. Equal parts, stirred long over one big rock.</div>
</div>
{tabbar('home')}
{homeind(False)}
</div>'''


def home_scrolled():
    """Jan likes the scrolled look except the gradient: the bar comes back as a hard-edged pane."""
    return f'''<div class="screen home scrolled">
<div class="post" style="padding-top:62px">
  <div style="height:14px"></div>
  {print_card('negroni', 372, 465)}
  <div class="actions">
    <span class="act liked">{ic('heart', 26, fill=True)}<b>13</b></span>
    <span class="act">{ic('comment', 25)}<b>4</b></span>
    <span class="act">{ic('send', 25)}</span>
    <span class="act end">{ic('bookmark', 25)}</span>
  </div>
  <div class="likes"><span class="stack">{avatar('andres.v', 24, initial=True)}{avatar('cami.lugo', 24, initial=True)}{avatar('dlopez', 24, initial=True)}</span>
    <span>Liked by <b>andres.v</b> and <b class="u">12 others</b></span></div>
  <div class="cap"><b>marisol.r</b> Saturday's first. Equal parts, stirred long over one big rock.</div>
  <div class="when">2 hours ago</div>
  <div class="author" style="margin-top:14px">{avatar('cami.lugo', 34)}<div class="an"><b>cami.lugo</b><span>Poured at La Penúltima</span></div><span class="gb dim">{ic('more', 22)}</span></div>
  {print_card('grasshopper', 372, 465, dexmark=True)}
</div>
<div class="pane wineglass"><i class="gr"></i>
{statusbar(True)}
<div class="topbar">
  <span class="gb">{ic('plus', 26)}</span>
  <span class="wordmark">Sipply</span>
  <span class="right"><span class="gb">{ic('trophy', 25)}</span><span class="gb">{ic('heart', 25)}<i class="dot"></i></span></span>
</div>
</div>
{tabbar('home')}
{homeind(False)}
</div>'''


# ------------------------------------------------------------------ 2 DEX
def dex_card(n):
    d = BYNUM[n]
    have = n in COLLECTED
    g = light(d)
    if have:
        return f'''<div class="dc have" style="--g:{g}">
<div class="lab">{no(n)}<div class="dn">{esc(d['name'])}</div></div>
<div class="win"><img src="{photo(d['id'])}" alt=""><i class="cau"></i></div>
<div class="spill"></div></div>'''
    return f'''<div class="dc">
<div class="lab">{no(n, 'onlining')}<span class="lk">{ic('lock', 13, sw=2)}</span><div class="dn">{esc(d['name'])}</div></div>
<div class="win"><img src="{ghost(d['id'])}" alt=""></div></div>'''


def dex():
    rows = []
    for r in range(4):
        cards = ''.join(dex_card(n) for n in range(r * 3 + 1, r * 3 + 4))
        rows.append(f'<div class="drow">{cards}</div><div class="shelf dshelf"></div>')
    ticks = ''.join(f'<i style="top:{i * 12}px" class="{"long" if i % 5 == 0 else ""}"></i>' for i in range(0, 43))
    labels = ''.join(f'<span style="top:{y}px">{t}</span>' for t, y in [('1', -7), ('500', 113), ('1000', 233), ('1500', 353), ('2089', 497)])
    return f'''<div class="screen dex lin pools-dex">
{statusbar(True)}
<div class="topbar lining"><span class="title">Dex</span><span class="right"><span class="gb">{ic('stats', 24)}</span></span></div>
<div class="dexhead">
  <div class="figrow"><span class="fig">137</span><span class="of">of 2,089 in your Dex</span><span class="pct">6.6%</span></div>
  <div class="spectrack">{spectrum(406, 14)}</div>
  <div class="specends"><span>{no(1, 'onlining')}</span><span class="mid">each mark is a drink you have, at its number</span><span>{no(2089, 'onlining')}</span></div>
</div>
<div class="search glass-field">{ic('search', 20)}<span>Search by name, or type a number</span></div>
<div class="chips">
  <span class="lchip on">All <span class="n">2,089</span></span>
  <span class="lchip">Cocktails <span class="n">899</span></span>
  <span class="lchip">Spirits <span class="n">1,190</span></span>
  <span class="vr"></span>
  <span class="lchip ice">{ic('check', 14, sw=2.2)}In your Dex <span class="n">137</span></span>
  <span class="lchip">Not yet <span class="n">1,952</span></span>
</div>
<div class="grid">{''.join(rows)}</div>
<div class="scrub"><div class="track">{ticks}</div><div class="slabels">{labels}</div><div class="meniscus"></div></div>
{tabbar('dex')}
{homeind(True)}
</div>'''


# ------------------------------------------------------------------ 3 MY BAR
CHECKLIST = [  # barIndex.json order (uses), the first eight; reach = drinks it can go into (lib/bar.ts reachOf)
    ('Lemon', 173, 'citrus', '#F2D14B', True),
    ('Gin', 168, 'spirit', ICE, True),
    ('Lime', 164, 'citrus', '#A6D052', True),
    ('Soda water', 83, 'mixer', '#CFEFF5', True),
    ('Orange', 82, 'citrus', '#F0922E', True),
    ('Angostura bitters', 78, 'bitters', '#D0553A', True),
    ('Sweet vermouth', 76, 'wine', '#D24A4A', True),
    ('Dry vermouth', 70, 'wine', '#E6D58A', False),
]


def bar():
    tiles = ''.join(f'''<div class="itile{' on' if on else ''}">{ing_glyph(kind, col, on)}
<div class="it"><b>{name}</b><span>in {n} drinks</span></div>
<span class="cb{' on' if on else ''}">{ic('check', 15, sw=2.6) if on else ''}</span></div>''' for name, n, kind, col, on in CHECKLIST)
    make = ['negroni', 'old-fashioned', 'boulevardier', 'americano', 'mojito', 'daiquiri']
    rail = ''.join(f'''<div class="mk" style="--g:{light(BY[i])}"><i class="spillb"></i><div class="mph"><img src="{photo(i)}" alt=""><i class="cau"></i></div>
<div class="mname">{esc(BY[i]['name'])}</div>{no(BY[i]['dexNumber'], 'onlining')}</div>''' for i in make)
    return f'''<div class="screen bar lin pools-bar">
{statusbar(True)}
<div class="topbar lining"><span class="title">My Bar</span></div>
<div class="barbody">
<div class="barhead">
  <div><div class="q">What's in your bar?</div><div class="qs">Tick what you have. The most useful come first.</div></div>
  <div class="tally"><b>14</b><span>ticked</span></div>
</div>
<div class="search glass-field">{ic('search', 20)}<span>Search 490 ingredients</span></div>
<div class="chips">
  <span class="lchip on">Most useful</span><span class="lchip">Spirits</span><span class="lchip">Liqueurs</span>
  <span class="lchip">Citrus</span><span class="lchip">Bitters</span><span class="lchip">Mixers</span>
</div>
<div class="checklist">{tiles}</div>
<div class="showall">Show all 490 ingredients {ic('chevD', 16, sw=2)}</div>
<div class="makehead"><span class="h">You can make</span><span class="big">44</span><span class="h2">drinks</span><span class="see">See all {ic('chevR', 14, sw=2)}</span></div>
<div class="makewrap"><div class="makerail">{rail}</div><div class="shelf mshelf"></div></div>
<div class="awayhead"><span class="h">One ingredient away</span><span class="sub">Add one bottle and these pour too</span></div>
<div class="away">
  <div class="arow"><div class="ath"><img src="{ghost('martini')}" alt=""></div>
    <div class="at"><b>Dry vermouth</b><span>pours 11 more, like <i class="nm">Martini</i> and <i class="nm">Bronx</i></span></div>
    <span class="addbtn">{ic('plus', 15, sw=2.2)}Add</span></div>
</div>
</div>
{tabbar('bar')}
{homeind(True)}
</div>'''


# ------------------------------------------------------------------ 4 POST + LIKERS SHEET
LIKER_STORY = {'andres.v': 'aperol-spritz', 'cami.lugo': 'grasshopper', 'dlopez': 'aviation'}
LIKERS = [
    ('andres.v', '2h', True, 'following'),
    ('cami.lugo', '2h', False, 'following'),
    ('dlopez', '1h', True, 'following'),
    ('tomas.b', '48m', False, 'following'),
    ('gabi.ortiz', '1h', True, 'follow'),
    ('lu.mercado', '33m', False, 'follow'),
    ('javi.c', '20m', True, 'follow'),
]


def post_detail():
    d = BY['negroni']
    g = light(d)
    rows = []
    for i, (u, t, index, f) in enumerate(LIKERS):
        name = PEOPLE[u][0]
        tag = f'<span class="itag">{ic("check", 12, sw=2.4)}{no(127, "onice")} in their Dex</span>' if index else ''
        btn = ('<span class="fbtn out">Following</span>' if f == 'following' else '<span class="fbtn bone">Follow</span>')
        sect = ''
        if i == 0:
            sect = '<div class="lsect">People you follow <span>4</span></div>'
        if i == 4:
            sect = '<div class="lsect">Others <span>9</span></div>'
        ring = (f'<span class="sring" style="--g:{light(BY[LIKER_STORY[u]])}">{avatar(u, 44)}</span>' if u in LIKER_STORY else f'<span class="noring">{avatar(u, 44)}</span>')
        rows.append(f'''{sect}<div class="lrow">{ring}<div class="lt"><b>{name}</b><span>{u} · liked {t} ago</span>{tag}</div>{btn}</div>''')
    return f'''<div class="screen post-detail" style="--g:{g}">
<div class="pd-photo"><img src="{photo('negroni')}" alt=""></div>
<div class="pane frost" style="--g:{g}"><div class="frostimg"><img src="{photo('negroni')}" alt=""></div><i class="tint"></i><i class="gr"></i>
{statusbar(True)}
<div class="topbar"><span class="gb">{ic('chevL', 26)}</span><span class="title">Post</span><span class="right"><span class="gb">{ic('more', 24)}</span></span></div>
</div>
<span class="plate glass" style="position:absolute;left:16px;top:122px">{no(127, 'onglass')}</span>
<div class="dim"></div>
<div class="sheet" style="--g:{g}">
  <div class="frostimg"><img src="{photo('negroni')}" alt=""></div><i class="tint"></i><i class="gr"></i><i class="edge"></i>
  <div class="grab"></div>
  <div class="shead"><span class="sp"></span><div class="stitle">{ic('heart', 18, fill=True, cls='rose')}Liked by 13</div><span class="done">Done</span></div>
  <div class="ssub"><i class="nm">Negroni</i> {no(127, 'onlining')} · marisol.r's post</div>
  <div class="search glass-field sm">{ic('search', 18)}<span>Search 13 people</span></div>
  {''.join(rows)}
</div>
{homeind(True)}
</div>'''


# ------------------------------------------------------------------ 5 PROFILE
GRID = ['aviation', 'negroni', 'aperol-spritz', 'grasshopper', 'paper-plane', 'clover-club', 'mai-tai',
        'blue-hawaii', 'french-75', 'last-word', 'jungle-bird', 'cosmopolitan']


def profile():
    tiles = ''.join(f'''<div class="gt" style="--g:{light(BY[i])}"><img src="{photo(i)}" alt="">
<span class="marker">{no(BY[i]['dexNumber'], 'onglass')}</span><i class="key"></i></div>''' for i in GRID)
    av = light(BY['aviation'])
    return f'''<div class="screen profile">
<div class="pband lin pools-profile">
{statusbar(True)}
<div class="topbar lining"><span class="title">nadia.v</span><span class="right"><span class="gb">{ic('menu', 24)}</span></span></div>
<div class="phead">
  <div class="halo" style="--g:{av}">{avatar('nadia.v', 84)}</div>
  <div class="counts">
    <div><b>64</b><span>posts</span></div><div><b>312</b><span>followers</span></div><div><b>287</b><span>following</span></div>
  </div>
</div>
<div class="pname2">Nadia Vélez</div>
<div class="bio">Santurce. Amaro first, questions later.</div>
<div class="dexpanel">
  <div class="dprow"><span class="lbl">Dex</span><span class="dfig">137</span><span class="dof">of 2,089</span><span class="dpct">6.6%</span></div>
  <div class="spectrack sm">{spectrum(374, 12)}</div>
  <div class="latest"><span class="lth" style="--g:{av}"><img src="{photo('aviation')}" alt=""></span>
    <span>Latest catch <i class="nm">Aviation</i> {no(92, 'onlining')}</span><span class="ago">3 days ago</span></div>
</div>
<div class="pbtns"><span class="obtn">Edit profile</span><span class="obtn">Share profile</span></div>
</div>
<div class="tstrip"><span class="ts on">{ic('grid', 20)}Posts <b>64</b></span><span class="ts">{ic('dex', 20)}Dex <b>137</b></span></div>
<div class="pgrid">{tiles}</div>
{tabbar('profile')}
{homeind(False)}
</div>'''


# ------------------------------------------------------------------ legend
SWATCHES = [
    ('Paper', '#F7F2EA', 'ground, unchanged'), ('Lining', '#3E0A12', 'ground, unchanged'), ('Cellar', '#2F070D', 'ground, unchanged'),
    ('Tungsten', '#E9B26A', '8.78 on lining'), ('Tungsten ink', '#8A5A12', '5.31 on paper'),
    ('Ice', '#A9DDEB', '11.32 on lining'), ('Ice ink', '#1B5868', '7.13 on paper'),
    ('Rose', '#D9848E', 'glyph, 6.08 on lining'), ('Smoke glass', 'rgba(24,14,16,.84)', 'tab bar, plates'),
    ('Wine glass', 'rgba(47,7,13,.95)', 'bars when scrolled'),
]


def legend():
    sw = ''.join(f'<div class="sw"><i style="background:{c}"></i><b>{n}</b><span>{c}</span><em>{note}</em></div>' for n, c, note in SWATCHES)
    drinks = ['negroni', 'aperol-spritz', 'grasshopper', 'aviation', 'blue-hawaii', 'mojito', 'clover-club', 'french-75', 'gin-fizz', 'espresso-martini', 'last-word', 'cosmopolitan']
    gl = ''.join(f'<div class="gl1" style="--g:{light(BY[i])}"><span class="gimg"><img src="{photo(i)}" alt=""></span><b>{esc(BY[i]["name"])}</b><span>{light(BY[i])}</span></div>' for i in drinks)
    return f'''<div class="legend"><div class="lcol"><h3>The new inks</h3><div class="sws">{sw}</div></div>
<div class="lcol"><h3>Each drink's own light, sampled from its photo</h3><div class="gls">{gl}</div></div></div>'''


FRAMES = [
    ('home', '1 Home', 'the feed at rest', home),
    ('dex', '2 Dex', 'one grid, by number', dex),
    ('bar', '3 My Bar', 'what is in your bar', bar),
    ('post', '4 Post', 'who liked it', post_detail),
    ('profile', '5 Profile', 'your Dex in colour', profile),
    ('scrolled', 'Home, scrolled up', 'a hard-edged pane, no fade', home_scrolled),
]

CSS = open(os.path.join(HERE, 'style.css')).read().replace('{F}', F)

html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sipply Glow</title>
<style>{CSS}</style></head>
<body>
<div class="wallhead"><h1>Sipply v3.3 · Lit glass and tungsten</h1><p>Light is the detail: every drink casts its own colour, lamps pool amber on the lining, chrome is smoked glass with a hard edge, and ice is the cool accent against wine and bone.</p></div>
<div class="wall">
{''.join(f'<div class="frame" id="f-{k}"><h2>{t} <span>{s}</span></h2>{fn()}</div>' for k, t, s, fn in FRAMES)}
</div>
{legend()}
<script>
(function(){{var h=location.hash.slice(1);if(!h)return;document.body.classList.add('solo');var f=document.getElementById('f-'+h);if(f)f.classList.add('on');}})();
</script>
</body></html>'''

open(os.path.join(HERE, 'index.html'), 'w').write(html)
print('index.html', len(html), 'bytes;', 'collected', len(COLLECTED))
