"""Run supervisor request handlers with temporary directories and fake binaries."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest

SOURCE = (Path(__file__).resolve().parents[1] / 'init/supervisor.sh').read_text().split('\ncase "${1:-run}"')[0]
PREFS = dict(startOnBoot=True, acceptDNS=False, acceptRoutes=False, enableSSH=False)

class SupervisorTests(unittest.TestCase):
    def run_request(self, operation, backend='Stopped', fail=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); svc = root/'service'; var = svc/'var'; state = root/'state'; run = root/'run'; binary = svc/'bin'
            for p in (var, state, run, binary): p.mkdir(parents=True, exist_ok=True)
            (var/'prefs.json').write_text(json.dumps(PREFS))
            (var/'request.json').write_text(json.dumps(dict(id='test-request', op=operation)))
            cli = binary/'tailscale'
            cli.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
root=Path(os.environ['FIXTURE_ROOT'])
args=sys.argv[1:]
with (root/'calls').open('a') as f: f.write(' '.join(args)+'\\n')
if 'status' in args: print(json.dumps({'BackendState':os.environ['FIXTURE_BACKEND']}))
elif os.environ['FIXTURE_FAIL']=='1': sys.exit(1)
''')
            cli.chmod(0o755)
            sock = socket.socket(socket.AF_UNIX); sock.bind(str(run/'tailscaled.sock'))
            env = dict(os.environ, SVC_DIR=str(svc), STATE_DIR=str(state), RUN_DIR=str(run), FIXTURE_ROOT=str(root), FIXTURE_BACKEND=backend, FIXTURE_FAIL='1' if fail else '0')
            result = subprocess.run(['sh', '-c', SOURCE+'\nhandle_request\n'], env=env, capture_output=True, text=True)
            sock.close()
            self.assertEqual(result.returncode, 0, result.stderr)
            response = json.loads((var/'response.json').read_text())['result']
            calls = (root/'calls').read_text() if (root/'calls').exists() else ''
            persisted = json.loads((state/'config.json').read_text()) if (state/'config.json').exists() else None
            return response, calls, persisted

    def test_save_disconnected_does_not_connect(self):
        response, calls, persisted = self.run_request('apply-prefs')
        self.assertEqual(response, dict(ok=True, saved=True, applied=False))
        self.assertNotIn(' up ', calls); self.assertEqual(persisted['acceptDNS'], False)

    def test_save_connected_applies_preferences(self):
        response, calls, _ = self.run_request('apply-prefs', 'Running')
        self.assertTrue(response['applied']); self.assertIn('up --timeout=10s', calls)

    def test_apply_failure_distinguishes_saved_from_applied(self):
        response, _, persisted = self.run_request('apply-prefs', 'Running', True)
        self.assertFalse(response['ok']); self.assertTrue(response['saved']); self.assertIsNotNone(persisted)

    def test_phone_auth_is_not_reported_as_daemon_start_failure(self):
        response, _, _ = self.run_request('connect', 'NeedsLogin', True)
        self.assertTrue(response['ok']); self.assertTrue(response['needsLogin'])

    def test_disconnect_failure_is_reported(self):
        response, _, _ = self.run_request('disconnect', 'Running', True)
        self.assertFalse(response['ok'])

    def test_signout_failure_is_reported(self):
        response, _, _ = self.run_request('logout', 'Running', True)
        self.assertFalse(response['ok'])

if __name__ == '__main__': unittest.main()
