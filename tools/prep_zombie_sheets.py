#!/usr/bin/env python3
"""Clean, align and shrink the Nano Banana zombie animation sheets for the "animated" zombie style.

usage: prep_zombie_sheets.py SRC_DIR GAME_DIR

SRC_DIR holds <type>_sheet_4x4.png (4 x 4 frames of 256 px, side view facing right):
row 0 walk, row 1 attack, row 2 death, row 3 crawl.

For every frame:
  * enclosed pockets of chroma-key green (between an arm and the body, between the legs) are cut out
    and the green fringe around them is removed;
  * pixels go with the figure they belong to (feet that hang below a cell are kept, and don't show
    up as stray bits at the top of the cell underneath);
  * (fix_visor recoloured the helmet's visor, painted a new colour every frame in the first set);
  * (cut_legs can strip the legs off the crawl row; unused: cut side-on, the stump read worse than
    the painted crawl with the legs dragging behind);
  * each type is scaled so its tallest frame (raised fists and all) fits the cell;
  * the figure is re-anchored so the walk cycle doesn't wobble: its feet sit on one baseline and its
    torso (the middle band of the figure) on one vertical line.
Frames are scaled by CELL/256 and packed into assets/zombies/sheets/<type>.webp (4 x 4 cells).
Prints the per-frame metadata (head position for the glowing eyes, standing height) as JSON for
js/art.js (Art.SHEET_META).
"""
import colorsys, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

TYPES = ['walker', 'helmet', 'spitter', 'bloater', 'leaper', 'brute']  # the Headliner boss keeps its top-down art
F = 256          # source frame
CELL = 192       # output frame
SC = CELL / F
BASE = CELL - 10  # baseline (feet) in the output cell
ROW_WALK, ROW_ATTACK, ROW_DEATH, ROW_CRAWL = 0, 1, 2, 3
FIX_VISOR = False  # the first set painted the visor a new colour every frame; v2 keeps it cyan


