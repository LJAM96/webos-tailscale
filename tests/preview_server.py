"""Local UI workflow fixture. Never included in the TV package."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import argparse

ROOT = Path(__file__).resolve().parents[1]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'app'), **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/', '/index.html'):
            content = (ROOT / 'app/index.html').read_text()
            content = content.replace('<script defer src="vendor/webOSTV.js">', '<script src="/fixture.js"></script><script defer src="vendor/webOSTV.js">')
            content = content.replace('</body>', '<aside id="fixture-controls" style="position:fixed;bottom:0;left:0;right:0;z-index:10;max-height:140px;overflow:auto;padding:8px;background:#16191d;border-top:1px solid #505a67;font:14px sans-serif"><p>TEST FIXTURE · Simulated TV service · No device operations</p><button id="fixture-signin">Simulate completed sign-in</button><button id="fixture-empty">Simulate empty devices</button><button id="fixture-peers">Restore devices</button><button id="fixture-fail">Fail next save</button><button id="fixture-status">Fail status reads</button><button id="fixture-recover">Restore status reads</button><button id="fixture-hide">Hide fixture controls</button><pre id="fixture-log" aria-label="Fixture requests"></pre></aside></body>')
            data = content.encode()
        elif path == '/fixture.js':
            data = (ROOT / 'tests/fixture.js').read_bytes()
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', 'application/javascript' if path == '/fixture.js' else 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
