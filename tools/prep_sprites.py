#!/usr/bin/env python3
"""Cut the green screen out of the Nano Banana sprites, orient, trim and shrink them for the game.

usage: prep_sprites.py SRC_DIR GAME_DIR MAPPING.json

MAPPING.json: {"weapons": {"<file stem>": "<weapon id>"}, "zombies": {"<file stem>": "<zombie key>"},
               "flip": ["<file stem>", ...], "rotate": {"<file stem>": degrees_ccw}, "border_only": [stems]}
Weapons go to assets/weapons/<id>.webp (key wpn_<id>), zombies to assets/zombies/<key>.webp (key z_<key>),
and assets/manifest.json gets the entries with their exact sizes.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def key_mask(rgb, border_only):
    """True where the pixel is green-screen background."""
    f = rgb.astype(np.float32) / 255.0
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = f.max(-1); mn = f.min(-1); d = mx - mn + 1e-6
    hue = np.where(mx == g, 60 * ((b - r) / d) + 120, np.where(mx == r, 60 * (((g - b) / d) % 6), 60 * ((r - g) / d) + 240))
    sat = d / (mx + 1e-6)
    cand = (hue >= 80) & (hue <= 160) & (sat > 0.35) & (mx > 0.25) & (g >= r) & (g >= b)
    # background = green connected to the image border
    lab, _ = ndimage.label(cand)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    if not border_only:
        # enclosed pockets of pure chroma green (inside a trigger guard, between legs)
        pure = cand & (sat > 0.7) & (mx > 0.55) & (hue >= 100) & (hue <= 140)
        lab2, n = ndimage.label(pure)
        if n:
            sizes = ndimage.sum(np.ones_like(pure), lab2, range(1, n + 1))
            big = np.isin(lab2, 1 + np.nonzero(sizes > 40)[0])
            bg |= big
    return bg


def cut(path, border_only):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    bg = key_mask(a[..., :3], border_only)
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=1)  # drop speckles
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    al = np.array(alpha)
    # despill: pixels near the cut lose their green cast
    near = ndimage.binary_dilation(bg, iterations=3) & fg
    rgb = a[..., :3].astype(np.int16)
    cap = np.maximum(rgb[..., 0], rgb[..., 2])
    g = rgb[..., 1]
    rgb[..., 1] = np.where(near & (g > cap), cap, g)
    out = np.dstack([rgb.astype(np.uint8), al])
    out[al < 8] = 0
    return Image.fromarray(out, 'RGBA')


def trim(im, pad=4):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return im
    x0, y0, x1, y1 = bbox
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit(im, max_side):
    k = min(1.0, max_side / max(im.size))
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def square(im, side):
    s = max(im.size)
    c = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    c.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return c.resize((side, side), Image.LANCZOS)


def main(src, game, mapping_path):
    m = json.load(open(mapping_path))
    man_path = os.path.join(game, 'assets', 'manifest.json')
    man = json.load(open(man_path))
    os.makedirs(os.path.join(game, 'assets', 'weapons'), exist_ok=True)
    os.makedirs(os.path.join(game, 'assets', 'zombies'), exist_ok=True)
    files = {os.path.splitext(f)[0]: os.path.join(dp, f) for dp, _, fs in os.walk(src) for f in fs if f.lower().endswith('.png')}
    total = 0
    for group, folder, prefix in (('weapons', 'weapons', 'wpn_'), ('zombies', 'zombies', 'z_')):
        for stem, key in m[group].items():
            im = cut(files[stem], stem in m.get('border_only', []))
            if stem in m.get('flip', []):
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            if stem in m.get('rotate', {}):
                im = im.rotate(m['rotate'][stem], expand=True, resample=Image.BICUBIC)
            im = trim(im)
            if group == 'weapons':
                im = fit(im, 320)
            else:
                im = square(im, 384 if key == 'headliner' else 256)
            rel = folder + '/' + key + '.webp'
            out = os.path.join(game, 'assets', rel)
            im.save(out, 'WEBP', quality=86, method=6)
            total += os.path.getsize(out)
            man['assets'][prefix + key] = {'file': rel, 'w': im.width, 'h': im.height}
            print(f'{stem:32s} -> {rel:28s} {im.width}x{im.height} {os.path.getsize(out)//1024}KB')
    json.dump(man, open(man_path, 'w'), indent=2, ensure_ascii=False)
    open(man_path, 'a').write('\n')
    print('total', total // 1024, 'KB')


if __name__ == '__main__':
    main(*sys.argv[1:4])
