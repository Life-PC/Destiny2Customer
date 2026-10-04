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


def remove_background(rgb, step=14):
    """Flood fill from the borders over light, unsaturated pixels, following smooth gradients
    (vignettes, soft ground shadows) but stopping at the subject's outline (a sharp color step)."""
    h, w, _ = rgb.shape
    c = rgb.astype(int)
    sat = c.max(axis=2) - c.min(axis=2)
    lum = c.mean(axis=2)
    cand = (sat < 30) & (lum > 105)
    mask = np.zeros((h, w), bool)  # True = background
    q = deque((x, y) for y in (0, h - 1) for x in range(w) if cand[y, x])
    q.extend((x, y) for x in (0, w - 1) for y in range(h) if cand[y, x])
    for x, y in q:
        mask[y, x] = True
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny, nx] and cand[ny, nx] \
                    and np.abs(c[ny, nx] - c[y, x]).sum() < step:
                mask[ny, nx] = True
                q.append((nx, ny))
    # enclosed background (e.g. between the legs): flat patches of the border background color
    bg = np.median(c[mask], axis=0) if mask.any() else np.array([255, 255, 255])
    flat = (~mask) & (np.abs(c - bg).sum(axis=2) < 14) & (sat < 16)
    seen = np.zeros((h, w), bool)
    for sy, sx in zip(*np.nonzero(flat)):
        if seen[sy, sx]:
            continue
        comp, q = [], deque([(sx, sy)])
        seen[sy, sx] = True
        while q:
            x, y = q.popleft(); comp.append((y, x))
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and flat[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((nx, ny))
        if len(comp) > h * w * 0.0015:
            ys, xs = zip(*comp)
            if c[list(ys), list(xs)].std(axis=0).max() < 4:  # really flat → background, not a highlight
                mask[list(ys), list(xs)] = True
    return ~mask


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--height', type=int, default=64)
    ap.add_argument('--colors', type=int, default=24)
    ap.add_argument('--preview', type=int, default=0)
    ap.add_argument('--outline', default='#141626')
    ap.add_argument('--mode', choices=['vote', 'average'], default='vote')
    ap.add_argument('--boost', type=float, default=1.15, help='saturation boost before palette reduction')
    a = ap.parse_args()

    im = Image.open(a.src).convert('RGB')
    rgb = np.array(im)
    fg = remove_background(rgb)
    ys, xs = np.nonzero(fg)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb, (fg * 255).astype(np.uint8)])[y0:y1, x0:x1]

    H = a.height
    W = max(1, round((x1 - x0) * H / (y1 - y0)))
    if a.mode == 'vote':
        out = vote_downscale(rgba, W, H, a.colors, a.boost)
        finish(out, a)
        return

    # alpha-aware downscale: premultiply, area-average, unpremultiply
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
    finish(out, a)


def vote_downscale(rgba, W, H, colors, boost):
    """Pixel-art downscale: reduce the palette at full resolution, then give each output dot the
    color that wins a vote inside its source block (dark outline colors get extra weight, so line
    work survives). Keeps flat color areas and edges crisp instead of averaging them into mud."""
    from PIL import ImageEnhance
    sh, sw = rgba.shape[:2]
    rgb_im = ImageEnhance.Color(Image.fromarray(rgba[..., :3], 'RGB')).enhance(boost)
    rgb_im = ImageEnhance.Contrast(rgb_im).enhance(1.08)
    solid_src = rgba[..., 3] > 127
    src = np.array(rgb_im)
    pal = Image.fromarray(src[solid_src].reshape(-1, 1, 3), 'RGB').quantize(colors=colors, method=Image.MEDIANCUT, kmeans=3)
    palette = np.array(pal.getpalette()[:colors * 3]).reshape(-1, 3)
    idx = np.full((sh, sw), -1, int)
    idx[solid_src] = np.array(pal).reshape(-1)
    lum = palette.mean(axis=1)
    weight = np.where(lum < 60, 1.7, 1.0)  # outlines / deep shadows win ties
    out = np.zeros((H + 2, W + 2, 4), np.uint8)
    for y in range(H):
        ya, yb = int(y * sh / H), max(int(y * sh / H) + 1, int((y + 1) * sh / H))
        for x in range(W):
            xa, xb = int(x * sw / W), max(int(x * sw / W) + 1, int((x + 1) * sw / W))
            blk = idx[ya:yb, xa:xb].reshape(-1)
            if (blk >= 0).mean() < 0.5:
                continue
            cnt = np.bincount(blk[blk >= 0], minlength=len(palette)) * weight
            out[y + 1, x + 1, :3] = palette[cnt.argmax()]
            out[y + 1, x + 1, 3] = 255
    return out


def finish(out, a):
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
