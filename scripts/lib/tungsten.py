"""
The tungsten re-light of the catalogue photographs (specs/v3-cabinet.md §8.2).

The masters are bright studio shots on a cool grey seamless. This re-lights
each one as a drink under one warm pool of tungsten, against a wall that
falls off into the cellar ground and settles to it at every edge, so a
full-bleed photo meets the app's liningDeep with no seam and a windowed one
reads as a lit print. From the lit result it also bakes the ghost: the 256px
embossed impression a locked Dex slot shows.

A port of specs/v3-mockups/cellar/grade.py with the spec's three changes:
  1. stray highlights (napkins, sugar piles, stone the backdrop mask lets
     through) are replaced by a mask-free wash, so nothing glows away from
     the glass;
  2. edges settle to the job's `settle` colour (colors.liningDeep, read from
     theme.ts by the node script) rather than grade.py's #140E0D;
  3. the ghost bake, which grade.py did not have.
Run over all 162 masters, four of the spec's numbers did not hold, and each
is corrected where it is defined, with what was measured: the settle curve
(settle_weight), the stray trigger (STRAY_ONSET), and two places where
grade.py's mask let the studio backdrop through as a pale disc behind the
glass (backdrop_saturation, backdrop_sweep). The ghost's edge also settles
to the ground, as the lit photo's does (ghost says why).

Run by scripts/build-drink-photos.mjs, not by hand. The node script owns
every input (colours, sizes, per-photo overrides, gate thresholds) and
passes them in the job file, so nothing here has a default of its own that
could drift from theme.ts:

  python3 scripts/lib/tungsten.py --job <job.json> --out <dir>

Writes each photo's `lit` and `ghost` path as lossless PNG (node encodes the
WebP), <out>/metrics.json with the gate flags, and, when the job asks for
QA, the two contact sheets. Needs numpy and Pillow.
"""
import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

F = np.float32

# Rec. 709 luminance weights, on linear light.
LUMA = np.array([0.2126, 0.7152, 0.0722], F)

# grade.py's warm cast on the subject, and a slightly gentler one for the
# wash, which already carries the wall's colour.
SUBJECT_TINT = np.array([1.06, 0.98, 0.88], F)
WASH_TINT = np.array([1.00, 0.97, 0.90], F)

# The light pool (step 2) and the wider pool the wash uses (step 5).
POOL_R = (0.40, 0.46)
WASH_R = (0.42, 0.50)
# Inside this much pool light the glass is assumed and nothing is washed:
# core = clip((pool - 0.40) / 0.30).
CORE = (0.40, 0.30)
# A pixel counts as "inside the core" for the QA metrics where core is full.
CORE_FULL = 0.70

# Step 5's trigger: m = clip((L(out) / L(wash) - ONSET) / SPAN).
#
# The spec's numbers (onset 1.5, span 1.0) miss the commonest stray: stone
# the backdrop mask only partly takes. Stone sits at saturation 0.06 to
# 0.12, right on the mask's ramp, so 5% to 40% of the ungraded subject
# leaks through in speckles, and the subject is about 7x brighter than the
# wall there. A 10% leak lifts a pixel only 1.6x over the wash, so at 1.5
# the White Negroni, Zombie and Negroni tables kept pale, speckled patches.
# Pure wall (mask above 0.995) measures 0.76 to 1.08x the wash, and never
# above 1.10, over 17M pixels of every sixth master, so 1.1 is the lowest
# onset that still leaves the wall alone.
STRAY_ONSET, STRAY_SPAN, STRAY_GAIN = 1.10, 0.40, 1.5

# The outer ring the seam gate measures, as a fraction of the frame (§8.3).
RING = 0.01


# ---------------------------------------------------------------- colour


def hex_srgb(h):
    h = h.lstrip('#')
    if len(h) != 6:
        raise ValueError(f'not a #RRGGBB colour: {h!r}')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], F) / 255.0


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(F)


def lin_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055).astype(F)


def luminance(lin):
    return lin @ LUMA


def clip01(a):
    return np.clip(a, 0, 1)


def mix(a, b, t):
    """a where t is 0, b where t is 1. t is a 2-D weight."""
    t = t[..., None] if t.ndim == a.ndim - 1 else t
    return a + (b - a) * t


def to8(srgb):
    return (clip01(srgb) * 255 + 0.5).astype(np.uint8)


# ---------------------------------------------------------------- geometry


