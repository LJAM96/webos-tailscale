/* One-shot Luna test client (lives in /tmp only, never packaged). */
var Service = require('webos-service');
var caller = new Service('com.ljam96.tailscale.test');

function call(uri, params) {
    return new Promise(function (resolve, reject) {
        var done = false;
        try {
            caller.call(uri, params || {}, function (msg) {
                if (!done) { done = true; resolve(msg.payload); }
            });
        } catch (e) { reject(e); return; }
        setTimeout(function () { if (!done) { done = true; reject(new Error('timeout ' + uri)); } }, 8000);
    });
}

(async function () {
    try {
        var s = await call('luna://com.ljam96.tailscale.service/status', {});
        console.log('STATUS ' + JSON.stringify(s));
        var d = await call('luna://com.ljam96.tailscale.service/getDiagnostics', {});
        console.log('DIAG ' + JSON.stringify(d));
        process.exit(0);
    } catch (e) {
        console.log('CALLFAIL ' + (e && e.message));
        process.exit(1);
    }
})();
