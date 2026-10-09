const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function harness(options = {}) {
  const elements = new Map(), pending = [];
  let clones = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, { id, textContent: '', disabled: false, hidden: false, addEventListener() {}, querySelector() { return element(id + '-instructions'); }, setAttribute() {}, removeAttribute() {}, scrollTop: 0, appendChild() {}, classList: { toggle() {}, add() {} } });
    return elements.get(id);
  };
  element('device-row-template').content = { firstElementChild: { cloneNode() { clones++; return { querySelector: selector => ({ textContent: '', classList: { add() {} } }) }; } } };
  const context = { URL, Date, Promise, JSON, isFinite, isNaN, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [], activeElement: {} }, window: { scrollTo() {} } };
  context.window.PalmServiceBridge = function () { this.call = (url) => pending.push({ method: url.split('/').pop(), bridge: this }); };
  const source = fs.readFileSync(options.sourcePath || path.join(__dirname, '../app/app.js'), 'utf8');
  // Test-only seam in the in-memory source; production code exports nothing.
  const seam = `renderStatus = function() {}; ${options.renderPeers ? '' : 'renderPeers = function() {};'} ensureFocus = function() {}; loadPrefs = function() {}; detailList = function(id, rows) { window.lastRows = rows; };
    window.testUI = { state: state, call: call, refresh: refresh, loadAuth: loadAuth, loadPeers: loadPeers, navigate: navigate, freshText: freshText, loadDiagnostics: loadDiagnostics, statusKind: statusKind, validAuthURL: validAuthURL, renderPeers: renderPeers, runOperation: runOperation, back: back }`;
  vm.runInNewContext(source.replace('  refresh(); ensureFocus();\n})();', seam + '\n})();'), context);
  return { ui: context.window.testUI, element, pending, get rows() { return context.window.lastRows; }, get clones() { return clones; }, respond(index, response) { pending[index].bridge.onservicecallback(JSON.stringify(response)); } };
}

test('malformed service envelopes become recoverable failures', async () => {
  for (const response of [null, [], { returnValue: 'true' }, { returnValue: true }]) {
    const h = harness(); const request = h.ui.call('status', {}); h.respond(0, response);
    const result = await request;
    assert.equal(result.returnValue, response && response.returnValue === true ? true : false);
    if (!result.returnValue) assert.equal(result.error, 'invalid-response');
  }
});

test('status without a backend does not become a disconnected state', async () => {
  const h = harness(); const request = h.ui.refresh(); h.respond(0, { returnValue: true }); await request;
  assert.equal(h.ui.state.status, null); assert.equal(h.ui.state.statusError, 'status-unavailable');
});

test('late sign-in response cannot replace a newer visit or enable its loading button', async () => {
  const h = harness(); h.ui.state.route = 'auth'; h.ui.state.history = ['status', 'auth'];
  const oldRequest = h.ui.loadAuth(); h.ui.navigate('status', true); h.ui.navigate('auth', true);
  assert.equal(h.pending.length, 2);
  h.respond(0, { returnValue: true, needsLogin: true, authUrl: 'https://example.invalid/old' }); await oldRequest;
  assert.equal(h.ui.state.authLoading, true); assert.equal(h.element('refresh-auth').disabled, true); assert.equal(h.ui.state.authURL, null);
  h.respond(1, { returnValue: true, needsLogin: false }); await new Promise(setImmediate);
  assert.equal(h.ui.state.authLoading, false); assert.equal(h.element('refresh-auth').disabled, false);
});

test('device responses from before a connection mutation are discarded', async () => {
  const h = harness(); h.ui.state.status = { backendState: 'Running' };
  const request = h.ui.loadPeers(false); h.ui.state.mutationEpoch++;
  h.respond(0, { returnValue: true, peers: [{ name: 'old', ip: '100.64.0.1', online: true }] }); await request;
  assert.equal(h.ui.state.peers, null); assert.equal(h.ui.state.peersLoading, false);
});

test('malformed peer rows fail cleanly instead of crashing rendering', async () => {
  const h = harness(); h.ui.state.status = { backendState: 'Running' };
  const request = h.ui.loadPeers(false); h.respond(0, { returnValue: true, peers: [null] }); await request;
  assert.equal(h.ui.state.peers, null); assert.equal(h.ui.state.peersError, 'peers-unavailable');
});

test('invalid timestamps and invalid sign-in addresses degrade safely', () => {
  const h = harness(); h.ui.state.status = { collectedAt: 1e300 };
  assert.match(h.ui.freshText(), /did not report an update time/);
  for (const url of [null, {}, 'https://', 'http://example.invalid', 'https://user:password@example.invalid']) assert.equal(h.ui.validAuthURL(url), false);
  assert.equal(h.ui.validAuthURL('https://example.invalid/sign-in'), true);
});

test('oversized peer response respects the existing service contract', async () => {
  const h = harness(); h.ui.state.status = { backendState: 'Running' };
  const request = h.ui.loadPeers(false); h.respond(0, { returnValue: true, peers: Array.from({ length: 1001 }, () => ({ name: 'device', ip: '100.64.0.1', online: true })) }); await request;
  assert.equal(h.ui.state.peers, null); assert.equal(h.ui.state.peersError, 'peers-unavailable');
});

