#!/usr/bin/env python3
"""Cut a finished pose sheet (made from art/templates/pose_sheet.png) into game frames.

    python tools/import-poses.py <sheet.png> <dir> [--cols 3 --rows 4]

Writes battle/art/outfits/<dir>/{idle,shoot,melee,super}_{1,2,3}.png + meta.json.
All 12 frames are cropped with the SAME box (cell-relative), so the character's movement between
frames is kept; meta.json tells the game where the feet and the body centre are (from IDLE 1).
Then register the outfit in battle/content.js → OUTFIT_ART (the command prints the line).
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pixelize import remove_background  # noqa: E402

POSES = ['idle', 'shoot', 'melee', 'super']
ROOT = os.path.join(os.path.dirname(__file__), '..')


def clean(mask, ch):
    """drop labels / ground lines: small blobs, blobs in the label band, thin horizontal lines"""
    lab, n = ndimage.label(mask)
    keep = np.zeros_like(mask)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        part = lab[sl] == i
        area, h, w = part.sum(), sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if area < mask.size * 0.002 or h < 10 or (sl[0].stop < ch * 0.14 and area < mask.size * 0.02):
            continue
        keep[sl] |= part
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('dir')
    ap.add_argument('--cols', type=int, default=3); ap.add_argument('--rows', type=int, default=4)
    a = ap.parse_args()
    im = Image.open(a.sheet).convert('RGBA')
    arr = np.array(im)
    H, W = arr.shape[:2]
    cw, ch = W / a.cols, H / a.rows
    cells = []
    for r in range(a.rows):
        for c in range(a.cols):
            y0, y1, x0, x1 = int(r * ch), int((r + 1) * ch), int(c * cw), int((c + 1) * cw)
            cell = arr[y0:y1, x0:x1].copy()
            # transparent sheets: use alpha; opaque sheets: remove the light background
            fg = cell[..., 3] > 40 if cell[..., 3].min() < 200 else remove_background(cell[..., :3])
            fg = clean(fg, ch)
            cell[..., 3] = np.where(fg, cell[..., 3], 0)
            cells.append(cell)
    boxes = []
    for cell in cells:
        ys, xs = np.nonzero(cell[..., 3] > 0)
        if not len(ys):
            raise SystemExit('empty cell — check the sheet layout (cols/rows)')
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    U = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    out = os.path.join(ROOT, 'battle', 'art', 'outfits', a.dir)
    os.makedirs(out, exist_ok=True)
    for i, cell in enumerate(cells):
        pose, n = POSES[i // a.cols], i % a.cols + 1
        Image.fromarray(cell[U[1]:U[3], U[0]:U[2]]).save(os.path.join(out, f'{pose}_{n}.png'))
    idle = boxes[0]
    meta = {k: float(v) for k, v in {'w': U[2] - U[0], 'h': U[3] - U[1], 'footY': idle[3] - U[1], 'cx': (idle[0] + idle[2]) / 2 - U[0], 'figH': idle[3] - idle[1]}.items()}
    json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
    print(f'12 frames → {os.path.abspath(out)}  ({meta["w"]}x{meta["h"]})')
    print("register in battle/content.js OUTFIT_ART:\n  { cl: <0 タイタン|1 ハンター|2 ウォーロック>, set: '<シリーズ名>', ex: '<エキゾ名 or *>', dir: '%s' }," % a.dir)


if __name__ == '__main__':
    main()
