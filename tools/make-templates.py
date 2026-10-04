#!/usr/bin/env python3
"""Draw the layout templates given to the image AI (with the API reference images) so every generated
sheet has the same cells, part shapes, scale and joint sockets. Output: art/templates/*.png

    python tools/make-templates.py

armor_set.png : full body + 12 parts (front view, 3 heads tall, round joint sockets)
weapons.png   : 6 weapon cells (side view, muzzle to the right, grip marker)
ghost.png     : full ghost + eye core + 4 shell petals (open/close animation) + side view
Joint sockets are dark circles with a red cross; the assembler finds them automatically.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'art', 'templates')
os.makedirs(OUT, exist_ok=True)
SIL, EDGE, SOCK, RED, TXT, GRID = (217, 220, 227), (150, 156, 170), (42, 46, 56), (220, 40, 60), (60, 66, 80), (232, 234, 240)


def font(sz, bold=True):
    for f in (['C:/Windows/Fonts/consolab.ttf', 'C:/Windows/Fonts/arialbd.ttf'] if bold else ['C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf']):
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


F, FS = font(22), font(15, False)


def socket(d, x, y, r=13):
    d.ellipse((x - r, y - r, x + r, y + r), fill=SOCK)
    d.line((x - r - 5, y, x + r + 5, y), fill=RED, width=2)
    d.line((x, y - r - 5, x, y + r + 5), fill=RED, width=2)


def capsule(d, x, y, w, h):
    d.rounded_rectangle((x - w / 2, y, x + w / 2, y + h), radius=w / 2, fill=SIL, outline=EDGE, width=2)


def label(d, cx, y, text):
    w = d.textlength(text, font=F)
    d.text((cx - w / 2, y), text, fill=TXT, font=F)


# ---------------- part shapes (local coords, socket = joint) ----------------
def head(d, x, y):            # x,y = neck socket
    d.ellipse((x - 75, y - 170, x + 75, y - 5), fill=SIL, outline=EDGE, width=2)
    d.arc((x - 62, y - 120, x + 62, y - 30), 200, 340, fill=EDGE, width=3)   # visor line
    socket(d, x, y - 8)


def torso(d, x, y):           # x,y = neck socket (top centre)
    d.polygon([(x - 100, y + 25), (x + 100, y + 25), (x + 78, y + 230), (x - 78, y + 230)], fill=SIL, outline=EDGE)
    d.rectangle((x - 82, y + 205, x + 82, y + 232), fill=(200, 203, 212), outline=EDGE)   # belt
    socket(d, x, y + 8); socket(d, x - 92, y + 48); socket(d, x + 92, y + 48)


def pelvis(d, x, y):          # x,y = belt centre (attaches to the torso belt)
    d.rectangle((x - 84, y - 14, x + 84, y + 26), fill=(200, 203, 212), outline=EDGE)
    d.polygon([(x - 80, y + 26), (x + 80, y + 26), (x + 96, y + 150), (x - 96, y + 150)], fill=SIL, outline=EDGE)
    socket(d, x - 52, y + 6); socket(d, x + 52, y + 6)


def class_item(d, x, y):      # x,y = attach point (upper back / shoulders)
    d.polygon([(x - 70, y), (x + 70, y), (x + 95, y + 300), (x + 20, y + 270), (x - 30, y + 305), (x - 95, y + 290)], fill=SIL, outline=EDGE)
    socket(d, x, y + 6)


def upper_arm(d, x, y):       # x,y = shoulder socket
    capsule(d, x, y - 22, 62, 210); socket(d, x, y)
    d.ellipse((x - 22, y + 150, x + 22, y + 194), outline=EDGE, width=2)     # elbow knob


def forearm(d, x, y):         # x,y = elbow socket
    capsule(d, x, y - 22, 60, 200); socket(d, x, y)
    d.rounded_rectangle((x - 34, y + 170, x + 34, y + 262), radius=18, fill=SIL, outline=EDGE, width=2)   # hand


def thigh(d, x, y):           # x,y = hip socket
    capsule(d, x, y - 24, 76, 240); socket(d, x, y)
    d.ellipse((x - 24, y + 160, x + 24, y + 208), outline=EDGE, width=2)     # knee knob


def shin(d, x, y):            # x,y = knee socket
    capsule(d, x, y - 24, 70, 230); socket(d, x, y)
    d.rounded_rectangle((x - 40, y + 190, x + 52, y + 262), radius=14, fill=SIL, outline=EDGE, width=2)   # boot


def armor_set():
    W, H = 1536, 1024
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    # full body (assembled at the same scale): torso neck at (190, 250)
    label(d, 190, 40, 'FULL BODY')
    nx, ny = 190, 300
    s = 0.55
    full = Image.new('RGBA', (W, H), (0, 0, 0, 0)); fd = ImageDraw.Draw(full)
    bx, by = 400, 330
    for f, ox, oy in [(thigh, -52, 238), (thigh, 52, 238), (shin, -52, 446), (shin, 52, 446), (pelvis, 0, 232),
                      (upper_arm, -92, 48), (upper_arm, 92, 48), (forearm, -92, 220), (forearm, 92, 220), (torso, 0, 0), (head, 0, 4)]:
        f(fd, bx + ox, by + oy)
    full = full.crop((bx - 200, by - 200, bx + 200, by + 750))
    full = full.resize((int(full.width * s * 1.15), int(full.height * s * 1.15)))
    im.paste(full, (nx - full.width // 2, 80), full)
    d.line((360, 30, 360, H - 30), fill=GRID, width=2)
    cells = [('HEAD', head, 0, 190), ('TORSO', torso, 0, -20), ('HIP / PELVIS', pelvis, 0, 0), ('CLASS ITEM', class_item, 0, -60),
             ('L UPPER ARM', upper_arm, 0, -30), ('L FOREARM+HAND', forearm, 0, -40),
             ('R UPPER ARM', upper_arm, 0, -30), ('R FOREARM+HAND', forearm, 0, -40), ('L THIGH', thigh, 0, -60),
             ('L SHIN+BOOT', shin, 0, -60), ('R THIGH', thigh, 0, -60), ('R SHIN+BOOT', shin, 0, -60)]
    cw, ch = (W - 380) / 6, (H - 40) / 2
    for i, (name, f, dx, dy) in enumerate(cells):
        cx, top = 380 + cw * (i % 6) + cw / 2, 20 + ch * (i // 6)
        label(d, cx, top + 14, name)
        part = Image.new('RGBA', (400, 600), (0, 0, 0, 0)); pd = ImageDraw.Draw(part)
        f(pd, 200, 200 + dy + (0 if name != 'HEAD' else 0))
        bb = part.getbbox(); part = part.crop(bb)
        k = min(1, (cw - 30) / part.width, (ch - 70) / part.height) * 0.86
        part = part.resize((int(part.width * k), int(part.height * k)))
        im.paste(part, (int(cx - part.width / 2), int(top + 56)), part)
        if i % 6: d.line((380 + cw * (i % 6), top + 10, 380 + cw * (i % 6), top + ch - 10), fill=GRID, width=1)
    d.line((380, 20 + ch, W - 20, 20 + ch), fill=GRID, width=2)
    d.text((380, H - 26), 'front view · plain white background · dark round joint sockets (red cross = joint) · same scale for every part', fill=(140, 146, 160), font=FS)
    im.save(os.path.join(OUT, 'armor_set.png'))


def weapons():
    W, H = 1536, 1024
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    cw, ch = W / 3, H / 2
    for i in range(6):
        x0, y0 = cw * (i % 3), ch * (i // 3)
        cx, cy = x0 + cw / 2 - 30, y0 + ch / 2 + 10
        label(d, cx, y0 + 18, f'WEAPON {i + 1}  (name)')
        # silhouette: stock - body - barrel, muzzle to the right
        d.rounded_rectangle((cx - 200, cy - 40, cx + 120, cy + 22), radius=10, fill=SIL, outline=EDGE, width=2)
        d.rectangle((cx + 120, cy - 28, cx + 210, cy - 6), fill=SIL, outline=EDGE)
        d.polygon([(cx - 70, cy + 22), (cx - 30, cy + 22), (cx - 44, cy + 92), (cx - 88, cy + 92)], fill=SIL, outline=EDGE)   # grip
        socket(d, cx - 62, cy + 50, 11)                                               # hand / grip point
        d.line((cx + 220, cy - 17, cx + 262, cy - 17), fill=RED, width=3)              # muzzle arrow
        d.polygon([(cx + 262, cy - 26), (cx + 280, cy - 17), (cx + 262, cy - 8)], fill=RED)
        d.text((cx - 130, cy + 108), 'grip (hand)          muzzle →', fill=(140, 146, 160), font=FS)
        d.line((x0 + 30, cy + 140, x0 + cw - 30, cy + 140), fill=GRID, width=1)       # baseline
        if i % 3: d.line((x0, y0 + 10, x0, y0 + ch - 10), fill=GRID, width=2)
    d.line((10, ch, W - 10, ch), fill=GRID, width=2)
    d.text((20, H - 26), 'side view · muzzle points RIGHT · horizontal · plain white background · same scale', fill=(140, 146, 160), font=FS)
    im.save(os.path.join(OUT, 'weapons.png'))


def ghost():
    W, H = 1536, 1024
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)

    def shell(dd, cx, cy, r, parts=('tl', 'tr', 'bl', 'br'), eye=True):
        g = r * 0.16
        pts = {'tl': [(cx - g, cy - g), (cx - g, cy - r), (cx - r, cy - g)], 'tr': [(cx + g, cy - g), (cx + g, cy - r), (cx + r, cy - g)],
               'bl': [(cx - g, cy + g), (cx - g, cy + r), (cx - r, cy + g)], 'br': [(cx + g, cy + g), (cx + g, cy + r), (cx + r, cy + g)]}
        for p in parts: dd.polygon(pts[p], fill=SIL, outline=EDGE)
        if eye:
            dd.ellipse((cx - r * .3, cy - r * .3, cx + r * .3, cy + r * .3), fill=(200, 203, 212), outline=EDGE, width=2)
            dd.ellipse((cx - r * .12, cy - r * .12, cx + r * .12, cy + r * .12), fill=(120, 190, 255))

    label(d, 300, 40, 'FULL GHOST (front)'); shell(d, 300, 420, 230)
    socket(d, 300, 420, 8)
    d.line((600, 30, 600, H - 30), fill=GRID, width=2)
    cells = [('EYE CORE', lambda c: shell(d, *c, 140, parts=())), ('SHELL TOP-LEFT', lambda c: shell(d, c[0] + 50, c[1] + 50, 150, parts=('tl',), eye=False)),
             ('SHELL TOP-RIGHT', lambda c: shell(d, c[0] - 50, c[1] + 50, 150, parts=('tr',), eye=False)),
             ('SHELL BOTTOM-LEFT', lambda c: shell(d, c[0] + 50, c[1] - 50, 150, parts=('bl',), eye=False)),
             ('SHELL BOTTOM-RIGHT', lambda c: shell(d, c[0] - 50, c[1] - 50, 150, parts=('br',), eye=False)),
             ('SIDE VIEW (facing right)', None)]
    cw, ch = (W - 620) / 3, (H - 40) / 2
    for i, (name, f) in enumerate(cells):
        cx, top = 620 + cw * (i % 3) + cw / 2, 20 + ch * (i // 3)
        label(d, cx, top + 14, name)
        c = (cx, top + ch / 2 + 20)
        if f: f(c)
        else:
            d.polygon([(c[0] - 110, c[1] - 120), (c[0] + 40, c[1] - 120), (c[0] + 110, c[1]), (c[0] + 40, c[1] + 120), (c[0] - 110, c[1] + 120)], fill=SIL, outline=EDGE)
            d.ellipse((c[0] + 40, c[1] - 30, c[0] + 100, c[1] + 30), fill=(120, 190, 255))
        if i % 3: d.line((620 + cw * (i % 3), top + 10, 620 + cw * (i % 3), top + ch - 10), fill=GRID, width=1)
    d.line((620, 20 + ch, W - 20, 20 + ch), fill=GRID, width=2)
    d.text((620, H - 26), 'shell petals split at the eye so they can open / spin · plain white background · same scale', fill=(140, 146, 160), font=FS)
    im.save(os.path.join(OUT, 'ghost.png'))


if __name__ == '__main__':
    armor_set(); weapons(); ghost()
    print('templates →', os.path.abspath(OUT))