test('unrecognized nonempty backend states never invite Connect', async () => {
  const h = harness(); const request = h.ui.refresh(); h.respond(0, { returnValue: true, backendState: 'UnexpectedState', needsLogin: false }); await request;
  assert.equal(h.ui.state.statusError, 'status-unavailable'); assert.equal(h.ui.statusKind(), 'unavailable');
  h.ui.state.statusError = null; assert.equal(h.ui.statusKind(), 'unavailable');
});

test('missing TUN evidence is not reported as a confirmed absent device', async () => {
  const h = harness(); const request = h.ui.loadDiagnostics(); h.respond(0, { returnValue: true, host: {}, hostProbed: 'true' }); await request;
  assert.equal(h.rows.find(row => row[0] === 'TUN device')[1], 'Not confirmed');
  assert.equal(h.rows.find(row => row[0] === 'Host discovery')[1], 'Not reported');
});


test('administrator approval is a known pending state and transitions to connected', async () => {
  const h = harness();
  let request = h.ui.refresh();
  h.respond(0, { returnValue: true, backendState: 'NeedsMachineAuth', needsLogin: false }); await request;
  assert.equal(h.ui.state.statusError, null); assert.equal(h.ui.statusKind(), 'approval');
  h.ui.state.pending = 'connect'; assert.equal(h.ui.statusKind(), 'approval'); h.ui.state.pending = null;
  request = h.ui.refresh(); h.respond(1, { returnValue: true, backendState: 'Running', needsLogin: false });
  await new Promise(setImmediate); h.respond(2, { returnValue: true, peers: [] }); await request;
  assert.equal(h.ui.statusKind(), 'connected');
});

test('polling and connect completion respect dismissal of automatically opened sign-in', async () => {
  const h = harness(); h.ui.state.status = { backendState: 'Stopped', needsLogin: false };
  const operation = h.ui.runOperation('connect');
  let poll = h.ui.refresh(); h.respond(1, { returnValue: true, backendState: 'NeedsLogin', needsLogin: true }); await poll;
  assert.equal(h.ui.state.route, 'auth');
  h.ui.back(); assert.equal(h.ui.state.route, 'status');
  poll = h.ui.refresh(); h.respond(3, { returnValue: true, backendState: 'NeedsLogin', needsLogin: true }); await poll;
  assert.equal(h.ui.state.route, 'status');
  h.respond(0, { returnValue: true }); await new Promise(setImmediate);
  h.respond(4, { returnValue: true, backendState: 'NeedsLogin', needsLogin: true }); await operation;
  assert.equal(h.ui.state.route, 'status');
  h.respond(2, { returnValue: true, needsLogin: true, authUrl: 'https://example.invalid/late' }); await new Promise(setImmediate);
  assert.equal(h.ui.state.authURL, null);
  h.ui.navigate('auth'); assert.equal(h.ui.state.route, 'auth');
  h.respond(5, { returnValue: true, needsLogin: true, authUrl: 'https://example.invalid/reopen' }); await new Promise(setImmediate);
});

test('a new connection attempt can open sign-in again', async () => {
  const h = harness(); h.ui.state.status = { backendState: 'Stopped', needsLogin: false }; h.ui.state.authAutoOpened = true;
  const operation = h.ui.runOperation('connect'); assert.equal(h.ui.state.authAutoOpened, false);
  h.respond(0, { returnValue: true }); await new Promise(setImmediate);
  h.respond(1, { returnValue: true, backendState: 'NeedsLogin', needsLogin: true }); await operation;
  assert.equal(h.ui.state.route, 'auth');
  h.respond(2, { returnValue: true, needsLogin: false }); await new Promise(setImmediate);
});

test('peer polling preserves identical visible rows and skips hidden row construction', async () => {
  const h = harness({ renderPeers: true }); h.ui.state.status = { backendState: 'Running' };
  const peers = Array.from({ length: 100 }, (_, i) => ({ name: 'device-' + i, ip: '100.64.0.' + i, online: true }));
  let request = h.ui.loadPeers(false); h.respond(0, { returnValue: true, peers }); await request;
  assert.equal(h.clones, 0); assert.match(h.element('peer-summary').textContent, /100 online/);
  h.ui.state.route = 'devices'; h.ui.renderPeers(); assert.equal(h.clones, 100);
  request = h.ui.loadPeers(true); assert.equal(h.clones, 100);
  h.respond(1, { returnValue: true, peers }); await request; assert.equal(h.clones, 100);
  request = h.ui.loadPeers(true); h.respond(2, { returnValue: true, peers: peers.map((peer, i) => i ? peer : { ...peer, online: false }) }); await request;
  assert.equal(h.clones, 200); assert.match(h.element('devices-count').textContent, /99 online/);
  request = h.ui.loadPeers(true); h.respond(3, { returnValue: false, error: 'peers-unavailable' }); await request;
  assert.equal(h.element('devices-scroll').hidden, true);
  request = h.ui.loadPeers(true); h.respond(4, { returnValue: true, peers }); await request;
  assert.equal(h.clones, 300); assert.equal(h.element('devices-scroll').hidden, false);
  request = h.ui.loadPeers(true); h.respond(5, { returnValue: true, peers: [] }); await request;
  assert.equal(h.element('devices-scroll').hidden, true); assert.match(h.element('devices-feedback').textContent, /no other devices/);
});
