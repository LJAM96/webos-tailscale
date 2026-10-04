/* com.ljam.tailscale.service v0.4.7 — Luna broker for the root supervisor.
 *
 * Jailed: sees only its own dir. Control flows through var/request.json ->
 * var/response.json; prefs through var/prefs.json; reads through
 * var/daemon-status.json, var/host-facts.json, var/prefs.json.
 * Everything read back is schema-validated. No shell, no arbitrary paths.
 */
var Service = require('webos-service');
var fs = require('fs');
var path = require('path');

var service = new Service('com.ljam.tailscale.service');

var PKG_VERSION = '0.4.7';
var MAX_BYTES = 65536;
var VAR = path.join(__dirname, 'var');

function safeRead(filePath) {
    try {
        var fd = fs.openSync(filePath, 'r');
        var st = fs.fstatSync(fd);
        if (st.size > MAX_BYTES) { fs.closeSync(fd); return null; }
        var buf = Buffer.alloc(Math.max(st.size, 1));
        var n = fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        return buf.slice(0, n).toString('utf8');
    } catch (e) {
        return null;
    }
}

function readJson(name) {
    var text = safeRead(path.join(VAR, name));
    if (text === null) return null;
    try {
        var obj = JSON.parse(text);
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return null;
        return obj;
    } catch (e) {
        return null;
    }
}

function strOrNull(v) {
    return (typeof v === 'string' && v.length < 256) ? v : null;
}

function boolOr(v, d) {
    return (typeof v === 'boolean') ? v : d;
}

function hostFacts() {
    var raw = readJson('host-facts.json');
    if (!raw) return { present: false };
    return {
        present: true,
        tunExists: raw.tunExists === true,
        tunReadable: raw.tunReadable === true,
        webosVersion: strOrNull(raw.webosVersion),
        webosName: strOrNull(raw.webosName),
        kernel: strOrNull(raw.kernel),
        archUserspace: strOrNull(raw.archUserspace),
        netfilter: raw.netfilter === true,
        iptablesUsable: raw.iptablesUsable === true,
        defaultRoute: strOrNull(raw.defaultRoute),
        collectedAt: (typeof raw.collectedAt === 'number') ? raw.collectedAt : null
    };
}

function daemonState() {
    var raw = readJson('daemon-status.json') || {};
    return {
        daemon: strOrNull(raw.daemon) || 'not_installed',
        backendState: strOrNull(raw.backendState) || 'NoBackendState',
        authUrl: strOrNull(raw.authUrl),
        tailscaleIPv4: strOrNull(raw.tailscaleIPv4),
        tailscaleIPv6: strOrNull(raw.tailscaleIPv6),
        hostname: strOrNull(raw.hostname),
        tailnet: strOrNull(raw.tailnet)
    };
}

function prefs() {
    var raw = readJson('prefs.json') || {};
    return {
        startOnBoot: raw.startOnBoot !== false,
        acceptDNS: boolOr(raw.acceptDNS, false),
        acceptRoutes: boolOr(raw.acceptRoutes, false),
        enableSSH: boolOr(raw.enableSSH, false)
    };
}

function writeRequest(op, params) {
    var id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    var body = JSON.stringify({ id: id, op: op, params: params || {} });
    try {
        fs.writeFileSync(path.join(VAR, 'request.json'), body, { mode: 0x180 });
        return id;
    } catch (e) {
        return null;
    }
}

function awaitResponse(id, timeoutMs, cb) {
    var deadline = Date.now() + timeoutMs;
    (function poll() {
        var raw = readJson('response.json');
        if (raw && raw.id === id && raw.result && typeof raw.result === 'object') {
            cb(raw.result);
            return;
        }
        if (Date.now() > deadline) {
            cb({ ok: false, error: 'supervisor-timeout' });
            return;
        }
        setTimeout(poll, 500);
    })();
}

function validPrefs(p) {
    if (!p || typeof p !== 'object') return null;
    if (typeof p.acceptDNS !== 'boolean') return null;
    if (typeof p.acceptRoutes !== 'boolean') return null;
    if (typeof p.startOnBoot !== 'boolean') return null;
    return {
        startOnBoot: p.startOnBoot,
        acceptDNS: p.acceptDNS,
        acceptRoutes: p.acceptRoutes,
        enableSSH: p.enableSSH === true
    };
}

