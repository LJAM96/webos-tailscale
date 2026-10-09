/* Explicit, offline test double for the Luna bridge. Not packaged with the app. */
(function () {
  var scenario = new URLSearchParams(location.search).get('fixture') || 'connected';
  var textScale = Number(new URLSearchParams(location.search).get('text-scale')) || 1;
  document.documentElement.style.fontSize = (16 * textScale) + 'px';
  var longContent = new URLSearchParams(location.search).get('long') === '1';
  var backend = ['offline', 'slow'].indexOf(scenario) !== -1 ? 'Stopped' : ['login', 'missing-code', 'slow-auth'].indexOf(scenario) !== -1 ? 'NeedsLogin' : 'Running';
  if (scenario === 'approval') backend = 'NeedsMachineAuth';
  var prefs = { startOnBoot: true, acceptDNS: false, acceptRoutes: false, enableSSH: false, autoUpdateCheck: false };
  var failSave = scenario === 'save-failure', failStatus = scenario === 'failure';
  var empty = scenario === 'empty', requests = [];
  var peers = Array.from({ length: 100 }, function (_, i) { return { name: 'fixture-device-' + i, given: i === 0 ? 'Media-server' : 'Device-' + i, ip: '100.64.0.' + (i + 1), os: i % 2 ? 'Linux' : 'Windows', online: i < 12, active: i === 0 }; });
  function log(value) { requests.push(value); var node = document.getElementById('fixture-log'); if (node) node.textContent = requests.join('\n'); }
  window.PalmSystem = { platformBack: function () { log('platformBack'); }, identifier: 'com.ljam96.tailscale', deviceInfo: '{}' };
  window.PalmServiceBridge = function () {};
  window.PalmServiceBridge.prototype.call = function (url, encoded) {
    var self = this, method = url.split('/').pop(), params = JSON.parse(encoded), response;
    log(method + ' ' + encoded);
    var now = Math.floor(Date.now() / 1000);
    if (method === 'status') response = failStatus ? { returnValue: false, error: 'service-unavailable' } : { returnValue: true, statusAvailable: true, collectedAt: now - (scenario === 'stale' ? 120 : 0), stale: scenario === 'stale', daemon: 'running', backendState: backend, needsLogin: backend === 'NeedsLogin', networkMode: scenario === 'unsupported' ? 'unsupported' : 'tun', hostname: longContent ? 'Living-room-television-with-a-long-descriptive-device-name' : 'Living-room-TV', tailnet: longContent ? 'fixture-' + 'very-long-tailnet-name-'.repeat(6) + '.example.ts.net' : 'fixture.example.ts.net', tailscaleIPv4: backend === 'Running' ? '100.64.0.200' : null, tailscaleIPv6: backend === 'Running' ? 'fd7a:115c:a1e0::c8' : null };
    else if (method === 'getPreferences') response = scenario === 'prefs-failure' ? { returnValue: false, error: 'preferences-unavailable' } : Object.assign({ returnValue: true }, prefs);
    else if (method === 'setPreferences') {
      if (failSave) { response = { returnValue: false, saved: true, applied: false, error: 'apply-failed' }; failSave = false; }
      else { prefs = params; response = { returnValue: true, saved: true, applied: backend === 'Running' }; }
    }
    else if (method === 'getPeers') response = scenario === 'peer-failure' ? { returnValue: false, error: 'peers-unavailable' } : { returnValue: true, peers: empty ? [] : peers, collectedAt: now };
    else if (method === 'getAuthUrl') response = { returnValue: true, needsLogin: backend === 'NeedsLogin', authUrl: backend === 'NeedsLogin' && scenario !== 'missing-code' ? 'https://example.invalid/fixture-sign-in' + (longContent ? '/authentication-path-with-a-long-token-'.repeat(4) : '') : null };
    else if (method === 'connect') { backend = 'NeedsLogin'; response = { returnValue: true }; }
    else if (method === 'disconnect') { backend = 'Stopped'; response = { returnValue: true }; }
    else if (method === 'logout') { backend = 'NeedsLogin'; response = { returnValue: true }; }
    else if (method === 'updateDaemon') response = { returnValue: true, updated: false, previous: '1.102.5', current: '1.102.5' };
    else if (method === 'getDiagnostics') response = scenario === 'diagnostics-failure' ? { returnValue: false, error: 'service-unavailable' } : { returnValue: true, appVersion: '0.4.8', serviceVersion: '0.4.8', tailscaleVersion: '1.104.1', daemon: 'running', hostProbed: true, host: { tunExists: true, tunReadable: true, archUserspace: 'arm', webosVersion: 'Fixture only', netfilter: false }, prefs: prefs, jailed: true, arch: 'arm', node: 'fixture' };
    else response = { returnValue: false, error: 'unknown-method' };
    if (scenario === 'malformed-status' && method === 'status') response = { returnValue: true, backendState: 'UnexpectedState', needsLogin: false };
    if (scenario === 'malformed-peers' && method === 'getPeers') response = { returnValue: true, peers: [null] };
    if (scenario === 'peer-drop' && method === 'getPeers' && requests.filter(function (value) { return value.indexOf('getPeers ') === 0; }).length >= 3) response = { returnValue: false, error: 'peers-unavailable' };
    if (scenario === 'mixed-text' && method === 'status') { response.hostname = '客厅电视 📺 · تلفاز غرفة المعيشة · ' + 'VeryLongName'.repeat(12); response.tailnet = 'fixture.example.ts.net'; }
    setTimeout(function () { self.onservicecallback(JSON.stringify(response)); if (method === 'connect') log('fixture connect completed'); }, method === 'getAuthUrl' && scenario === 'slow-auth' ? 2000 : method === 'connect' ? scenario === 'slow' ? 4000 : 500 : 80);
  };
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('fixture-signin').onclick = function () { backend = 'Running'; log('fixture signed in'); };
    document.getElementById('fixture-empty').onclick = function () { empty = true; };
    document.getElementById('fixture-peers').onclick = function () { empty = false; };
    document.getElementById('fixture-fail').onclick = function () { failSave = true; };
    document.getElementById('fixture-status').onclick = function () { failStatus = true; };
    document.getElementById('fixture-recover').onclick = function () { failStatus = false; };
    document.getElementById('fixture-hide').onclick = function () { document.getElementById('fixture-controls').hidden = true; };
    log('fixture ' + scenario);
  });
})();
