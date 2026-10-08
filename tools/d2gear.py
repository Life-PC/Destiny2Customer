#!/usr/bin/env python3
"""Download Destiny 2 gear 3D models from the official Bungie API (mobile gear assets) and convert them to OBJ.

    python tools/d2gear.py <item name or hash> [...] [--out art/gear3d] [--female]
      → art/gear3d/<hash>.obj (+ .json with part info)

Data path (all public API, no game files):
  Manifest → mobileGearAssetDataBases (sqlite, DestinyGearAssetsDefinition: item hash → geometry *.tgxm, textures)
  → https://www.bungie.net/common/destiny2_content/geometry/platform/mobile/geometry/<file>.tgxm
TGXM container: header (magic, version, header size, file count) + table of (name[256], offset u64, size u64).
render_metadata.js describes vertex buffers (stride 32: float4 position (w = bone index), short4 normal, short4 tangent;
second stream: short2 texcoord), a u16 index buffer of triangle strips with 0xFFFF restarts, and stage parts per LOD.
Positions are in the character's model space (metres, z up), so pieces of one set line up when loaded together.
"""
import argparse
import json
import os
import sqlite3
import struct
import sys
import urllib.request
import zipfile

import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..')
API_KEY = '175c13fb6427478d80c153c6c52ccb9d'
BNET = 'https://www.bungie.net'
CACHE = os.path.join(ROOT, 'art', 'gear3d', '_cache')


def get(url, binary=True, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': 'D2Mobius', **(headers or {})})
    data = urllib.request.urlopen(req, timeout=60).read()
    return data if binary else data.decode('utf-8')


def cached(name, url):
    p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        os.makedirs(CACHE, exist_ok=True)
        open(p, 'wb').write(get(url))
    return p


def asset_db():
    meta = json.loads(get(BNET + '/Platform/Destiny2/Manifest/', False, {'X-API-Key': API_KEY}))['Response']
    path = meta['mobileGearAssetDataBases'][-1]['path']
    z = cached(os.path.basename(path) + '.zip', BNET + path)
    with zipfile.ZipFile(z) as zf:
        name = zf.namelist()[0]
        out = os.path.join(CACHE, name)
        if not os.path.exists(out): zf.extract(name, CACHE)
    return sqlite3.connect(out), meta['mobileGearCDN']


def tgxm(path):
    d = open(path, 'rb').read()
    magic, ver, hdr, cnt = struct.unpack_from('<4sIII', d, 0)
    assert magic == b'TGXM', path
    files = {}
    for i in range(cnt):
        o = hdr + i * 272
        fn = d[o:o + 256].split(b'\0')[0].decode()
        off, size = struct.unpack_from('<QQ', d, o + 256)
        files[fn] = d[off:off + size]
    return files


def decode(files):
    """→ (positions Nx3, bone index N, uv Nx2, faces Mx3) for LOD 0 of every render mesh"""
    meta = json.loads(files['render_metadata.js'])
    V, B, UV, F = [], [], [], []
    base = 0
    for rm in meta['render_model']['render_meshes']:
        vb0 = rm['vertex_buffers'][0]
        n = vb0['byte_size'] // vb0['stride_byte_size']
        raw = np.frombuffer(files[vb0['file_name']], dtype='<f4').reshape(n, vb0['stride_byte_size'] // 4)
        V.append(raw[:, :3]); B.append(raw[:, 3].astype(int))
        uv = np.zeros((n, 2), np.float32)
        if len(rm['vertex_buffers']) > 1 and rm['vertex_buffers'][1]['stride_byte_size'] == 4:
            t = np.frombuffer(files[rm['vertex_buffers'][1]['file_name']], dtype='<i2').reshape(-1, 2)[:n].astype(np.float32) / 32767
            uv[:len(t)] = t * np.array(rm['texcoord_scale']) + np.array(rm['texcoord_offset'])
        UV.append(uv)
        ib = np.frombuffer(files[rm['index_buffer']['file_name']], dtype='<u2')
        seen = set()
        for p in rm['stage_part_list']:
            if p['lod_category']['value'] != 0 or p['start_index'] in seen: continue
            seen.add(p['start_index'])
            idx = ib[p['start_index']:p['start_index'] + p['index_count']]
            if p['primitive_type'] == 5:
                s = []
                for i in idx:
                    if i == 0xFFFF: s = []; continue
                    s.append(int(i))
                    if len(s) >= 3:
                        a, b, c = s[-3:]
                        if a != b and b != c and a != c:
                            F.append((base + a, base + b, base + c) if len(s) % 2 else (base + b, base + a, base + c))
            else:
                for k in range(0, len(idx) - 2, 3):
                    F.append(tuple(base + int(x) for x in idx[k:k + 3]))
        base += n
    return np.concatenate(V), np.concatenate(B), np.concatenate(UV), np.array(F, int)


def find_items(queries):
    m = json.load(open(os.path.join(ROOT, 'data', 'manifest-ja.json'), encoding='utf-8'))
    out = []
    for q in queries:
        if q.isdigit(): out.append(next((x for x in m['items'] if x['h'] == int(q)), {'h': int(q), 'n': q})); continue
        hits = [x for x in m['items'] if q in x.get('n', '')]
        if not hits: print('not found:', q, file=sys.stderr)
        out += hits
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('items', nargs='+')
    ap.add_argument('--out', default=os.path.join(ROOT, 'art', 'gear3d'))
    ap.add_argument('--female', action='store_true')
    ap.add_argument('--cls', type=int, default=None, help='only this class (0 Titan, 1 Hunter, 2 Warlock)')
    a = ap.parse_args()
    db, cdn = asset_db()
    os.makedirs(a.out, exist_ok=True)
    for it in find_items(a.items):
        if a.cls is not None and it.get('cl') not in (a.cls, None): continue
        h = it['h']; sid = h - 2 ** 32 if h >= 2 ** 31 else h
        row = db.execute('select json from DestinyGearAssetsDefinition where id=?', (sid,)).fetchone()
        if not row: print('no 3D asset:', h, it.get('n')); continue
        content = [c for c in json.loads(row[0])['content'] if c.get('platform') == 'mobile'][0]
        sets = content.get('female_index_set' if a.female else 'male_index_set') or {}
        geo_idx = sets.get('geometry') or list(range(len(content['geometry'])))
        V, B, UV, F = [], [], [], []
        base = 0
        for gi in geo_idx:
            fn = content['geometry'][gi]
            v, b, uv, f = decode(tgxm(cached(fn, BNET + cdn['Geometry'] + '/' + fn)))
            V.append(v); B.append(b); UV.append(uv); F.append(f + base); base += len(v)
        V, B, UV, F = np.concatenate(V), np.concatenate(B), np.concatenate(UV), np.concatenate(F)
        obj = os.path.join(a.out, f'{h}.obj')
        with open(obj, 'w', encoding='utf-8') as o:
            o.write(f'# {it.get("n")} ({h}) - Bungie API mobile gear asset\n')
            for v in V: o.write(f'v {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n')
            for t in UV: o.write(f'vt {t[0]:.5f} {1 - t[1]:.5f}\n')
            for x, y, z in F + 1: o.write(f'f {x}/{x} {y}/{y} {z}/{z}\n')
        json.dump({'hash': h, 'name': it.get('n'), 'class': it.get('cl'), 'verts': len(V), 'faces': len(F),
                   'bones': sorted(set(int(x) for x in B))}, open(os.path.join(a.out, f'{h}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'{it.get("n")} ({h}): {len(V)} verts, {len(F)} faces → {os.path.relpath(obj, ROOT)}')


if __name__ == '__main__':
    main()
