#!/usr/bin/env python3
"""Shrink textures inside a VRM/GLB (max side 1024; opaque images become JPEG). Keeps all glTF/VRM JSON intact."""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
MAX = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
b = open(src, 'rb').read()
jlen = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jlen])
boff = 20 + jlen + 8
blen = struct.unpack('<I', b[20 + jlen:24 + jlen])[0]
binc = b[boff:boff + blen]

views = j['bufferViews']
img_views = {im['bufferView']: i for i, im in enumerate(j.get('images', [])) if 'bufferView' in im}
new_bin = bytearray()
for vi, v in enumerate(views):
    data = binc[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']]
    if vi in img_views:
        im = j['images'][img_views[vi]]
        img = Image.open(io.BytesIO(data))
        if max(img.size) > MAX:
            s = MAX / max(img.size)
            img = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
        out = io.BytesIO()
        has_alpha = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 255
        if has_alpha:
            img.save(out, 'PNG', optimize=True)
            im['mimeType'] = 'image/png'
        else:
            img.convert('RGB').save(out, 'JPEG', quality=88)
            im['mimeType'] = 'image/jpeg'
        data = out.getvalue()
    while len(new_bin) % 4:
        new_bin += b'\0'
    v['byteOffset'] = len(new_bin)
    v['byteLength'] = len(data)
    new_bin += data
while len(new_bin) % 4:
    new_bin += b'\0'
j['buffers'][0]['byteLength'] = len(new_bin)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4:
    js += b' '
total = 12 + 8 + len(js) + 8 + len(new_bin)
out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin)
open(dst, 'wb').write(out)
print(f'{src}: {len(b)//1024} KB -> {dst}: {len(out)//1024} KB')