def remove_chroma(a):
    """a: HxWx4 uint8. Cut chroma-green pockets and despill their fringe (in place)."""
    r, g, b, al = [a[..., i].astype(int) for i in range(4)]
    key = (g > 170) & (r < 95) & (b < 75) & (np.abs(r - b) < 35) & (al > 0)
    lab, n = ndimage.label(key)
    if n:
        sizes = ndimage.sum(key, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= 12
        key = keep[lab]
    if not key.any():
        return
    ring = ndimage.binary_dilation(key, iterations=3) & ~key
    mx = np.maximum(r, b)
    spill = ring & (g > mx * 1.25 + 25)
    a[key | spill, 3] = 0
    soft = ring & ~spill & (g > mx + 8)
    a[soft, 1] = np.minimum(g[soft], mx[soft] + 8).astype(np.uint8)


def fix_visor(a, anywhere=False):
    """Recolour the brightest saturated blob in the head (the visor) to cyan."""
    al = a[..., 3] > 40
    ys, xs = np.where(al)
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max()
    f = a[..., :3].astype(np.float32) / 255
    mx, mn = f.max(-1), f.min(-1)
    sat = (mx - mn) / (mx + 1e-6)
    cand = al & (sat > 0.45) & (mx > 0.5)
    if not anywhere:
        cand[int(y0 + (y1 - y0) * 0.55):] = False  # head is in the upper half of the figure
    lab, n = ndimage.label(cand)
    if not n:
        return
    sizes = ndimage.sum(cand, lab, range(1, n + 1))
    i = int(np.argmax(sizes)) + 1
    if sizes[i - 1] < 150:
        return
    vis = ndimage.binary_dilation(lab == i, iterations=2) & al & (sat > 0.25)
    for y, x in zip(*np.where(vis)):
        h, l, s = colorsys.rgb_to_hls(*f[y, x])
        rr, gg, bb = colorsys.hls_to_rgb(0.52, l, s)
        a[y, x, :3] = (int(rr * 255), int(gg * 255), int(bb * 255))


def cut_legs(a):
    """Legless crawler: drop the figure behind the hips, feathered, with a stump."""
    al = a[..., 3] > 40
    ys, xs = np.where(al)
    if not len(xs):
        return
    x0, x1 = xs.min(), xs.max()
    cx = int(x0 + (x1 - x0) * 0.42)
    w = np.clip((np.arange(F) - (cx - 6)) / 12.0, 0, 1)
    a[..., 3] = (a[..., 3] * w[None, :]).astype(np.uint8)
    col = np.where(a[:, cx + 6, 3] > 60)[0]
    if len(col) < 4:
        return
    im = Image.fromarray(a)
    d = ImageDraw.Draw(im)
    ty, by = col.min(), col.max()
    h = by - ty
    d.ellipse([cx - 1, ty + h * 0.1, cx + 13, by - h * 0.05], fill=(70, 8, 20, 255))
    d.ellipse([cx + 2, ty + h * 0.25, cx + 10, by - h * 0.2], fill=(140, 22, 38, 255))
    d.ellipse([cx + 3, ty + h * 0.35, cx + 7, ty + h * 0.35 + 4], fill=(215, 200, 180, 255))
    a[:] = np.array(im)


def reattach(sheet):
    """Some sheets cut a figure off at its cell's line and carried the rest (boot soles) over to the
    top of the cell below, after a gap. Small blobs hugging the top of a cell, under a figure that
    runs right down to the cut, are moved back up against it."""
    al = sheet[..., 3] > 8
    lab, n = ndimage.label(al)
    objs = ndimage.find_objects(lab)
    moved = 0
    for i, sl in enumerate(objs, 1):
        ys, xs = sl
        r = ys.start // F
        if r == 0 or ys.start - r * F > 6 or ys.stop - r * F > 48:
            continue
        m = lab[sl] == i
        if m.sum() > 4000:
            continue
        # bottom of the figure above, over the same columns
        above = al[(r - 1) * F:r * F, xs]
        rows = np.where(above.any(1))[0]
        if not len(rows) or rows.max() < F - 30:
            continue
        gap = (r * F + 0) - ((r - 1) * F + rows.max() + 1) + (ys.start - r * F)
        if gap <= 0:
            continue
        piece = sheet[sl].copy()
        piece[~m] = 0
        sheet[sl][m] = 0
        dst = sheet[ys.start - gap:ys.stop - gap, xs]
        dst[m] = piece[m]
        moved += 1
    return moved


def cell_owner(sheet):
    """Which cell (row * 4 + col) each painted pixel belongs to. Some figures overhang their cell
    (feet below the line, an arm past the edge), so pixels go with their connected figure: each
    blob is given to the cell holding most of it, unless it is split fairly between two cells."""
    al = sheet[..., 3] > 8
    lab, n = ndimage.label(al)
    ys, xs = np.mgrid[0:sheet.shape[0], 0:sheet.shape[1]]
    cell = (ys // F).clip(0, 3) * 4 + (xs // F).clip(0, 3)
    owner = np.where(al, cell, -1)
    for i in range(1, n + 1):
        m = lab == i
        cnt = np.bincount(cell[m], minlength=16)
        order = np.argsort(cnt)[::-1]
        if cnt[order[1]] < 0.4 * cnt.sum():  # else it bridges two figures: split at the cell line
            owner[m] = int(order[0])
    return owner


def cut_frame(sheet, owner, row, col, pad=40):
    """The frame for one cell, F x F, taken from a window `pad` px larger on each side (with only
    that cell's pixels), recentred on the cell; overhang past the window is lost."""
    H, W = sheet.shape[:2]
    k = row * 4 + col
    y0, x0 = row * F - pad, col * F - pad
    win = np.zeros((F + 2 * pad, F + 2 * pad, 4), np.uint8)
    sy0, sx0 = max(0, y0), max(0, x0)
    sy1, sx1 = min(H, y0 + F + 2 * pad), min(W, x0 + F + 2 * pad)
    part = sheet[sy0:sy1, sx0:sx1].copy()
    part[owner[sy0:sy1, sx0:sx1] != k] = 0
    win[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = part
    # loose bits lying wholly outside the cell's own square are strays from a neighbour's figure
    lab, n = ndimage.label(win[..., 3] > 8)
    for i, (ys, xs) in enumerate(ndimage.find_objects(lab), 1):
        if ys.start >= pad + F or ys.stop <= pad or xs.start >= pad + F or xs.stop <= pad:
            win[ys, xs][lab[ys, xs] == i] = 0
    return win


def anchor(a, row):
    al = a[..., 3] > 40
    ys, xs = np.where(al)
    y0, y1 = ys.min(), ys.max()
    if row in (ROW_WALK, ROW_ATTACK):
        band = (ys > y0 + (y1 - y0) * 0.35) & (ys < y0 + (y1 - y0) * 0.75)
        ax = xs[band].mean() if band.any() else xs.mean()
    else:
        ax = xs.mean()
    # head: middle of the top 14% of the figure
    top = ys < y0 + (y1 - y0) * 0.14 + 2
    hx, hy = xs[top].mean(), ys[top].mean()
    return ax, y1, (hx, hy), y1 - y0


def main(src, game):
    out_dir = os.path.join(game, 'assets', 'zombies', 'sheets')
    os.makedirs(out_dir, exist_ok=True)
    meta = {}
    for t in TYPES:
        sheet = np.array(Image.open(os.path.join(src, t + '_sheet_4x4.png')).convert('RGBA'))
        moved = reattach(sheet)
        if moved:
            print(t, 'reattached', moved, 'overhanging pieces', file=sys.stderr)
        owner = cell_owner(sheet)
        out = Image.new('RGBA', (CELL * 4, CELL * 4), (0, 0, 0, 0))
        frames = []
        for row in range(4):
            for c in range(4):
                a = cut_frame(sheet, owner, row, c)
                remove_chroma(a)
                if t == 'helmet' and FIX_VISOR:
                    fix_visor(a, row == ROW_DEATH)
                frames.append(a)
        tall = max(np.ptp(np.where(a[..., 3] > 40)[0]) for a in frames)
        SC = min(CELL / F, (BASE - 4) / tall)
        heads, heights = [], []
        for row in range(4):
            for c in range(4):
                a = frames[row * 4 + c]
                ax, feet, (hx, hy), hgt = anchor(a, row)
                n = round(a.shape[0] * SC)
                fr = Image.fromarray(a).resize((n, n), Image.LANCZOS)
                dx = int(round(CELL / 2 - ax * SC))
                dy = int(round(BASE - feet * SC))
                cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
                cell.alpha_composite(fr, (max(0, dx), max(0, dy)), (max(0, -dx), max(0, -dy)))
                out.alpha_composite(cell, (c * CELL, row * CELL))
                heads.append([round(hx * SC + dx), round(hy * SC + dy)])
                heights.append(round(hgt * SC))
        out.save(os.path.join(out_dir, t + '.webp'), 'WEBP', quality=86, method=6)
        walk_h = sorted(heights[0:4])[1]
        meta[t] = {'h': walk_h, 'head': heads}
    print(json.dumps({'cell': CELL, 'base': BASE, 'types': meta}, separators=(',', ':')))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
