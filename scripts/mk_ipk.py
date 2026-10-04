#!/usr/bin/env python3
"""Minimal GNU-ar writer for .ipk (avoids macOS ar/ranlib mangling)."""
import os, sys, time

def ar_entry(name, data, mtime=None, uid=0, gid=0, mode=0o100644):
    assert len(name) <= 15, name
    mtime = int(mtime if mtime is not None else time.time())
    header = (
        name.encode() + b'/' + b' ' * (16 - len(name) - 1) +
        str(mtime).encode().ljust(12) +
        str(uid).encode().ljust(6) +
        str(gid).encode().ljust(6) +
        oct(mode)[2:].encode().ljust(8) +
        str(len(data)).encode().ljust(10) +
        b'`\n'
    )
    assert len(header) == 60
    pad = b'\n' if len(data) % 2 else b''
    return header + data + pad

def main():
    stage, out = sys.argv[1], sys.argv[2]
    parts = []
    for name in ('debian-binary', 'control.tar.gz', 'data.tar.gz'):
        with open(os.path.join(stage, name), 'rb') as f:
            parts.append(ar_entry(name, f.read()))
    with open(out, 'wb') as f:
        f.write(b'!<arch>\n' + b''.join(parts))
    print('wrote', out, os.path.getsize(out), 'bytes')

if __name__ == '__main__':
    main()
