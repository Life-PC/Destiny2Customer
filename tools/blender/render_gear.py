"""Blender script: load gear OBJs (Destiny model space, z up) and render orthographic views with transparent background.

    blender -b -P tools/blender/render_gear.py -- --objs a.obj b.obj ... --out art/gear3d/render/set --views front,left
Workbench engine (fast, CPU-friendly): studio lighting + cavity + object outline, one colour per piece.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
objs, out, views, size = [], 'render', ['front', 'left'], 768
i = 0
while i < len(argv):
    if argv[i] == '--objs':
        i += 1
        while i < len(argv) and not argv[i].startswith('--'): objs.append(argv[i]); i += 1
        continue
    if argv[i] == '--out': out = argv[i + 1]; i += 2; continue
    if argv[i] == '--views': views = argv[i + 1].split(','); i += 2; continue
    if argv[i] == '--size': size = int(argv[i + 1]); i += 2; continue
    i += 1

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
PALETTE = [(0.85, 0.85, 0.88), (0.95, 0.55, 0.25), (0.55, 0.7, 0.9), (0.6, 0.8, 0.55), (0.8, 0.6, 0.85), (0.9, 0.85, 0.5)]
meshes = []
for k, p in enumerate(objs):
    bpy.ops.wm.obj_import(filepath=p, forward_axis='Y', up_axis='Z')
    for o in bpy.context.selected_objects:
        o.color = (*PALETTE[k % len(PALETTE)], 1)
        meshes.append(o)

# bounds of everything
lo = Vector((1e9, 1e9, 1e9)); hi = -lo
for o in meshes:
    for v in o.bound_box:
        w = o.matrix_world @ Vector(v)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
c = (lo + hi) / 2; ext = max(hi - lo)

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = ext * 1.1
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'OBJECT'; sh.show_cavity = True; sh.cavity_type = 'BOTH'
sh.show_object_outline = True; sh.object_outline_color = (0.05, 0.05, 0.08)
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

# Destiny model space: the character faces +x, z up. View names = where the camera stands.
# side_r: profile facing screen-right (the player side of the battle); side_l: facing left (enemy side).
DIRS = {'front': Vector((1, 0, 0)), 'back': Vector((-1, 0, 0)), 'side_r': Vector((0, -1, 0)), 'side_l': Vector((0, 1, 0)),
        'front34': Vector((0.7, -0.7, 0)).normalized()}
for v in views:
    d = DIRS[v]
    cam.location = c + d * (ext * 3)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}_{v}.png'
    bpy.ops.render.render(write_still=True)
    print('wrote', sc.render.filepath)
