#!/usr/bin/env python3
"""Cut an enemy illustration (subject on a plain white background) into a transparent, smooth game sprite — no pixelization.

    python tools/import-enemy-hd.py <generated.png> <key> [--height 240] [--out battle/art/enemies]
      → <out>/<key>.png  (RGBA, <height> px tall, soft 1px edge, facing LEFT)

Background: flood fill from the borders over light, unsaturated pixels (tools/pixelize.remove_background),
then keep the largest subject blob (+ big attached parts) so stray shadows / specks drop out.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pixelize import remove_background, vote_downscale, finish  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('key')
    ap.add_argument('--height', type=int, default=240)
    ap.add_argument('--out', default=os.path.join(ROOT, 'battle', 'art', 'enemies'))
    ap.add_argument('--flip', action='store_true')
    ap.add_argument('--pixel', type=int, default=0, help='also pixelize: N dots tall (e.g. 80), like tools/import-enemy.py')
    ap.add_argument('--colors', type=int, default=28); ap.add_argument('--outline', default='#141626'); ap.add_argument('--preview', type=int, default=0)
    a = ap.parse_args()
    rgb = np.array(Image.open(a.src).convert('RGB'))
    if a.flip: rgb = rgb[:, ::-1]
    fg = remove_background(rgb, step=18)
    # light-gray soft shadow on the white card (unsaturated, brighter than the subject's darks) → background
    c = rgb.astype(int); sat = c.max(2) - c.min(2); lum = c.mean(2)
    fg &= ~((sat < 14) & (lum > 175))
    fg = ndimage.binary_opening(fg, iterations=1)
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = np.bincount(lab.ravel())[1:]
        fg = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.04)[0])
    fg = ndimage.binary_fill_holes(fg) & (fg | ~((sat < 14) & (lum > 200)))   # fill interior holes, but keep real white gaps
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    im = Image.fromarray(rgb).convert('RGBA'); im.putalpha(alpha)
    im = im.crop((x0, y0, x1, y1))
    if a.pixel:   # clean white-card cut-out → vote downscale (crisp dots, dark outline)
        rgba = np.array(im)
        rgba[..., 3] = np.where(rgba[..., 3] > 127, 255, 0)
        H = a.pixel; W = max(1, round(im.width * H / im.height))
        out = vote_downscale(rgba, W, H, a.colors, 1.15)
        os.makedirs(a.out, exist_ok=True)
        a.dst = os.path.join(a.out, a.key + '.png')
        finish(out, a)
        return
    W = max(1, round(im.width * a.height / im.height))
    im = im.resize((W, a.height), Image.Resampling.LANCZOS)
    os.makedirs(a.out, exist_ok=True)
    dst = os.path.join(a.out, a.key + '.png')
    im.save(dst)
    print(f'{os.path.basename(dst)}: {im.width}x{im.height}')


if __name__ == '__main__':
    main()
