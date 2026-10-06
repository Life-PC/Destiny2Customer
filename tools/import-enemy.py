#!/usr/bin/env python3
"""Turn a generated enemy picture (subject on a plain mid-gray background) into the game's enemy sprite.

    python tools/import-enemy.py <generated.png> <key> [--height 80] [--colors 28] [--flip]
      → battle/art/enemies/<key>.png   (transparent, pixel grid: <height> dots tall, facing LEFT)

Background removal floods from the image borders over pixels close to the border color (gray card),
following smooth gradients; vote-downscale from tools/pixelize.py keeps edges crisp.
--flip mirrors the result (use when the model drew the enemy facing right).
"""
import argparse
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from pixelize import vote_downscale, finish  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')


def remove_gray_background(rgb, tol=46, step=12, dropgray=False, dropcyan=False, open_px=0):
    h, w, _ = rgb.shape
    c = rgb.astype(int)
    border = np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]])
    bg = np.median(border, axis=0)
    sat = c.max(axis=2) - c.min(axis=2)
    lum = c.mean(axis=2)
    cand = (sat < 34) & (np.abs(lum - bg.mean()) < tol * 1.8)   # the card can carry lighter / darker gray patches
    mask = np.zeros((h, w), bool)
    q = deque()
    for y in (0, h - 1):
        for x in range(w):
            if cand[y, x]: mask[y, x] = True; q.append((x, y))
    for x in (0, w - 1):
        for y in range(h):
            if cand[y, x] and not mask[y, x]: mask[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny, nx] and cand[ny, nx] and np.abs(c[ny, nx] - c[y, x]).sum() < step:
                mask[ny, nx] = True; q.append((nx, ny))
    # soft ground shadow under the feet: darker gray, unsaturated, touching the background → background
    # ground shadow: a flat gray blob at the feet. Only look in the lowest quarter of the subject so gray metal
    # or black (Taken) bodies higher up are never eaten.
    ys0 = np.nonzero(~mask)[0]
    low = np.zeros((h, w), bool); low[int(ys0.min() + (ys0.max() - ys0.min()) * 0.72):] = True
    shadow = (~mask) & low & (sat < 16) & (lum < bg.mean() + 8) & (lum > bg.mean() - 60)
    grow = mask.copy()
    for _ in range(400):
        nb = np.zeros_like(grow)
        nb[1:] |= grow[:-1]; nb[:-1] |= grow[1:]; nb[:, 1:] |= grow[:, :-1]; nb[:, :-1] |= grow[:, 1:]
        new = nb & shadow & ~grow
        if not new.any(): break
        grow |= new
    mask |= grow
    if dropgray: mask |= (sat < 22) & (lum > 60) & (lum < 215)          # subject has no mid-gray parts (bronze machines)
    if dropcyan: mask |= (c[..., 2] - c[..., 0] > 40) & (c[..., 1] - c[..., 0] > 20) & (lum < 190)   # stray cyan guide lines
    # enclosed flat gray patches (between the legs, under an arm): unsaturated, near the card tone, no texture
    from scipy import ndimage
    enc = cand & ~mask
    lab, n = ndimage.label(enc)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        part = lab[sl] == i
        if part.sum() < h * w * 0.0008: continue
        px = c[sl][part]
        if px.std(axis=0).max() < 9: mask[sl] |= part
    if open_px:   # erase thin stray structures (guide lines) thinner than ~2*open_px
        mask = ~ndimage.binary_opening(~mask, iterations=open_px)
    # drop specks: keep only the largest foreground component (+ anything bigger than 1% of it)
    lab, n = ndimage.label(~mask)
    if n > 1:
        sizes = np.bincount(lab.ravel())[1:]
        keep = np.isin(lab, 1 + np.nonzero(sizes >= sizes.max() * 0.01)[0])
        mask = ~keep
    return ~mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('key')
    ap.add_argument('--height', type=int, default=80)
    ap.add_argument('--colors', type=int, default=28)
    ap.add_argument('--flip', action='store_true')
    ap.add_argument('--dropgray', action='store_true'); ap.add_argument('--dropcyan', action='store_true'); ap.add_argument('--open', type=int, default=0)
    ap.add_argument('--preview', type=int, default=0)
    ap.add_argument('--outline', default='#141626')
    a = ap.parse_args()
    rgb = np.array(Image.open(a.src).convert('RGB'))
    if a.flip: rgb = rgb[:, ::-1]
    fg = remove_gray_background(rgb, dropgray=a.dropgray, dropcyan=a.dropcyan, open_px=a.open)
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, (fg * 255).astype(np.uint8)])[y0:y1, x0:x1]
    H = a.height
    W = max(1, round((x1 - x0) * H / (y1 - y0)))
    out = vote_downscale(rgba, W, H, a.colors, 1.1)
    os.makedirs(os.path.join(ROOT, 'battle', 'art', 'enemies'), exist_ok=True)
    a.dst = os.path.join(ROOT, 'battle', 'art', 'enemies', a.key + '.png')
    finish(out, a)


if __name__ == '__main__':
    main()