def blur(a, sigma):
    """Separable Gaussian, reflected at the edges. sigma in pixels, as
    Pillow's GaussianBlur(radius) that grade.py used, but kept in float so
    the masks are not quantised to 8 bits between steps."""
    r = max(1, int(3 * sigma + 0.5))
    x = np.arange(-r, r + 1, dtype=F)
    k = np.exp(-x * x / (2 * sigma * sigma))
    k /= k.sum()
    h, w = a.shape
    p = np.pad(a, ((r, r), (0, 0)), mode='reflect')
    v = np.zeros_like(a)
    for i, kw in enumerate(k):
        v += kw * p[i:i + h]
    p = np.pad(v, ((0, 0), (r, r)), mode='reflect')
    out = np.zeros_like(a)
    for i, kw in enumerate(k):
        out += kw * p[:, i:i + w]
    return out


def grid(h, w):
    """Pixel centres as fractions of the frame, so the frame is symmetric:
    grade.py's xx/w put the left edge at 0 and the right one at 1 - 1/w."""
    yy, xx = np.mgrid[0:h, 0:w].astype(F)
    return (xx + 0.5) / w, (yy + 0.5) / h


def light_pool(x, y, cx, cy, rx, ry):
    dx = (x - cx) / rx
    dy = (y - cy) / ry
    return np.exp(-(dx * dx + dy * dy) * 1.1).astype(F)


def edge_distance(x, y):
    """Distance to the nearest frame edge, as a fraction of the frame."""
    return np.minimum(np.minimum(x, 1 - x), np.minimum(y, 1 - y))


def backdrop_saturation(srgb, h):
    """Saturation measured against the seamless's own colour, for the mask.

    grade.py's mask calls a pixel wall when it is unsaturated (below 0.06,
    gone by 0.20). That assumes a neutral grey seamless. Thirteen masters are
    shot on a tinted one, mostly warm beige (Carajillo 0.092, Aperol Spritz
    0.079, Bahama Mama 0.079 at the top of the frame), so the whole wall sat
    on the ramp and up to 20% of the ungraded subject leaked through it. The stray wash cleans
    that up everywhere except the core, where it must not touch the glass, so
    each of those photos showed a pale disc exactly the shape of the core.

    Dividing by the backdrop's median colour first makes the seamless read
    as neutral whatever its tint. On a grey seamless that is grade.py's own
    measure, so the other 149 masters are unchanged in kind.
    """
    backdrop = np.median(srgb[: h // 8].reshape(-1, 3), 0)
    rel = srgb / np.maximum(backdrop, 1e-3)
    mx, mn = rel.max(2), rel.min(2)
    return (mx - mn) / np.maximum(mx, 1e-4)


def backdrop_sweep(lum, bsat, bg, pool, n=64):
    """The seamless's brightness across the frame, as a smooth surface.

    grade.py keeps anything brighter than 1.4x `bg` near the glass as a
    highlight, with `bg` the median of the top eighth. The port, sherry and
    vermouth masters are shot on a lit sweep that brightens toward the
    bottle: 0.9x bg at the sides, 1.5x to 1.6x behind it. So the sweep itself
    passed as a highlight and every bottle stood in front of a white disc.

    A quadratic surface fitted to wall pixels models the sweep: unsaturated
    (by backdrop_saturation), not dark, and outside the light's core, so a
    pale subject in the middle (Ramos foam, a label) cannot pull it up; three
    passes drop blocks more than 15% off the fit. It is capped at the
    brightest backdrop actually seen, so it never extrapolates past the
    photo. The caller only ever raises the threshold with it (max with bg):
    on the flat seamless most cocktails stand on it is bg, and nothing
    changes.
    """
    h, w = lum.shape
    b = h // n
    blocks = lambda a: a[: n * b, : n * b].reshape(n, b, n, b).mean((1, 3))
    L, S, P = blocks(lum).reshape(-1), blocks(bsat).reshape(-1), blocks(pool).reshape(-1)
    x, y = grid(n, n)
    x, y = x.reshape(-1), y.reshape(-1)
    A = np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], -1)
    wall = (S < 0.13) & (L > 0.5 * bg) & (P < 0.60)
    if wall.sum() < 200:  # too little seamless to model: grade.py's flat bg
        return np.full_like(lum, bg)
    keep = wall
    for _ in range(3):
        coef = np.linalg.lstsq(A[keep], L[keep], rcond=None)[0]
        fit = A @ coef
        keep = wall & (np.abs(L - fit) < 0.15 * fit)
    if keep.sum() < 200:
        return np.full_like(lum, bg)
    cap = float(np.percentile(L[keep], 98))
    X, Y = grid(h, w)
    c = coef
    surface = c[0] + c[1] * X + c[2] * Y + c[3] * X * X + c[4] * X * Y + c[5] * Y * Y
    return np.clip(surface, 0, cap).astype(F)


