#!/usr/bin/env python3
"""Pose sheet templates for one-piece outfit art (one character, facing right, 3 frames per pose).

    python tools/make-pose-template.py
      → art/templates/pose_base.png   3 x 3 : IDLE (breathing loop) / SHOOT / MELEE  (sidearm in hand)
      → art/templates/pose_super.png  3 x 7 : the 7 super patterns, EMPTY hands (the game adds the Light
                                              weapon / beam / orb in the super's element color)
      → art/templates/pose_anchors.json     hand positions + forearm angles per frame (cell pixels),
                                              used by tools/import-poses.py and the game overlays
Super patterns (see battle/content.js SUPER_POSE):
  beam  one hand thrust, emitting (Chaos Reach, Stormtrance)
  orb   two-hand charge and release (Nova Bomb, Needlestorm)
  gun   aim and fire a summoned weapon (Golden Gun, Shadowshot)
  blade swing a summoned melee weapon (Arc Staff, Spectral Blades, Bladefury, Dawnblade, Burning Maul, Sentinel Shield, ...)
  throw throw a summoned weapon (Hammer of Sol, Twilight Arsenal, Silence and Squall, Gathering Storm, Storm's Edge, Blade Barrage)
  slam  leap and slam (Fists of Havoc, Glacial Quake, Thundercrash)
  field activate in place (Well of Radiance, Ward of Dawn, Song of Flame, Nova Warp)
Every cell has the same ground line and feet mark, so movement between frames is kept when cut.
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'art', 'templates')
os.makedirs(OUT, exist_ok=True)
CW = CH = 512
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
    """ox, oy = cell origin; p = pose (angles in degrees, offsets in px). Returns hand anchors (cell px)."""
    fx, fy = ox + FOOT_X + p.get('dx', 0), oy + GROUND + p.get('dy', 0)
    crouch = p.get('crouch', 0)
    hip = (fx, fy - (TH + SH) * math.cos(math.radians(crouch * 0.6)) + crouch * 0.3)
    lean = math.radians(p.get('lean', 0))
    top = (hip[0] + math.sin(lean) * TORSO_H, hip[1] - math.cos(lean) * TORSO_H)
    sh_far, sh_near = (top[0] - 14, top[1] + 16), (top[0] + 10, top[1] + 16)
    af, ef, an, en = p.get('af', -8), p.get('ef', 10), p.get('an', 8), p.get('en', -10)
    # far limbs (behind the body)
    k = seg(d, hip[0] - 10, hip[1], p.get('tf', -6) - crouch, TH, LEG, FAR)
    seg(d, *k, p.get('tf', -6) - crouch + p.get('kf', 0) + crouch * 1.6, SH, LEG - 4, FAR)
    e = seg(d, *sh_far, af, UA, LIMB, FAR)
    far_hand = seg(d, *e, af + ef, FA, LIMB - 4, FAR)
    # torso + head
    tw = TORSO_W / 2
    d.polygon([(hip[0] - tw * 0.8, hip[1]), (hip[0] + tw * 0.8, hip[1]), (top[0] + tw, top[1]), (top[0] - tw, top[1])], fill=NEAR, outline=EDGE)
    hc = (top[0] + math.sin(lean) * HEAD_R * 0.9 + 6, top[1] - HEAD_R * 0.9)
    d.ellipse((hc[0] - HEAD_R, hc[1] - HEAD_R, hc[0] + HEAD_R, hc[1] + HEAD_R), fill=NEAR, outline=EDGE, width=2)
    d.arc((hc[0] - HEAD_R * 0.3, hc[1] - 18, hc[0] + HEAD_R * 0.95, hc[1] + 22), 300, 60, fill=EDGE, width=4)   # visor faces right
    # near limbs (in front)
    k = seg(d, hip[0] + 12, hip[1], p.get('tn', 6) + crouch, TH, LEG, NEAR)
    seg(d, *k, p.get('tn', 6) + crouch + p.get('kn', 0) - crouch * 1.6, SH, LEG - 4, NEAR)
    e = seg(d, *sh_near, an, UA, LIMB, NEAR)
    hand = seg(d, *e, an + en, FA, LIMB - 4, NEAR)
    if p.get('gun'):   # sidearm in the near hand, along the forearm
        a = math.radians(an + en)
        gx, gy = hand[0] + math.sin(a) * 46, hand[1] + math.cos(a) * 46
        d.line((hand[0], hand[1], gx, gy), fill=EDGE, width=14)
        if p.get('flash'):
            d.ellipse((gx - 18 + math.sin(a) * 20, gy - 18 + math.cos(a) * 20, gx + 18 + math.sin(a) * 20, gy + 18 + math.cos(a) * 20), outline=MARK, width=4)
    if p.get('empty'):  # super frames: mark the empty hand(s) where the game adds the Light weapon / energy
        for hx, hy in ([hand] + ([far_hand] if p.get('both') else [])):
            d.ellipse((hx - 22, hy - 22, hx + 22, hy + 22), outline=MARK, width=3)
    if p.get('ring'):
        d.ellipse((fx - 150, fy - 24, fx + 150, fy + 24), outline=MARK, width=3)
    return {'hand': [round(hand[0] - ox, 1), round(hand[1] - oy, 1)], 'ang': an + en,
            'far': [round(far_hand[0] - ox, 1), round(far_hand[1] - oy, 1)], 'fang': af + ef,
            'foot': [round(fx - ox, 1), round(fy - oy, 1)]}


BASE = [
    ('IDLE', ['breathe 1', 'breathe 2', 'breathe 3'],
     [dict(an=22, en=-8, af=-16, gun=1), dict(an=25, en=-10, af=-18, crouch=5, gun=1), dict(an=20, en=-6, af=-14, gun=1)]),
    ('SHOOT', ['raise', 'fire', 'recoil'],
     [dict(an=55, en=10, af=-14, gun=1), dict(an=90, en=0, af=-18, lean=-3, gun=1, flash=1), dict(an=104, en=-6, af=-20, lean=-8, dx=-8, gun=1)]),
    ('MELEE', ['wind-up', 'strike', 'follow-through'],
     [dict(an=-55, en=95, af=20, lean=-10, dx=-10, tn=-6, tf=-14, gun=1), dict(an=88, en=0, af=-35, lean=12, dx=34, tn=32, tf=-20, kn=-10, gun=1),
      dict(an=62, en=-10, af=-20, lean=6, dx=24, tn=18, tf=-12, gun=1)]),
]
E = dict(empty=1)
SUPER = [
    ('BEAM', 'Chaos Reach / Stormtrance', ['pull back', 'thrust one hand', 'keep emitting'],
     [dict(an=-35, en=70, af=-20, lean=-6, **E), dict(an=92, en=0, af=-30, lean=6, dx=6, **E), dict(an=96, en=-4, af=-34, lean=9, dx=8, **E)]),
    ('ORB', 'Nova Bomb / Needlestorm', ['gather between hands', 'push both hands', 'follow-through'],
     [dict(an=45, en=-75, af=45, ef=-65, lean=-4, both=1, **E), dict(an=88, en=-4, af=84, ef=0, lean=8, dx=10, both=1, **E),
      dict(an=76, en=-10, af=70, ef=-6, lean=12, dx=16, both=1, **E)]),
    ('GUN', 'Golden Gun / Shadowshot', ['summon', 'aim', 'fire & recoil'],
     [dict(an=40, en=20, af=-10, **E), dict(an=90, en=0, af=70, ef=12, both=1, **E), dict(an=102, en=-6, af=78, ef=6, lean=-6, dx=-6, both=1, **E)]),
    ('BLADE', 'sword / staff / shield / hammer', ['raise overhead', 'swing', 'follow-through'],
     [dict(an=165, en=10, af=-30, lean=-6, **E), dict(an=88, en=-6, af=-40, lean=12, dx=30, tn=30, tf=-18, kn=-10, **E),
      dict(an=35, en=-10, af=-20, lean=16, dx=32, tn=26, tf=-14, **E)]),
    ('THROW', 'hammer / axe / sickle / knives', ['wind up overhead', 'throw', 'follow-through'],
     [dict(an=-150, en=-30, af=40, lean=-10, dx=-6, **E), dict(an=100, en=0, af=-35, lean=12, dx=20, tn=25, tf=-16, **E),
      dict(an=50, en=-10, af=-25, lean=16, dx=24, tn=20, tf=-12, **E)]),
    ('SLAM', 'Fists of Havoc / Glacial Quake', ['crouch', 'leap', 'slam the ground'],
     [dict(an=-20, en=40, af=20, crouch=45, lean=8, **E), dict(an=150, en=0, af=-150, tn=40, tf=-10, kn=-85, kf=60, both=1, **E),
      dict(an=40, en=55, af=-40, crouch=50, lean=20, ring=1, both=1, **E)]),
    ('FIELD', 'Well / Ward / Song of Flame', ['raise both hands', 'plant / cast', 'hold'],
     [dict(an=150, en=0, af=-150, both=1, **E), dict(an=30, en=-10, af=-30, crouch=22, lean=6, both=1, **E), dict(an=100, en=0, af=-100, ring=1, both=1, **E)]),
]


def sheet(rows, name, title_of):
    W, H = CW * 3, CH * len(rows)
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    anchors = {}
    for r, row in enumerate(rows):
        key, labels, frames = row[0], row[-2], row[-1]
        for c, pose in enumerate(frames):
            ox, oy = c * CW, r * CH
            d.text((ox + 18, oy + 14), f'{key} {c + 1}', fill=TXT, font=F)
            d.text((ox + 18, oy + 46), labels[c], fill=EDGE, font=FS)
            if c == 0 and len(row) == 4: d.text((ox + 18, oy + 68), row[1], fill=MARK, font=FS)
            d.line((ox + 30, oy + GROUND, ox + CW - 30, oy + GROUND), fill=GRID, width=3)
            d.line((ox + FOOT_X, oy + GROUND - 6, ox + FOOT_X, oy + GROUND + 10), fill=MARK, width=3)
            anchors[f'{key.lower()}_{c + 1}'] = figure(d, ox, oy, pose)
            if c: d.line((ox, oy + 8, ox, oy + CH - 8), fill=GRID, width=2)
        if r: d.line((8, r * CH, W - 8, r * CH), fill=GRID, width=3)
    im.save(os.path.join(OUT, name))
    return anchors


def main():
    a = sheet(BASE, 'pose_base.png', lambda row: row[0])
    a.update(sheet(SUPER, 'pose_super.png', lambda row: f'{row[0]} · {row[1]}'))
    json.dump({'cell': [CW, CH], 'ground': GROUND, 'footX': FOOT_X, 'frames': a}, open(os.path.join(OUT, 'pose_anchors.json'), 'w'), indent=1)
    old = os.path.join(OUT, 'pose_sheet.png')
    if os.path.exists(old): os.remove(old)
    print('→', os.path.abspath(OUT), '(pose_base.png, pose_super.png, pose_anchors.json)')


if __name__ == '__main__':
    main()
