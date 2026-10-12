"""
The daylight bake of the catalogue photographs (specs/v4-mockups/white/spec.md §6).

The masters are daylight studio shots on a grey seamless, and on a white page
they are already the right pictures except for one thing: the wall carries a
tint (a cool grey seamless, a warm beige one, a brown stone counter). So this
keeps the master's light and only NEUTRALISES THE WALL. A pixel with almost no
chroma (the seamless, stone, glass, ice) loses what tint it has and keeps its
luminance; a pixel with real chroma (the drink, the garnish) keeps every bit
of its colour. The weight is a smoothstep on chroma, so there is no mask edge
to see. Nothing is re-lit, vignetted or settled to a ground: a print stands
on the page with a 1pt photoEdge, so its edge needs no colour of its own.

From the same frame it bakes the "not yet" proof: the luminance lifted toward
the wash, out = 240 - (255 - Y) x 0.52, so black lands at #6B and the wall
near #D4. A photograph waiting for its colour, never a caught drink.

A port of specs/v4-mockups/white/tools/daylight.py (the mock's bake) with the
same numbers and three changes, all for the gates the build enforces (§9):
  1. 8-bit output is rounded, not truncated. Truncation darkened every wall
     and ramp pixel by half a level on average.
  2. A drink pixel (chroma at ONSET + SPAN or over) is copied from the master
     byte for byte, so "untouched" is a fact the gate can check exactly. The
     mock relied on float32 bringing y + (a - y) x 1.0 back to a; it did, on
     all 15M drink pixels of the 162 masters, but a gate should not rest on
     how a float happens to round.
  3. The proof is resampled as luminance and mapped after, not mapped and
     then resampled. The map is linear, so it is the same picture, but
     Lanczos overshoot on a specular highlight can no longer lift the PNG
     past its 240 ceiling (the mock's order takes Americano's to 244). The
     lossy encode still rings a few levels past it on a few dozen pixels
     at most, too few to see, so the WebP gate asks only that it is grey.

Run by scripts/build-drink-photos.mjs, not by hand:

  python3 scripts/lib/daylight.py --job <job.json> --out <dir>

The node script owns the sizes, the paths and the gate thresholds and passes
them in the job file. The bake's own numbers (ONSET, SPAN, the proof's lift)
live here because they ARE the bake: drinkPhotos.ts carries this file's
sha256, so editing them shows as a stale hash until the photos are rebuilt.

Writes each photo's `print` (RGB) and `proof` (greyscale) as lossless PNG
(node encodes the WebP), <out>/metrics.json, and, when the job asks for QA,
two contact sheets. Fixed maths, no randomness: the output is the same every
run. Needs numpy and Pillow.
"""
import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

F = np.float32

# Chroma is max - min channel, 0..255, on the sRGB values. Under ONSET a pixel
# is wall and goes fully neutral; at ONSET + SPAN and over it is drink and is
# left exactly as shot; in between, a smoothstep.
ONSET, SPAN = 14.0, 26.0

# Rec. 709 weights on the sRGB values, as the mock: the neutral wall keeps the
# brightness it reads at, and the proof's tones follow the print's.
LUMA = np.array([0.2126, 0.7152, 0.0722], F)

# The proof: out = PROOF_CEIL - (255 - Y) x PROOF_GAIN.
PROOF_CEIL, PROOF_GAIN = 240.0, 0.52

# "The wall at the top", the figure the spec quotes (#C4 to #E2): the median of
# the top eighth of the frame, above every glass the masters frame.
TOP = 8


# ---------------------------------------------------------------- the bake


def to8(a):
    return np.clip(np.floor(a + 0.5), 0, 255).astype(np.uint8)


def chroma(px):
    return px.max(axis=-1).astype(F) - px.min(axis=-1).astype(F)


def daylight(master8):
    """The colour print: the wall neutral, the drink as shot."""
    a = master8.astype(F)
    c = chroma(master8)
    w = np.clip((c - ONSET) / SPAN, 0.0, 1.0)
    w = w * w * (3 - 2 * w)  # smoothstep: no visible threshold
    y = (a @ LUMA)[..., None]
    out = to8(y + (a - y) * w[..., None])
    drink = c >= ONSET + SPAN
    out[drink] = master8[drink]
    return out


def proof(master8, size):
    """The 'not yet' proof, greyscale, at `size`."""
    y = master8.astype(F) @ LUMA
    if y.shape != (size, size):
        # float32 opens as mode F: the resample runs on unrounded luminance.
        y = np.asarray(Image.fromarray(y).resize((size, size), Image.LANCZOS), F)
    y = np.clip(y, 0, 255)
    return Image.fromarray(to8(PROOF_CEIL - (255.0 - y) * PROOF_GAIN))  # 2-D uint8: mode L


# ---------------------------------------------------------------- metrics


def saturation(px):
    """HSV saturation, (max - min) / max."""
    mx = px.max(axis=-1).astype(F)
    return (mx - px.min(axis=-1).astype(F)) / np.maximum(mx, 1.0)


def hex_of(rgb):
    return '#' + ''.join(f'{int(v):02X}' for v in rgb)


