#!/usr/bin/env python3
"""Builds every logo asset the app uses from the team logo (a PNG with a transparent background).

    python3 scripts/brand-assets.py path/to/logo.png        (needs Pillow: pip install pillow)

Writes frontend/public/brand/{logo,logo-dark,mark,mark-dark}.png, the app icons in
frontend/public/icons/ and frontend/public/favicon.png.

- logo-dark: the logo's black outlines and lettering turned near-white, for the dark theme.
- mark: the dragon's head, neck and the start of the flame, anchored to the bottom edge so a rounded tile hides where the neck is
  cut. Used where the full logo would be too small to read (sidebar, favicon, app icon).
- badge-96: a white silhouette of the head; Android shows notification badges as a mask.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'frontend' / 'public'
# The head in the original 1152x684 logo, as a fraction of its size so a re-export at another
# resolution still crops the same part.
HEAD = (495 / 1152, 38 / 684, 815 / 1152, 350 / 684)


def to_dark(im):
    """Near-black neutral pixels (outlines, lettering) become near-white; colours are untouched."""
    out = im.copy()
    src, dst = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = src[x, y]
            if a and max(r, g, b) < 90 and max(r, g, b) - min(r, g, b) < 30:
                v = 245 - max(r, g, b) // 2
                dst[x, y] = (v, v, v, a)
    return out


def head_square(src, size, fill=0.94):
    """The head scaled to `fill` of the width, centred, bottom edge on the canvas's bottom edge."""
    w, h = src.size
    head = src.crop(tuple(round(f * d) for f, d in zip(HEAD, (w, h, w, h))))
    scale = size * fill / head.width
    head = head.resize((round(head.width * scale), round(head.height * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(head, ((size - head.width) // 2, size - head.height), head)
    return canvas


def tile(mark, size, background, radius=0.22, inset=0.0):
    """The mark on a solid tile. radius=0 for full-bleed (maskable) icons; inset shrinks the mark
    toward the centre (the maskable safe zone) while keeping it on the bottom edge."""
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * radius), fill=background)
    inner = round(size * (1 - inset))
    m = mark.resize((inner, inner), Image.LANCZOS)
    out.alpha_composite(m, ((size - inner) // 2, size - inner))
    if radius:
        # Clip the mark to the rounded corners too.
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * radius), fill=255)
        out.putalpha(Image.composite(out.getchannel('A'), mask, mask))
    return out


def main(path):
    src = Image.open(path).convert('RGBA')
    logo = src.crop(src.getbbox())
    (PUBLIC / 'brand').mkdir(parents=True, exist_ok=True)
    logo.save(PUBLIC / 'brand' / 'logo.png', optimize=True)
    to_dark(logo).save(PUBLIC / 'brand' / 'logo-dark.png', optimize=True)

    mark = head_square(src, 256)
    mark.save(PUBLIC / 'brand' / 'mark.png', optimize=True)
    to_dark(mark).save(PUBLIC / 'brand' / 'mark-dark.png', optimize=True)

    white = (255, 255, 255, 255)
    icons = PUBLIC / 'icons'
    icons.mkdir(exist_ok=True)
    big = head_square(src, 1024)
    tile(big, 512, white).save(icons / 'icon-512.png', optimize=True)
    tile(big, 192, white).save(icons / 'icon-192.png', optimize=True)
    tile(big, 512, white, radius=0, inset=0.2).save(icons / 'maskable-512.png', optimize=True)
    tile(big, 180, white, radius=0, inset=0.08).save(icons / 'apple-touch-icon.png', optimize=True)
    tile(big, 64, white).save(PUBLIC / 'favicon.png', optimize=True)

    silhouette = head_square(src, 96, fill=0.86)
    badge = Image.new('RGBA', silhouette.size, (255, 255, 255, 0))
    badge.putalpha(silhouette.getchannel('A'))
    badge.save(icons / 'badge-96.png', optimize=True)
    print('Wrote brand assets to', PUBLIC)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
