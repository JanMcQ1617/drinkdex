#!/usr/bin/env python3
"""Rasterise final.js's polys.json into the PNG set (Pillow only, no Chrome).
Each outline is filled on an 8x supersampled mask and box-reduced, so edges
are true area coverage.
  python3 -I source/raster.py <dir>              final set from <dir>/polys.json
  python3 -I source/raster.py <dir> --variants   comparison PNGs per variant
"""
import json, sys, os
from PIL import Image, ImageDraw

RED, WHITE = (0xD0, 0x10, 0x2C), (255, 255, 255)
SS = 8


def mask(polys, size, canvas=1024):
    big = size * SS
    k = big / canvas
    im = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(im)
    for p in polys:  # one closed outline per poly, no holes (checked)
        d.polygon([(x * k, y * k) for x, y in p], fill=255)
    return im.reduce(SS)


def tile(polys, size, bg=RED, fg=WHITE):
    im = Image.new('RGB', (size, size), bg)
    im.paste(Image.new('RGB', (size, size), fg), (0, 0), mask(polys, size))
    return im


def glyph(polys, size, rgb):
    im = Image.new('RGBA', (size, size), rgb + (0,))
    im.putalpha(mask(polys, size))
    return im


def main():
    d = sys.argv[1]
    data = json.load(open(os.path.join(d, 'polys.json')))
    if '--variants' in sys.argv:
        for k, v in data.items():
            for s in (1024, 29, 40, 60, 58, 87, 120, 180):
                tile(v['icon'], s).save(os.path.join(d, f'{k}-{s}.png'))
        return
    ic, sp, an = data['icon'], data['splash'], data['android']
    tile(ic, 1024).save(os.path.join(d, 'icon-1024.png'))  # RGB: no alpha
    # iOS 18 dark: the s in Campari on transparent; iOS supplies the backdrop
    glyph(ic, 1024, RED).save(os.path.join(d, 'icon-dark-1024.png'))
    # iOS 18 tinted: a grayscale s (white = full tint) on transparent
    g = mask(ic, 1024)
    t = Image.merge('LA', (Image.new('L', (1024, 1024), 255), g))
    t.save(os.path.join(d, 'icon-tinted-1024.png'))
    glyph(sp, 1024, RED).save(os.path.join(d, 'splash.png'))
    glyph(an, 1024, WHITE).save(os.path.join(d, 'android-foreground.png'))
    Image.new('RGB', (1024, 1024), RED).save(os.path.join(d, 'android-background.png'))
    glyph(an, 1024, WHITE).save(os.path.join(d, 'android-monochrome.png'))
    tile(ic, 48).save(os.path.join(d, 'favicon.png'))
    # checks for the board: the icon at 1x and 3x home-screen sizes
    os.makedirs(os.path.join(d, 'check'), exist_ok=True)
    for s in (29, 40, 58, 60, 87, 120, 180):
        tile(ic, s).save(os.path.join(d, 'check', f'icon-{s}.png'))


main()
