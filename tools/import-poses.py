#!/usr/bin/env python3
"""Cut finished pose sheets (made from art/templates/pose_base.png / pose_super.png) into game frames.

    python tools/import-poses.py <base_sheet.png>  <dir>             → idle/shoot/melee/top_{1,2,3}.png
    python tools/import-poses.py <super_sheet.png> <dir> --super     → beam/orb/gun/blade/throw/slam/field_{1,2,3}.png

Output: battle/art/outfits/<dir>/ + meta.json (one section per sheet).
All frames of a sheet are cropped with the SAME box, so movement between frames is kept. meta.json holds
the feet position, the idle figure height (scale) and the hand anchors from art/templates/pose_anchors.json
(where the game adds the super's Light weapon / beam / orb). Then register the outfit in
battle/content.js → OUTFIT_ART (the command prints the line).
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

ROOT = os.path.join(os.path.dirname(__file__), '..')
ROWS = {'base': ['idle', 'shoot', 'melee', 'top'], 'super': ['beam', 'orb', 'gun', 'blade', 'throw', 'slam', 'field']}


def clean(mask, ch):
    """drop labels / ground lines / markers: small blobs, blobs in the label band, thin horizontal lines"""
    lab, n = ndimage.label(mask)
    keep = np.zeros_like(mask)
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        part = lab[sl] == i
        area, h = part.sum(), sl[0].stop - sl[0].start
        if area < mask.size * 0.002 or h < 10 or (sl[0].stop < ch * 0.16 and area < mask.size * 0.02):
            continue
        keep[sl] |= part
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet'); ap.add_argument('dir')
    ap.add_argument('--super', action='store_true', help='the sheet is the 7-pattern super sheet')
    a = ap.parse_args()
    kind = 'super' if a.super else 'base'
    rows = ROWS[kind]
    tpl = json.load(open(os.path.join(ROOT, 'art', 'templates', 'pose_anchors.json')))
    arr = np.array(Image.open(a.sheet).convert('RGBA'))
    H, W = arr.shape[:2]
    if kind == 'base' and H / W < 1.15:   # older 3 x 3 base sheet (no TOP row)
        rows = rows[:3]
    cw, ch = W / 3, H / len(rows)
    k = cw / tpl['cell'][0]            # sheet cell → template cell scale (anchors are in template pixels)
    cells, names = [], []
    for r, pose in enumerate(rows):
        for c in range(3):
            y0, y1, x0, x1 = int(r * ch), int((r + 1) * ch), int(c * cw), int((c + 1) * cw)
            cell = arr[y0:y1, x0:x1].copy()
            fg = cell[..., 3] > 40 if cell[..., 3].min() < 200 else remove_background(cell[..., :3])
            fg = clean(fg, ch)
            cell[..., 3] = np.where(fg, cell[..., 3], 0)
            cells.append(cell); names.append(f'{pose}_{c + 1}')
    boxes = []
    for cell, n in zip(cells, names):
        ys, xs = np.nonzero(cell[..., 3] > 0)
        if not len(ys):
            raise SystemExit(f'empty cell {n} — is this the right sheet ({kind}, 3 x {len(rows)})?')
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    U = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    out = os.path.join(ROOT, 'battle', 'art', 'outfits', a.dir)
    os.makedirs(out, exist_ok=True)
    for cell, n in zip(cells, names):
        Image.fromarray(cell[U[1]:U[3], U[0]:U[2]]).save(os.path.join(out, n + '.png'))
    # feet = the template's feet mark (both sheets share the mannequin scale); scale = IDLE 1's height
    foot = (tpl['footX'] * k, tpl['ground'] * k)
    fig_h = boxes[0][3] - boxes[0][1] if kind == 'base' else None
    anchors = {}
    for n in names:
        t = tpl['frames'][n]
        anchors[n] = {'hand': [t['hand'][0] * k - U[0], t['hand'][1] * k - U[1]], 'ang': t['ang'],
                      'far': [t['far'][0] * k - U[0], t['far'][1] * k - U[1]], 'fang': t['fang']}
    sec = {'w': int(U[2] - U[0]), 'h': int(U[3] - U[1]), 'footY': float(foot[1] - U[1]), 'cx': float(foot[0] - U[0]), 'anchors': anchors}
    if fig_h: sec['figH'] = float(fig_h)
    mp = os.path.join(out, 'meta.json')
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    meta[kind] = sec
    json.dump(meta, open(mp, 'w'), indent=1)
    print(f'{len(cells)} frames ({kind}) → {os.path.abspath(out)}  ({sec["w"]}x{sec["h"]})')
    if 'base' not in meta:
        print('next: import the base sheet too (idle / shoot / melee)')
    print("register in battle/content.js OUTFIT_ART:\n  { cl: <0 Titan|1 Hunter|2 Warlock>, set: '<series name>', ex: '<exotic name or *>', dir: '%s' }," % a.dir)


if __name__ == '__main__':
    main()
