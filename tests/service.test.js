/* Exercise the actual Luna handlers with a jailed filesystem double. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../service/service.js'), 'utf8');
function harness(initial = {}) {
  const files = new Map(Object.entries(initial).map(([name, data]) => [name, JSON.stringify(data)]));
  const handlers = {}, descriptors = new Map(); let counter = 0;
  const mockedFS = {
    openSync(p) { const name = path.basename(p); if (!files.has(name)) throw Error('missing'); descriptors.set(++counter, name); return counter; },
    fstatSync(fd) { return { size: Buffer.byteLength(files.get(descriptors.get(fd))) }; },
    readSync(fd, buf) { const value = Buffer.from(files.get(descriptors.get(fd))); value.copy(buf); return value.length; },
    closeSync() {}, existsSync(p) { return files.has(path.basename(p)); }, accessSync() { throw Error('jailed'); },
    writeFileSync(p, data) { files.set(path.basename(p), data); }
  };
  function Service() { this.register = (name, handler) => { handlers[name] = handler; }; }
  const timers = [];
  vm.runInNewContext(source, { require(name) { return name === 'webos-service' ? Service : name === 'fs' ? mockedFS : require(name); }, __dirname: '/fixture/service', Buffer, Date, process, setTimeout(fn) { timers.push(fn); } });
  function request(method, payload = {}) { let response; handlers[method]({ payload, respond(value) { response = JSON.parse(JSON.stringify(value)); } }); return () => response; }
  return { files, timers, request };
}
const preferences = { startOnBoot: true, acceptDNS: false, acceptRoutes: false, enableSSH: false };
test('missing/stale status is distinguishable from disconnected', () => {
  assert.equal(harness().request('status')().statusAvailable, false);
  const h = harness({ 'daemon-status.json': { backendState: 'Stopped', collectedAt: Date.now()/1000 - 120 } });
  assert.equal(h.request('status')().stale, true);
});
test('missing peer data, empty peer data, and stale data remain distinct', () => {
  assert.equal(harness().request('getPeers')().error, 'peers-unavailable');
  assert.deepEqual(harness({ 'peers.json': { peers: [] } }).request('getPeers')().peers, []);
  assert.equal(harness({ 'peers.json': { peers: [], at: 1 } }).request('getPeers')().error, 'peers-stale');
});
test('peer sanitizing and the existing 100-device limit are preserved', () => {
  const peers = [{ name: '<bad>', ip: '100.64.0.1' }, ...Array.from({ length: 110 }, (_, i) => ({ name: 'tv-' + i, ip: '100.64.0.1', online: true }))];
  const response = harness({ 'peers.json': { peers } }).request('getPeers')();
  assert.equal(response.peers.length, 100); assert.equal(response.peers[0].name, 'tv-0');
});
test('missing preferences cannot be shown as successfully loaded defaults', () => {
  assert.equal(harness().request('getPreferences')().returnValue, false);
  assert.deepEqual(harness({ 'prefs.json': preferences }).request('getPreferences')(), { returnValue: true, ...preferences });
});
test('concurrent mutations cannot replace a request or overwrite preferences', () => {
  const h = harness({ 'prefs.json': preferences }); h.request('connect');
  const first = h.files.get('request.json');
  assert.equal(h.request('disconnect')().error, 'busy');
  assert.equal(h.request('setPreferences', { ...preferences, acceptDNS: true })().error, 'busy');
  assert.equal(h.files.get('request.json'), first); assert.deepEqual(JSON.parse(h.files.get('prefs.json')), preferences);
});
test('save reports persisted and applied results from the supervisor', () => {
  const h = harness(); const result = h.request('setPreferences', preferences);
  const request = JSON.parse(h.files.get('request.json'));
  h.files.delete('request.json'); h.files.set('response.json', JSON.stringify({ id: request.id, result: { ok: true, saved: true, applied: false } }));
  h.timers.shift()(); assert.deepEqual(result(), { returnValue: true, saved: true, applied: false });
});
test('invalid settings do not create a privileged request', () => {
  const h = harness(); assert.equal(h.request('setPreferences', { acceptDNS: 'yes' })().error, 'invalid-prefs'); assert.equal(h.files.has('request.json'), false);
});
