#!/usr/bin/env python3
"""Turn a generated illustration (subject on a plain light background) into a game pixel sprite.

    python tools/pixelize.py <in.png> <out.png> [--height 64] [--colors 24] [--preview 8]

1. background removal: flood fill from the borders over near-background colors
2. crop to the subject, downscale so the subject is <height> px tall (area averaging, alpha-aware)
3. palette reduction (median cut) and hard alpha
4. 1px dark outline around the silhouette
Writes <out.png> at 1x and, with --preview N, <out>@Nx.png (nearest-neighbour upscale).
"""
import argparse
from collections import deque

import numpy as np
from PIL import Image


def remove_background(rgb, tol=38):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(int)
    bg = np.median(border, axis=0)
    near = np.abs(rgb.astype(int) - bg).sum(axis=2) < tol
    mask = np.zeros((h, w), bool)  # True = background
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or mask[y, x] or not near[y, x]:
            continue
        mask[y, x] = True
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return ~mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--height', type=int, default=64)
    ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--preview', type=int, default=0)
    ap.add_argument('--outline', default='#141626')
    a = ap.parse_args()

    im = Image.open(a.src).convert('RGB')
    rgb = np.array(im)
    fg = remove_background(rgb)
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, (fg * 255).astype(np.uint8)])[y0:y1, x0:x1]

    # alpha-aware downscale: premultiply, area-average, unpremultiply
    H = a.height
    W = max(1, round((x1 - x0) * H / (y1 - y0)))
    pm = rgba.astype(float)
    pm[..., :3] *= pm[..., 3:4] / 255
    small = np.array(Image.fromarray(pm.clip(0, 255).astype(np.uint8), 'RGBA').resize((W, H), Image.BOX)).astype(float)
    al = small[..., 3]
    with np.errstate(invalid='ignore', divide='ignore'):
        small[..., :3] = np.where(al[..., None] > 0, small[..., :3] * 255 / al[..., None], 0)
    solid = al > 110

    # palette reduction on the subject only
    rgb_s = small[..., :3].clip(0, 255).astype(np.uint8)
    pal_img = Image.fromarray(rgb_s[solid].reshape(-1, 1, 3), 'RGB').quantize(colors=a.colors, method=Image.MEDIANCUT)
    q = np.array(pal_img.convert('RGB')).reshape(-1, 3)
    out = np.zeros((H + 2, W + 2, 4), np.uint8)
    body = np.zeros((H, W, 3), np.uint8); body[solid] = q
    out[1:-1, 1:-1, :3] = body
    out[1:-1, 1:-1, 3] = solid * 255

    # outline: transparent pixels touching the subject
    ol = tuple(int(a.outline[i:i + 2], 16) for i in (1, 3, 5))
    s = out[..., 3] > 0
    ring = np.zeros_like(s)
    ring[1:] |= s[:-1]; ring[:-1] |= s[1:]; ring[:, 1:] |= s[:, :-1]; ring[:, :-1] |= s[:, 1:]
    ring &= ~s
    out[ring] = (*ol, 255)

    img = Image.fromarray(out, 'RGBA')
    img.save(a.dst)
    if a.preview:
        p = a.dst.rsplit('.', 1)
        img.resize((img.width * a.preview, img.height * a.preview), Image.NEAREST).save(f'{p[0]}@{a.preview}x.{p[1]}')
    print(f'{a.dst}: {img.width}x{img.height}')


if __name__ == '__main__':
    main()
