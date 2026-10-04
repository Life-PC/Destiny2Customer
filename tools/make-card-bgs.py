#!/usr/bin/env python3
"""Painted-style ability card backgrounds, one per element (procedural, no AI needed).

    python tools/make-card-bgs.py   → battle/art/ui/card_<element>.webp  (300 x 520)

Each card: dark base, element-colored glow behind the icon spot (upper fifth), noise clouds, light rays,
sparks, an element motif (solar flare ring / arc lightning / void swirl / stasis shards / strand threads /
prism rainbow / kinetic steel) and a darker lower half so the name and description stay readable.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'battle', 'art', 'ui')
W, H = 300, 520
CX, CY = W / 2, H * 0.21           # icon spot (matches .L-card .ic in the battle HUD)
EL = {
    'solar': (255, 138, 30), 'arc': (121, 187, 255), 'void': (176, 132, 235), 'stasis': (77, 136, 255),
    'strand': (95, 217, 112), 'prism': (255, 107, 213), 'kin': (212, 212, 212),
}
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
DX, DY = xx - CX, yy - CY
R = np.hypot(DX, DY)
ANG = np.arctan2(DY, DX)


def fbm(seed, oct=5, base=4):
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(oct):
        n = base * 2 ** o
        g = rng.random((int(n * H / W) + 2, n + 2)).astype(np.float32)
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.Resampling.BICUBIC)
        acc += amp * np.asarray(im, np.float32) / 255
        tot += amp
        amp *= 0.5
    return acc / tot


def hue(a):
    """rainbow by angle (prism)"""
    h = (a / (2 * math.pi)) % 1.0
    k = lambda n: np.clip(np.abs((h * 6 + n) % 6 - 3) - 1, 0, 1)
    return np.stack([k(0), k(4), k(2)], -1) * 255


def card(el, seed):
    col = np.array(EL[el], np.float32)
    n1, n2 = fbm(seed), fbm(seed + 7, 4, 3)
    # base: deep tinted dark
    base = np.array([10, 12, 20], np.float32) + col * 0.05
    img = np.broadcast_to(base, (H, W, 3)).copy()
    tint = hue(ANG + n1 * 3)[..., :3] * 0.5 + col * 0.3 if el == 'prism' else np.broadcast_to(col, (H, W, 3))
    if el == 'kin': tint = tint * 0.6
    # clouds, stronger near the glow and toward the top
    cloud = np.clip(n1 * 1.6 - 0.55, 0, 1) ** 1.6 * np.exp(-R / 210) * (1.15 - yy / H)
    img += tint * cloud[..., None] * 0.9
    # glow behind the icon
    glow = np.exp(-(R / 70) ** 2) * 1.0 + np.exp(-R / 120) * 0.45
    img += tint * glow[..., None] * 0.75
    img += 255 * (np.exp(-(R / 18) ** 2) * 0.55)[..., None]
    # rays
    rays = (np.cos(ANG * 9 + n2 * 4) * 0.5 + 0.5) ** 6 * np.exp(-R / 150) * (R > 20)
    img += tint * rays[..., None] * 0.5
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    rng = np.random.default_rng(seed + 3)
    # element motif (drawn into a mask, then glowed)
    if el == 'solar':
        for r0, w in ((52, 3), (64, 1), (82, 1)):
            d.ellipse((CX - r0, CY - r0, CX + r0, CY + r0), outline=255, width=w)
        for k in range(16):
            a = k * math.pi / 8
            d.line((CX + math.cos(a) * 88, CY + math.sin(a) * 88, CX + math.cos(a) * (120 + 30 * (k % 2)), CY + math.sin(a) * (120 + 30 * (k % 2))), fill=180, width=1)
    elif el == 'arc':
        for k in range(7):
            a = rng.uniform(0, 2 * math.pi)
            x, y = CX + math.cos(a) * 30, CY + math.sin(a) * 30
            pts = [(x, y)]
            for _ in range(9):
                a += rng.uniform(-0.7, 0.7)
                x += math.cos(a) * rng.uniform(10, 22); y += math.sin(a) * rng.uniform(10, 22)
                pts.append((x, y))
            d.line(pts, fill=255, width=2)
    elif el == 'void':
        for k in range(5):
            pts = []
            for t in np.linspace(0, 4.2, 120):
                r0 = 14 + t * 26
                a = t * 2.1 + k * 2 * math.pi / 5
                pts.append((CX + math.cos(a) * r0, CY + math.sin(a) * r0 * 0.9))
            d.line(pts, fill=200, width=2)
    elif el == 'stasis':
        for k in range(9):
            a = k * 2 * math.pi / 9 + rng.uniform(-0.2, 0.2)
            r0, L, w = rng.uniform(70, 110), rng.uniform(40, 80), rng.uniform(7, 13)
            x, y = CX + math.cos(a) * r0, CY + math.sin(a) * r0
            ux, uy, px, py = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
            d.polygon([(x - ux * L / 2, y - uy * L / 2), (x + px * w, y + py * w), (x + ux * L / 2, y + uy * L / 2), (x - px * w, y - py * w)], outline=255, fill=90)
        d.ellipse((CX - 60, CY - 60, CX + 60, CY + 60), outline=200, width=2)
    elif el == 'strand':
        for k in range(8):
            ph, amp, f = rng.uniform(0, 6), rng.uniform(20, 60), rng.uniform(0.012, 0.025)
            pts = [(x, CY + math.sin(x * f * 2 * math.pi / 2 + ph) * amp + (k - 4) * 6) for x in range(0, W + 1, 4)]
            d.line(pts, fill=170 + k * 10, width=1)
        d.ellipse((CX - 46, CY - 46, CX + 46, CY + 46), outline=255, width=2)
    elif el == 'prism':
        for k in range(6):
            a = k * math.pi / 3 + math.pi / 6
            d.line((CX, CY, CX + math.cos(a) * 200, CY + math.sin(a) * 200), fill=150, width=2)
        d.regular_polygon((CX, CY, 58), 6, outline=255)
        d.regular_polygon((CX, CY, 76), 6, rotation=30, outline=170)
    else:  # kinetic: steel crosshair
        d.ellipse((CX - 56, CY - 56, CX + 56, CY + 56), outline=200, width=2)
        for a in range(4):
            t = a * math.pi / 2
            d.line((CX + math.cos(t) * 40, CY + math.sin(t) * 40, CX + math.cos(t) * 110, CY + math.sin(t) * 110), fill=200, width=2)
    # sparks
    for _ in range(26):
        x, y = rng.uniform(10, W - 10), rng.uniform(10, H * 0.75)
        r0 = rng.uniform(0.6, 1.8)
        d.ellipse((x - r0, y - r0, x + r0, y + r0), fill=int(rng.uniform(140, 255)))
    mk = np.asarray(m, np.float32) / 255
    halo = np.asarray(m.filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    img += tint * (halo * 1.4)[..., None] + (255 * 0.55 + tint * 0.45) * mk[..., None] * 0.9
    # readability: darken the lower half (name / description / footer) + vignette
    low = np.clip((yy / H - 0.36) / 0.26, 0, 1)
    img *= (1 - 0.72 * low)[..., None]
    vig = np.clip(1 - ((xx - W / 2) / (W * 0.62)) ** 2 - ((yy - H * 0.42) / (H * 0.75)) ** 2, 0, 1) ** 0.35
    img *= vig[..., None]
    img += (n2[..., None] - 0.5) * 10            # grain
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    for i, el in enumerate(EL):
        card(el, 11 + i * 17).save(os.path.join(OUT, f'card_{el}.webp'), quality=86)
    print('→', os.path.abspath(OUT), ', '.join(f'card_{e}.webp' for e in EL))


if __name__ == '__main__':
    main()