service.register('status', function (msg) {
    var facts = hostFacts();
    var d = daemonState();
    msg.respond({
        returnValue: true,
        serviceVersion: PKG_VERSION,
        daemon: d.daemon,
        backendState: d.backendState,
        needsLogin: d.backendState === 'NeedsLogin',
        networkMode: facts.present && facts.tunExists ? 'tun' : (facts.present ? 'unsupported' : 'unknown'),
        tunAvailable: facts.present ? facts.tunExists : null,
        tunVisibleInJail: (function () { try { fs.accessSync('/dev/net/tun'); return true; } catch (e) { return false; } })(),
        hostProbed: facts.present,
        hostname: d.hostname,
        tailnet: d.tailnet,
        tailscaleIPv4: d.tailscaleIPv4,
        tailscaleIPv6: d.tailscaleIPv6
    });
});

service.register('getDiagnostics', function (msg) {
    var facts = hostFacts();
    var d = daemonState();
    msg.respond({
        returnValue: true,
        appVersion: PKG_VERSION,
        serviceVersion: PKG_VERSION,
        tailscaleVersion: '1.102.4',
        daemon: d.daemon,
        jailed: true,
        hostProbed: facts.present,
        host: facts.present ? facts : null,
        prefs: prefs(),
        arch: process.arch,
        node: process.version
    });
});

service.register('connect', function (msg) {
    var id = writeRequest('connect');
    if (!id) { msg.respond({ returnValue: false, error: 'request-failed' }); return; }
    awaitResponse(id, 20000, function (r) {
        msg.respond({ returnValue: !!r.ok, error: r.ok ? undefined : (r.error || 'failed') });
    });
});

service.register('disconnect', function (msg) {
    var id = writeRequest('disconnect');
    if (!id) { msg.respond({ returnValue: false, error: 'request-failed' }); return; }
    awaitResponse(id, 15000, function (r) {
        msg.respond({ returnValue: !!r.ok, error: r.ok ? undefined : (r.error || 'failed') });
    });
});

service.register('getAuthUrl', function (msg) {
    var d = daemonState();
    msg.respond({ returnValue: true, authUrl: d.authUrl, needsLogin: d.backendState === 'NeedsLogin' });
});

service.register('logout', function (msg) {
    var id = writeRequest('logout');
    if (!id) { msg.respond({ returnValue: false, error: 'request-failed' }); return; }
    awaitResponse(id, 20000, function (r) {
        msg.respond({ returnValue: !!r.ok, error: r.ok ? undefined : (r.error || 'failed') });
    });
});

service.register('getPreferences', function (msg) {
    msg.respond(Object.assign({ returnValue: true }, prefs()));
});

service.register('getPeers', function (msg) {
    var raw = readJson('peers.json') || {};
    var list = Array.isArray(raw.peers) ? raw.peers : [];
    var out = [];
    for (var i = 0; i < list.length && out.length < 100; i++) {
        var p = list[i];
        if (!p || typeof p !== 'object') continue;
        if (typeof p.name !== 'string' || typeof p.ip !== 'string') continue;
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(p.name)) continue;
        if (!/^[0-9a-fA-F:.]{3,64}$/.test(p.ip)) continue;
        var given = (typeof p.given === 'string' && /^[A-Za-z0-9-]{1,63}$/.test(p.given)) ? p.given : null;
        out.push({
            name: p.name,
            given: given,
            ip: p.ip,
            online: p.online === true,
            active: p.active === true,
            os: (typeof p.os === 'string' && /^[A-Za-z0-9 _.-]{1,32}$/.test(p.os)) ? p.os : null
        });
    }
    msg.respond({ returnValue: true, peers: out });
});

service.register('setPreferences', function (msg) {
    var p = validPrefs(msg.payload);
    if (!p) { msg.respond({ returnValue: false, error: 'invalid-prefs' }); return; }
    try {
        fs.writeFileSync(path.join(VAR, 'prefs.json'), JSON.stringify(p), { mode: 0x180 });
    } catch (e) {
        msg.respond({ returnValue: false, error: 'write-failed' });
        return;
    }
    var id = writeRequest('apply-prefs');
    if (!id) { msg.respond({ returnValue: false, error: 'request-failed' }); return; }
    awaitResponse(id, 20000, function (r) {
        msg.respond({ returnValue: !!r.ok, error: r.ok ? undefined : (r.error || 'apply-failed') });
    });
});
