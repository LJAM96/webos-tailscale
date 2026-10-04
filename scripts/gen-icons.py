#!/usr/bin/env python3
"""Generate solid placeholder icons (no PIL needed)."""
import struct, zlib, os

def png(path, w, h, rgb):
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    row = b'\x00' + bytes(rgb) * w
    raw = row * h
    with open(path, 'wb') as f:
        f.write(sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

base = os.path.join(os.path.dirname(__file__), '..', 'app', 'assets')
os.makedirs(base, exist_ok=True)
png(os.path.join(base, 'icon80.png'), 80, 80, (37, 99, 235))
png(os.path.join(base, 'icon130.png'), 130, 130, (37, 99, 235))
png(os.path.join(base, 'splash.png'), 192, 108, (15, 23, 42))
print('icons written to', base)
