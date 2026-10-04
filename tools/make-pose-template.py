#!/usr/bin/env python3
"""Pose sheet template: 4 poses x 3 frames (one outfit = one character, facing right).

    python tools/make-pose-template.py     → art/templates/pose_sheet.png (1536x2048, 3 columns x 4 rows)

Rows: IDLE (breathing loop) / SHOOT (raise, fire, recoil) / MELEE (wind-up, strike, follow-through) /
SUPER (charge, jump, slam). Every cell has the same ground line and the same feet mark, so the
character's movement between frames is kept when the sheet is cut (tools/import-poses.py).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'art', 'templates')
os.makedirs(OUT, exist_ok=True)
W, H, COLS, ROWS = 1536, 2048, 3, 4
CW, CH = W // COLS, H // ROWS
GROUND = CH - 70          # ground line inside a cell
FOOT_X = CW // 2 - 40     # idle feet centre inside a cell
NEAR, FAR, EDGE, GRID, TXT, MARK = (214, 218, 226), (186, 191, 202), (140, 146, 160), (228, 231, 238), (60, 66, 80), (220, 40, 60)


def font(sz):
    for f in ('C:/Windows/Fonts/consolab.ttf', 'C:/Windows/Fonts/arialbd.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


F, FS = font(26), font(17)
# body proportions (chibi, ~3.5 heads): head radius, torso, limb segment lengths / widths
HEAD_R, TORSO_H, TORSO_W, UA, FA, TH, SH, LIMB, LEG = 58, 120, 96, 62, 66, 72, 76, 30, 36


def seg(d, x, y, ang, length, width, col):
    """limb segment from (x, y); ang in degrees from straight down, + = toward the right (forward)."""
    a = math.radians(ang)
    x2, y2 = x + math.sin(a) * length, y + math.cos(a) * length
    for c, w in ((EDGE, width + 5), (col, width)):   # outlined so limbs read in front of the body
        d.line((x, y, x2, y2), fill=c, width=w)
        r = w / 2
        for px, py in ((x, y), (x2, y2)):
            d.ellipse((px - r, py - r, px + r, py + r), fill=c)
    return x2, y2


def figure(d, ox, oy, p):
    """ox, oy = cell origin. p = pose dict (angles in degrees, offsets in px)."""
    fx, fy = ox + FOOT_X + p.get('dx', 0), oy + GROUND + p.get('dy', 0)
    crouch = p.get('crouch', 0)
    hip_y = fy - (TH + SH) * math.cos(math.radians(crouch * 0.6)) + crouch * 0.3
    hip = (fx, hip_y)
    lean = math.radians(p.get('lean', 0))
    top = (hip[0] + math.sin(lean) * TORSO_H, hip[1] - math.cos(lean) * TORSO_H)
    sh_far = (top[0] - 14, top[1] + 16)
    sh_near = (top[0] + 10, top[1] + 16)
    # far limbs (behind the body)
    k = seg(d, hip[0] - 10, hip[1], p.get('tf', -6) - crouch, TH, LEG, FAR)
    seg(d, *k, p.get('tf', -6) - crouch + p.get('kf', 0) + crouch * 1.6, SH, LEG - 4, FAR)
    e = seg(d, *sh_far, p.get('af', -8), UA, LIMB, FAR)
    seg(d, *e, p.get('af', -8) + p.get('ef', 10), FA, LIMB - 4, FAR)
    # torso + head
    tw = TORSO_W / 2
    poly = [(hip[0] - tw * 0.8, hip[1]), (hip[0] + tw * 0.8, hip[1]), (top[0] + tw, top[1]), (top[0] - tw, top[1])]
    d.polygon(poly, fill=NEAR, outline=EDGE)
    hc = (top[0] + math.sin(lean) * HEAD_R * 0.9 + 6, top[1] - HEAD_R * 0.9)
    d.ellipse((hc[0] - HEAD_R, hc[1] - HEAD_R, hc[0] + HEAD_R, hc[1] + HEAD_R), fill=NEAR, outline=EDGE, width=2)
    d.arc((hc[0] - HEAD_R * 0.3, hc[1] - 18, hc[0] + HEAD_R * 0.95, hc[1] + 22), 300, 60, fill=EDGE, width=4)   # visor faces right
    # near limbs (in front)
    k = seg(d, hip[0] + 12, hip[1], p.get('tn', 6) + crouch, TH, LEG, NEAR)
    seg(d, *k, p.get('tn', 6) + crouch + p.get('kn', 0) - crouch * 1.6, SH, LEG - 4, NEAR)
    e = seg(d, *sh_near, p.get('an', 8), UA, LIMB, NEAR)
    hand = seg(d, *e, p.get('an', 8) + p.get('en', -10), FA, LIMB - 4, NEAR)
    if p.get('gun'):   # gun in the near hand, along the forearm
        a = math.radians(p.get('an', 8) + p.get('en', -10))
        gx, gy = hand[0] + math.sin(a) * 46, hand[1] + math.cos(a) * 46
        d.line((hand[0], hand[1], gx, gy), fill=EDGE, width=14)
        if p.get('flash'):
            d.ellipse((gx - 18 + math.sin(a) * 20, gy - 18 + math.cos(a) * 20, gx + 18 + math.sin(a) * 20, gy + 18 + math.cos(a) * 20), outline=MARK, width=4)
    if p.get('ring'):
        d.ellipse((fx - 150, fy - 24, fx + 150, fy + 24), outline=MARK, width=4)


POSES = [
    ('IDLE', [dict(an=22, en=-8, af=-16, gun=1), dict(an=25, en=-10, af=-18, crouch=5, gun=1), dict(an=20, en=-6, af=-14, gun=1)]),
    ('SHOOT', [dict(an=55, en=10, af=-14, gun=1), dict(an=90, en=0, af=-18, lean=-3, gun=1, flash=1), dict(an=104, en=-6, af=-20, lean=-8, dx=-8, gun=1)]),
    ('MELEE', [dict(an=-55, en=95, af=20, lean=-10, dx=-10, tn=-6, tf=-14, gun=1), dict(an=88, en=0, af=-35, lean=12, dx=34, tn=32, tf=-20, kn=-10, gun=1),
               dict(an=62, en=-10, af=-20, lean=6, dx=24, tn=18, tf=-12, gun=1)]),
    ('SUPER', [dict(an=-20, en=40, af=20, crouch=50, lean=8, gun=1), dict(an=125, en=10, af=-125, dy=0, tn=40, tf=-10, kn=-85, kf=60, gun=1),
               dict(an=60, en=10, af=-60, crouch=40, lean=14, dx=10, ring=1, gun=1)]),
]
LABELS = {'IDLE': ['breathe 1', 'breathe 2', 'breathe 3'], 'SHOOT': ['raise', 'fire', 'recoil'],
          'MELEE': ['wind-up', 'strike', 'follow-through'], 'SUPER': ['charge', 'jump / cast', 'slam']}


def main():
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    for r, (name, frames) in enumerate(POSES):
        for c, pose in enumerate(frames):
            ox, oy = c * CW, r * CH
            d.text((ox + 18, oy + 14), f'{name} {c + 1}', fill=TXT, font=F)
            d.text((ox + 18, oy + 46), LABELS[name][c], fill=EDGE, font=FS)
            d.line((ox + 30, oy + GROUND, ox + CW - 30, oy + GROUND), fill=GRID, width=3)        # ground line
            d.line((ox + FOOT_X, oy + GROUND - 6, ox + FOOT_X, oy + GROUND + 10), fill=MARK, width=3)  # idle feet mark
            figure(d, ox, oy, pose)
            if c: d.line((ox, oy + 8, ox, oy + CH - 8), fill=GRID, width=2)
        if r: d.line((8, r * CH, W - 8, r * CH), fill=GRID, width=3)
    d.text((18, H - 30), 'facing RIGHT (3/4 view) · same character, same scale in every frame · feet on the ground line (except the jump) · plain white background', fill=EDGE, font=FS)
    im.save(os.path.join(OUT, 'pose_sheet.png'))
    print('→', os.path.abspath(os.path.join(OUT, 'pose_sheet.png')))


if __name__ == '__main__':
    main()
