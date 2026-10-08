#!/usr/bin/env python3
"""Import hand-made / externally generated pixel art (transparent PNG/WebP) as a game enemy sprite.

    python tools/import-art.py <image> <key> [--height 104] [--flip] [--colors 32]
      → battle/art/enemies/<key>.png  (crisp dots, dark outline; game sizes it by height)
The art should already be pixel art; it is re-gridded to <height> dots (vote downscale keeps edges crisp).
--flip mirrors it so the enemy faces left (towards the guardian).
"""
import argparse, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from pixelize import vote_downscale, finish  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('key')
ap.add_argument('--height', type=int, default=104); ap.add_argument('--colors', type=int, default=32)
ap.add_argument('--flip', action='store_true'); ap.add_argument('--outline', default='#141626'); ap.add_argument('--preview', type=int, default=0)
a = ap.parse_args()
im = Image.open(a.src).convert('RGBA')
if a.flip: im = im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
rgba = np.array(im)
rgba[..., 3] = np.where(rgba[..., 3] > 127, 255, 0)
ys, xs = np.nonzero(rgba[..., 3])
rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
H = a.height; W = max(1, round(rgba.shape[1] * H / rgba.shape[0]))
out = vote_downscale(rgba, W, H, a.colors, 1.0)
a.dst = os.path.join(ROOT, 'battle', 'art', 'enemies', a.key + '.png')
finish(out, a)