def top_wall(px):
    h = px.shape[0]
    med = np.median(px[: max(1, h // TOP)].reshape(-1, 3), 0)
    med = np.floor(med + 0.5).astype(int)
    return hex_of(med), int(round(float(med.mean()))), int(med.max() - med.min())


def measure(master8, print8, proof_img):
    """What the gates read, on the 8-bit pixels that go to the encoder.

    tintLeft    the most chroma any wall pixel (master chroma under ONSET)
                still has after the bake: 0 is neutral.
    drinkShift  the largest change in HSV saturation on any drink pixel
                (master chroma ONSET + SPAN or over): 0 is untouched.
    """
    c = chroma(master8)
    wall = c < ONSET
    drink = c >= ONSET + SPAN
    tint_left = int(chroma(print8)[wall].max()) if wall.any() else 0
    shift = np.abs(saturation(print8) - saturation(master8))
    drink_shift = float(shift[drink].max()) if drink.any() else 0.0
    wall_hex, wall_level, wall_tint = top_wall(print8)
    master_hex, _, master_tint = top_wall(master8)
    p = np.asarray(proof_img)
    return {
        'wall': wall_hex,
        'wallLevel': wall_level,
        'wallTint': wall_tint,
        'masterWall': master_hex,
        'masterWallTint': master_tint,
        'wallShare': round(float(wall.mean()), 4),
        'drinkShare': round(float(drink.mean()), 4),
        'tintLeft': tint_left,
        'drinkShift': round(drink_shift, 6),
        'proof': [int(p.min()), int(p.max())],
    }


def gate_flags(m, gates):
    why = []
    if m['tintLeft'] > gates['tintLeft']:
        why.append('wall tint')
    if m['drinkShift'] > gates['drinkShift']:
        why.append('drink saturation')
    return why


# ---------------------------------------------------------------- QA sheets


def load_font(path, size):
    try:
        return ImageFont.truetype(path, size) if path else ImageFont.load_default(size)
    except OSError:
        return ImageFont.load_default(size)


def contact_sheet(tiles, out_path, title, font_path, notes, flagged):
    """12 per row at 160px on the page white, each print inside the app's 1pt
    photoEdge (7% ink, #EEEEEE on white), the id and a note under it. A
    flagged id is set in ink with the gates it failed; the rest are muted."""
    cols, cell, gap, label = 12, 160, 10, 34
    rows = max(1, -(-len(tiles) // cols))
    head = 48
    W = cols * cell + (cols + 1) * gap
    H = head + rows * (cell + label) + (rows + 1) * gap
    page, ink, muted, edge = (255, 255, 255), (10, 10, 10), (92, 92, 92), (238, 238, 238)
    sheet = Image.new('RGB', (W, H), page)
    draw = ImageDraw.Draw(sheet)
    big, small = load_font(font_path, 20), load_font(font_path, 12)
    draw.text((gap, 14), title, fill=ink, font=big)
    for i, (pid, path) in enumerate(tiles):
        r, c = divmod(i, cols)
        x0 = gap + c * (cell + gap)
        y0 = head + gap + r * (cell + label + gap)
        with Image.open(path) as im:
            sheet.paste(im.convert('RGB').resize((cell, cell), Image.LANCZOS), (x0, y0))
        draw.rectangle((x0, y0, x0 + cell - 1, y0 + cell - 1), outline=edge)
        why = flagged.get(pid)
        draw.text((x0, y0 + cell + 4), pid, fill=ink if why else muted, font=small)
        draw.text((x0, y0 + cell + 18), ', '.join(why) if why else notes.get(pid, ''), fill=ink if why else muted, font=small)
    sheet.save(out_path, optimize=True)


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--job', required=True)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    with open(args.job, encoding='utf8') as f:
        job = json.load(f)
    size, proof_size = int(job['size']), int(job['proofSize'])
    graded = job['grade'] == 'daylight'
    gates = job['gates']

    metrics = {}
    started = time.time()
    photos = job['photos']
    for n, p in enumerate(photos, 1):
        with Image.open(p['master']) as im:
            im = im.convert('RGB')
            if im.size != (size, size):
                im = im.resize((size, size), Image.LANCZOS)
            master8 = np.asarray(im, np.uint8)

        # --grade off: the master as it is, so the sheets and the gates show
        # what the bake would have to fix.
        print8 = daylight(master8) if graded else master8
        Image.fromarray(print8).save(p['print'], compress_level=1)
        # The proof is luminance only, and the bake keeps luminance, so it is
        # the same picture either way.
        pr = proof(master8, proof_size)
        pr.save(p['proof'], compress_level=1)

        m = measure(master8, print8, pr)
        m['flags'] = gate_flags(m, gates)
        metrics[p['id']] = m
        if n % 20 == 0 or n == len(photos):
            print(f'  daylight  {n}/{len(photos)}  ({time.time() - started:.0f}s)', flush=True)

    os.makedirs(args.out, exist_ok=True)
    bake = {'onset': ONSET, 'span': SPAN, 'proof': {'ceil': PROOF_CEIL, 'gain': PROOF_GAIN}}
    with open(os.path.join(args.out, 'metrics.json'), 'w', encoding='utf8') as f:
        json.dump({'bake': bake, 'photos': metrics}, f, indent=1)

    qa = job.get('qa')
    if qa:
        os.makedirs(qa['dir'], exist_ok=True)
        flagged = {pid: m['flags'] for pid, m in metrics.items() if m['flags']}
        what = 'daylight bake' if graded else 'masters as they are (--grade off)'
        n = len(photos)
        walls = {pid: f"wall {m['wall']}" + (f" tint {m['wallTint']}" if m['wallTint'] else '') for pid, m in metrics.items()}
        contact_sheet(
            [(p['id'], p['print']) for p in photos],
            os.path.join(qa['dir'], 'prints.png'),
            f'Prints · {what} · {n} photos · {size}px · wall = median of the top eighth',
            qa.get('font'), walls, flagged,
        )
        ranges = {pid: f"{m['proof'][0]} to {m['proof'][1]}" for pid, m in metrics.items()}
        contact_sheet(
            [(p['id'], p['proof']) for p in photos],
            os.path.join(qa['dir'], 'proofs.png'),
            f'Proofs · {n} photos · {proof_size}px · out = {PROOF_CEIL:g} - (255 - Y) x {PROOF_GAIN:g}',
            qa.get('font'), ranges, {},
        )


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