def settle_weight(d):
    """How far each pixel settles to the ground colour (step 6).

    grade.py's curve, clip(1 - d/0.10)^2 * 0.85 mixed in linear light, does
    not meet the seam gate (§8.3: the outer 1% ring within 6/255 of the
    ground). Measured on all 162 masters it misses by a median 23/255 and
    at worst 41/255: it leaves 15% of the wall at the very edge, and the
    tables at the foot of the frame are the brightest wall there is.
    Finishing it in linear light passes the gate but draws a dark frame,
    because the last 15% of linear light is most of the visible step and it
    then falls inside a few pixels.

    So the same quadratic is shifted to reach the ground exactly at the 1%
    ring and is applied in sRGB (see relight), where an even ramp in the
    weight reads as an even falloff: a vignette into the cellar, no frame.
    """
    return (clip01(1 - (d - RING) / (0.10 - RING)) ** 2).astype(F)


# ---------------------------------------------------------------- the light


def relight(srgb, settle_s, pool_s, cx, cy, mode):
    """The lit bake. Steps 1 to 5 in linear light, step 6 in sRGB.

    Returns (lit sRGB, parts for the metrics)."""
    h, w, _ = srgb.shape
    settle, pool_c = srgb_to_lin(settle_s), srgb_to_lin(pool_s)
    x, y = grid(h, w)
    lin = srgb_to_lin(srgb)

    # 1. Saturation (on the sRGB values, as grade.py), luminance, and the
    #    seamless's own brightness from the top eighth of the frame. A floor
    #    keeps a near-black master from dividing by nothing.
    mx, mn = srgb.max(2), srgb.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    lum = luminance(lin)
    bg = max(float(np.median(lum[: h // 8])), 1e-3)

    # 2. The light pool behind the glass.
    pool = light_pool(x, y, cx, cy, *POOL_R)
    wall_c = settle + (pool_c - settle) * pool[..., None]

    # 4. (subject) The drink keeps its own colour, warmed, a little dimmer
    #    away from the light.
    subject = lin * SUBJECT_TINT * (0.55 + 0.45 * pool)[..., None]

    # 5. (wash) Every pixel re-lit by the wall's colour in proportion to its
    #    own brightness against the seamless: no mask, so nothing escapes
    #    it. Saturated pixels inside the pool (the liquid, a garnish) are the
    #    drink, and keep the subject's colour.
    pool2 = light_pool(x, y, cx, cy, *WASH_R)
    wash = lin * WASH_TINT * (settle + (pool_c - settle) * pool2[..., None]) / bg
    wash = mix(wash, subject, clip01((sat - 0.15) / 0.10) * pool)

    core = clip01((pool - CORE[0]) / CORE[1])

    if mode == 'wash':
        # For a photo whose mask fails: the wash alone.
        out = wash
    else:
        # 3. The backdrop mask, grade.py's: unsaturated, not a deep shadow
        #    or dark liquid, and highlights only near the glass. Saturation
        #    is taken against the seamless's own colour, and highlights
        #    against its own sweep (the two functions above say why).
        bsat = backdrop_saturation(srgb, h)
        bgl = np.maximum(bg, backdrop_sweep(lum, bsat, bg, pool))
        bd = clip01(1 - (bsat - 0.06) / 0.14)
        bd *= clip01((lum - bg * 0.25) / (bg * 0.25))
        thr = bgl * (1.40 + 2.5 * (1 - pool) ** 2)
        bd *= clip01((thr - lum) / (bgl * 0.35))
        bd = blur(bd.astype(F), 3)

        # 4. The wall keeps the stone's texture; the subject is mixed in
        #    wherever the mask says it is not wall.
        tex = np.clip(lum / bg, 0, 1.6) ** 1.3
        out = mix(subject, wall_c * tex[..., None], bd)

        # 5. Stray highlights: away from the glass, anything still brighter
        #    than the wash would have made it is a patch the mask missed.
        #    It takes the wash.
        ratio = luminance(out) / np.maximum(luminance(wash), 1e-6)
        m = clip01((ratio - STRAY_ONSET) / STRAY_SPAN) * (1 - core)
        m = blur(clip01(STRAY_GAIN * m).astype(F), 6)
        out = mix(out, wash, m)

    # 6. Every edge settles to the ground, in sRGB (settle_weight says why).
    d = edge_distance(x, y)
    e = settle_weight(d)
    lit = mix(lin_to_srgb(out), settle_s, e)

    return lit.astype(F), {
        'pool': pool,
        # The untextured wall, settled the same way: what "the wall there"
        # means to the stray-light gate.
        'wall_ref': srgb_to_lin(mix(lin_to_srgb(wall_c), settle_s, e)),
        'ring': d < RING,
    }


def unlit_parts(srgb, settle_s, pool_s, cx, cy):
    """--grade off: the parts the metrics need, for the master as it is."""
    h, w, _ = srgb.shape
    x, y = grid(h, w)
    pool = light_pool(x, y, cx, cy, *POOL_R)
    settle, pool_c = srgb_to_lin(settle_s), srgb_to_lin(pool_s)
    return {
        'pool': pool,
        'wall_ref': settle + (pool_c - settle) * pool[..., None],
        'ring': edge_distance(x, y) < RING,
    }


# ---------------------------------------------------------------- the ghost


def ghost(lit_srgb, settle_s, hi_s, size):
    """The locked impression, from the lit result (not the master).

    Luminance, stretched per image so its 2nd percentile is black and its
    99.5th is white (the contrast floor that makes a pale Gin Fizz as legible
    as a Negroni), gamma 1.1, a 1px emboss lit from the top left, then mapped
    from the ground colour to ghostHi and resampled to `size`. Drawn about 2x
    up in a Dex window; the softness is the point, an impression, not a photo.

    The edge then settles to the ground like the lit photo's. Under dark
    liquid (the ports, the darker sherries, the cola and coffee drinks) the
    darkest 2% is darker than the ground, so the ground itself stretched
    above black and the ghost's edge came out up to 11/255 lighter than the
    slot around it. That lift is taken back out where the lit photo
    settles: nothing changes where the ground is not darker than the 2nd
    percentile (138 of 162), and the rest meet the slot within 1/255 before
    encoding.
    """
    h, w, _ = lit_srgb.shape
    y = lin_to_srgb(luminance(srgb_to_lin(lit_srgb)))
    lo, hi = np.percentile(y, [2.0, 99.5])
    span = max(float(hi - lo), 1e-4)
    t = clip01((y - lo) / span) ** 1.1
    b = blur(t.astype(F), 1)
    shifted = np.empty_like(b)  # b moved 1px down and right
    shifted[1:, 1:] = b[:-1, :-1]
    shifted[0, :] = b[0, :]
    shifted[:, 0] = b[:, 0]
    t = clip01(0.85 * t + 2.2 * (b - shifted))
    ground = float(lin_to_srgb(luminance(srgb_to_lin(settle_s))))
    lift = float(clip01((ground - lo) / span)) ** 1.1
    t = clip01(t - settle_weight(edge_distance(*grid(h, w))) * lift)
    rgb = settle_s + (hi_s - settle_s) * t[..., None]
    return Image.fromarray(to8(rgb)).resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- metrics


def lit_metrics(lit8, settle8, parts):
    """The §8.3 measures of one lit bake, on the 8-bit pixels it ships."""
    ring = parts['ring']
    seam = int(np.abs(lit8[ring].astype(np.int16) - settle8.astype(np.int16)).max())

    lum = luminance(srgb_to_lin(lit8.astype(F) / 255.0))
    far = parts['pool'] < 0.25
    stray = lum[far] > 2 * luminance(parts['wall_ref'])[far]
    stray_share = float(stray.mean()) if far.any() else 0.0

    # Linear luminance: the brightest glass and liquid in the middle of the
    # frame. Below 0.20 the drink has been crushed into the wall.
    in_core = parts['pool'] >= CORE_FULL
    subject_p99 = float(np.percentile(lum[in_core], 99)) if in_core.any() else 0.0
    return {'seam': seam, 'stray': round(stray_share, 5), 'subjectP99': round(subject_p99, 4)}


def ghost_metrics(ghost_img, cx, cy):
    g = np.asarray(ghost_img, F) / 255.0
    luma = g @ LUMA  # on the sRGB values: how far apart the ghost's tones look
    h, w = luma.shape
    x, y = grid(h, w)
    in_core = light_pool(x, y, cx, cy, *POOL_R) >= CORE_FULL
    return {'ghostStd': round(float(luma[in_core].std()), 4)}


def gate_flags(m, gates):
    why = []
    if m['seam'] > gates['seam']:
        why.append('seam')
    if m['stray'] > gates['stray']:
        why.append('stray light')
    if m['subjectP99'] < gates['subject']:
        why.append('subject')
    if m['ghostStd'] < gates['ghost']:
        why.append('ghost')
    return why


# ---------------------------------------------------------------- QA sheets


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size) if path else ImageFont.load_default(size)
    except OSError:
        return ImageFont.load_default(size)


def contact_sheet(tiles, out_path, title, ground, font_path, flagged):
    """12 per row at 160px, the id under each; flagged ids in amber with
    the gates they failed. The ground is the settle colour, so a seam shows
    as a visible square edge around a tile."""
    cols, cell, gap, label = 12, 160, 10, 34
    rows = max(1, -(-len(tiles) // cols))
    head = 48
    W = cols * cell + (cols + 1) * gap
    H = head + rows * (cell + label) + (rows + 1) * gap
    ink, faint, amber = (233, 229, 223), (184, 160, 155), (233, 170, 90)
    sheet = Image.new('RGB', (W, H), tuple(int(v) for v in to8(ground)))
    draw = ImageDraw.Draw(sheet)
    big, small = load_font(font_path, 20), load_font(font_path, 12)
    draw.text((gap, 14), title, fill=ink, font=big)
    for i, (pid, path) in enumerate(tiles):
        r, c = divmod(i, cols)
        x0 = gap + c * (cell + gap)
        y0 = head + gap + r * (cell + label + gap)
        with Image.open(path) as im:
            sheet.paste(im.convert('RGB').resize((cell, cell), Image.LANCZOS), (x0, y0))
        why = flagged.get(pid)
        draw.text((x0, y0 + cell + 4), pid, fill=amber if why else faint, font=small)
        if why:
            draw.text((x0, y0 + cell + 18), ', '.join(why), fill=amber, font=small)
    sheet.save(out_path, optimize=True)


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--job', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    with open(args.job, encoding='utf8') as f:
        job = json.load(f)
    c = job['colors']
    settle_s, hi_s, pool_s = hex_srgb(c['settle']), hex_srgb(c['ghostHi']), hex_srgb(c['pool'])
    settle8 = to8(settle_s)
    size, ghost_size, graded = int(job['size']), int(job['ghostSize']), bool(job['grade'])
    gates = job['gates']

    metrics = {}
    started = time.time()
    photos = job['photos']
    for n, p in enumerate(photos, 1):
        o = p.get('override') or {}
        cx, cy = float(o.get('cx', job['pool']['cx'])), float(o.get('cy', job['pool']['cy']))
        mode = o.get('mode', 'masked')
        with Image.open(p['master']) as im:
            im = im.convert('RGB')
            if im.size != (size, size):
                im = im.resize((size, size), Image.LANCZOS)
            srgb = np.asarray(im, F) / 255.0

        if graded:
            lit_s, parts = relight(srgb, settle_s, pool_s, cx, cy, mode)
        else:
            # --grade off: the master as it is, for a before/after sheet.
            lit_s, parts = srgb, unlit_parts(srgb, settle_s, pool_s, cx, cy)
        lit8 = to8(lit_s)
        Image.fromarray(lit8).save(p['lit'], compress_level=1)

        g = ghost(lit8.astype(F) / 255.0, settle_s, hi_s, ghost_size)
        g.save(p['ghost'], compress_level=1)

        m = lit_metrics(lit8, settle8, parts)
        m.update(ghost_metrics(g, cx, cy))
        m.update({'cx': cx, 'cy': cy, 'mode': mode if graded else 'off'})
        m['flags'] = gate_flags(m, gates)
        metrics[p['id']] = m
        if n % 20 == 0 or n == len(photos):
            print(f'  tungsten  {n}/{len(photos)}  ({time.time() - started:.0f}s)', flush=True)

    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, 'metrics.json'), 'w', encoding='utf8') as f:
        json.dump(metrics, f, indent=1)

    qa = job.get('qa')
    if qa:
        os.makedirs(qa['dir'], exist_ok=True)
        flagged = {pid: m['flags'] for pid, m in metrics.items() if m['flags']}
        what = 'tungsten re-light' if graded else 'ungraded masters (--grade off)'
        n = len(photos)
        contact_sheet(
            [(p['id'], p['lit']) for p in photos],
            os.path.join(qa['dir'], 'lit.png'),
            f'Lit · {what} · {n} photos · settles to {c["settle"]} · {size}px',
            settle_s, qa.get('font'), flagged,
        )
        contact_sheet(
            [(p['id'], p['ghost']) for p in photos],
            os.path.join(qa['dir'], 'ghost.png'),
            f'Ghost · from the {what} · {n} photos · {c["settle"]} to {c["ghostHi"]} · {ghost_size}px',
            settle_s, qa.get('font'), flagged,
        )


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
