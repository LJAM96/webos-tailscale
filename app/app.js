/* TV controller. Platform/service I/O is isolated from reusable view rendering. */
(function () {
  'use strict';
  var SERVICE = 'luna://com.ljam96.tailscale.service/';
  var prefKeys = ['startOnBoot', 'acceptDNS', 'acceptRoutes', 'enableSSH', 'autoUpdateCheck'];
  var routeTitles = { status: 'Status', settings: 'Settings', advanced: 'Advanced network settings', devices: 'Devices', details: 'Connection details', auth: 'Sign in', troubleshooting: 'Troubleshooting', raw: 'Technical details' };
  var state = {
    route: 'status', history: ['status'], focus: {}, status: null, statusError: null,
    pending: null, refreshing: false, peers: null, peersError: null, peersLoading: false,
    diagnostics: null, diagnosticsLoading: false, draft: null, saved: null,
    prefsLoading: false, prefsError: null, saveMessage: '', retry: null, authLoading: false,
    updateLoading: false, updateMessage: '',
    authURL: null, authRequest: 0, authOrigin: null, authAutoOpened: false, mutationEpoch: 0, suppressHoverUntil: 0
  };
  var peersRenderKey = null;
  var activeBridges = [];
  var dialog = document.getElementById('confirmation');
  var dialogReturn = null;
  function el(id) { return document.getElementById(id); }
  function text(id, value) {
    var node = el(id), content = value == null ? '' : String(value);
    if (node.textContent !== content) node.textContent = content;
  }
  function copyPrefs(value) {
    var out = {};
    prefKeys.forEach(function (key) { out[key] = value[key] === true; });
    return out;
  }
  function prefsEqual(a, b) { return !!a && !!b && prefKeys.every(function (key) { return a[key] === b[key]; }); }
  function dirty() { return !!state.draft && !prefsEqual(state.draft, state.saved); }
  function editing(route) { return route === 'settings' || route === 'advanced'; }
  function available(node) { return !!node && !node.disabled && node.getClientRects().length > 0 && !node.closest('[hidden]'); }
  function focus(node) {
    if (!available(node)) return;
    node.focus();
    try { node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (ignore) {}
  }
  function controls() {
    var root = dialog.open ? dialog : document.querySelector('.app-shell');
    return Array.prototype.filter.call(root.querySelectorAll('button, input, [tabindex="0"]'), available);
  }
  function ensureFocus(restoreRoute) {
    if (!restoreRoute && available(document.activeElement) && controls().indexOf(document.activeElement) !== -1) return;
    var target = el(state.focus[state.route]);
    if (!available(target)) target = state.route === 'status' ? el('connection-action') : state.route === 'settings' ? el('pref-startOnBoot') : state.route === 'advanced' ? el('pref-acceptDNS') : el('back-button');
    focus(available(target) ? target : controls()[0]);
  }
  function call(method, params, timeout) {
    return new Promise(function (resolve) {
      var bridge, timer, finished = false;
      function finish(response) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        var i = activeBridges.indexOf(bridge);
        if (i !== -1) activeBridges.splice(i, 1);
        resolve(response);
      }
      try {
        var Bridge = window.PalmServiceBridge || window.webOSServiceBridge;
        if (!Bridge) { finish({ returnValue: false, error: 'no-bridge' }); return; }
        bridge = new Bridge();
        activeBridges.push(bridge);
        bridge.onservicecallback = function (message) {
          try {
            var result = JSON.parse(message);
            finish(result && typeof result === 'object' && !Array.isArray(result) && typeof result.returnValue === 'boolean' ? result : { returnValue: false, error: 'invalid-response' });
          } catch (ignore) { finish({ returnValue: false, error: 'invalid-response' }); }
        };
        timer = setTimeout(function () { finish({ returnValue: false, error: 'timeout' }); try { if (bridge.cancel) bridge.cancel(); } catch (ignore) {} }, timeout || 25000);
        bridge.call(SERVICE + method, JSON.stringify(params || {}));
      } catch (ignore) { finish({ returnValue: false, error: 'service-unavailable' }); }
    });
  }
  function errorMessage(result, action) {
    var code = result.error || result.errorCode;
    if (code === 'no-bridge') return 'The TV connection controls are unavailable here. Open this app on the LG TV.';
    if (code === 'busy') return 'Another request is still running. Wait for it to finish, then try again.';
    if (code === 'timeout' || code === 'supervisor-timeout') return 'The background service took too long to respond. Check Troubleshooting, then try again.';
    if (code === 'peers-unavailable' || code === 'peers-stale') return 'The device list is unavailable or out of date. Choose Refresh devices. If it still fails, check Troubleshooting.';
    if (code === 'preferences-unavailable') return 'Saved settings could not be loaded. Choose Retry loading settings before making changes.';
    if (code === 'apply-failed' || code === 'persistence-failed') return 'We could not confirm that your settings were saved and applied. Your edits are kept. Check Troubleshooting, then retry.';
    if (action === 'Loading diagnostics') return 'Service checks could not be loaded. Choose Refresh checks to try again.';
    var messages = {
      'Loading devices': 'The device list could not be loaded.',
      'Loading settings': 'Saved settings could not be loaded.',
      'Loading sign-in': 'Sign-in information could not be loaded.',
      'Saving settings': 'Settings could not be saved and applied.',
      'Signing out': 'This TV could not be signed out.',
      'Disconnecting': 'This TV could not be disconnected.',
      'Connecting': 'This TV could not be connected.'
    };
    return (messages[action] || 'The request could not be completed.') + ' Check Troubleshooting, then try again.';
  }
  function showError(message, retry) {
    text('operation-message', message);
    state.retry = retry || null;
    el('retry-operation').hidden = !retry;
    el('operation-feedback').hidden = false;
    try { el('operation-feedback').scrollIntoView({ block: 'nearest' }); } catch (ignore) {}
    try { focus(retry ? el('retry-operation') : el('error-troubleshooting')); } catch (ignore) {}
  }
  function clearError() { el('operation-feedback').hidden = true; state.retry = null; }

  // Reusable semantic label/value component. Service data is always text, never HTML.
  function detailList(id, rows) {
    var list = el(id);
    list.textContent = '';
    var groups = id === 'connection-details' ? [['Identity and addresses', rows.slice(0, 4)], ['Connection service', rows.slice(4)]] : id === 'diagnostic-summary' ? (rows.length > 2 ? [['Service checks', rows.slice(0, 4)], ['Versions', rows.slice(4)]] : [['Service checks', rows]]) : null;
    if (groups) {
      groups.forEach(function (group) {
        var section = document.createElement('section'), heading = document.createElement('h3'), values = document.createElement('dl');
        heading.textContent = group[0]; values.className = 'detail-list';
        section.appendChild(heading); section.appendChild(values); list.appendChild(section);
        appendRows(values, group[1]);
      });
    } else appendRows(list, rows);
  }
  function appendRows(list, rows) {
    rows.forEach(function (row) {
      var group = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = row[0]; value.textContent = row[1] == null || row[1] === '' ? 'Not available' : String(row[1]);
      if (row[2] && row[1] != null && row[1] !== '') value.className = row[2];
      group.appendChild(label); group.appendChild(value); list.appendChild(group);
    });
  }
  function statusKind() {
    if (state.statusError) return 'unavailable';
    if (!state.status) return 'checking';
    if (state.status.needsLogin) return 'login';
    if (state.pending === 'disconnect') return 'disconnecting';
    if (state.pending === 'logout') return 'signingout';
    if (state.status.backendState === 'NeedsMachineAuth') return 'approval';
    if (state.pending === 'connect') return 'connecting';
    if (state.status.backendState === 'Running') return 'connected';
    if (state.status.networkMode === 'unsupported') return 'unsupported';
    if (state.status.backendState === 'Starting') return 'connecting';
    if (state.status.backendState === 'NoBackendState' || state.status.backendState === 'NoState') return 'unavailable';
    return state.status.backendState === 'Stopped' ? 'disconnected' : 'unavailable';
  }
  function freshText() {
    if (!state.status) return 'No connection information available.';
    if (typeof state.status.collectedAt !== 'number' || !isFinite(state.status.collectedAt) || state.status.collectedAt <= 0 || isNaN(new Date(state.status.collectedAt * 1000).getTime())) return 'The background service did not report an update time.';
    var stamp = new Date(state.status.collectedAt * 1000).toLocaleTimeString();
    return (state.statusError ? 'Last known information · ' : 'Status checked · ') + stamp;
  }
  function renderStatus() {
    var kind = statusKind(), data = state.status || {};
    var titles = { checking: 'Checking connection…', unavailable: 'Status unavailable', connecting: 'Connecting…', disconnecting: 'Disconnecting…', signingout: 'Signing out…', login: 'Sign-in required', approval: 'Approval required', connected: 'Connected', unsupported: 'Unsupported configuration', disconnected: 'Not connected' };
    var descriptions = {
      checking: 'Checking the TV’s background service.', unavailable: 'The TV’s current connection could not be confirmed. Choose Retry status or Troubleshooting.',
      connecting: 'Waiting for the background service to confirm the connection.', disconnecting: 'Disconnecting keeps this TV’s sign-in for next time.', signingout: 'Removing this TV’s Tailscale sign-in.',
      login: 'Sign in on your phone to connect this TV.', approval: 'Ask a tailnet administrator to approve this TV in the Tailscale admin console. This TV will connect when approval is confirmed.', connected: 'This TV is connected to your Tailscale network.', unsupported: 'The TV reports no TUN device. Open Troubleshooting to check its network configuration.', disconnected: 'Connect this TV to your tailnet.'
    };
    text('connection-heading', titles[kind]); text('connection-description', descriptions[kind]);
    el('connection-state').setAttribute('data-state', kind);
    text('tv-name', data.hostname || 'Not available'); text('tailnet-name', data.tailnet || 'Not available'); text('tv-address', data.tailscaleIPv4 || 'Not assigned');
    el('tv-address').classList.toggle('address', !!data.tailscaleIPv4);
    text('freshness', freshText()); text('details-freshness', freshText());
    text('account-summary', data.tailnet ? 'Tailnet: ' + data.tailnet : 'Tailnet information is unavailable.');
    var action = el('connection-action');
    text('connection-action', kind === 'connected' ? 'Disconnect' : kind === 'login' ? 'Sign in' : kind === 'approval' ? 'Check approval' : kind === 'unavailable' ? 'Retry status' : kind === 'unsupported' ? 'Troubleshooting' : kind === 'checking' ? 'Checking…' : kind === 'connecting' ? 'Connecting…' : kind === 'disconnecting' ? 'Disconnecting…' : kind === 'signingout' ? 'Signing out…' : 'Connect');
    action.disabled = (!!state.pending && !((kind === 'login' || kind === 'approval') && state.pending === 'connect')) || kind === 'checking' || (kind === 'connecting' && !state.status.needsLogin);
    el('status-troubleshooting').hidden = kind !== 'unavailable' && kind !== 'unsupported';
    el('sign-out').disabled = !!state.pending || !state.status || !!state.statusError;
    detailList('connection-details', [['TV name', data.hostname], ['Tailnet', data.tailnet], ['IPv4 address', data.tailscaleIPv4, 'address'], ['IPv6 address', data.tailscaleIPv6, 'address'], ['Network mode', data.networkMode === 'tun' ? 'Kernel TUN' : data.networkMode], ['Daemon', data.daemon], ['Backend state', data.backendState]]);
    paintPrefs(); renderUpdate();
  }
  function renderUpdate() {
    var u = (state.status && state.status.update) || { enabled: false, available: null };
    if (!u.enabled) text('update-state', 'Turn on update checks to see new daemon releases.');
    else if (u.available === true && u.latest) text('update-state', 'Tailscale ' + u.latest + ' is available (running ' + (u.running || 'unknown version') + ').');
    else if (u.available === false) text('update-state', 'Daemon is up to date (' + (u.running || 'unknown version') + ').');
    else text('update-state', 'No update information yet (running ' + (u.running || 'unknown version') + '). The TV learns about releases from the tailnet.');
    text('update-feedback', state.updateLoading ? 'Installing update… the connection restarts for a few minutes.' : state.updateMessage);
    var button = el('install-update');
    button.disabled = !!state.pending || state.updateLoading || !(u.enabled && u.available === true);
  }
  async function installUpdate() {
    if (state.pending || state.updateLoading) return;
    var u = (state.status && state.status.update) || {};
    confirm('Install Tailscale ' + (u.latest || 'update') + '?', 'Installs the official release and restarts the connection for a few minutes. New releases are untested on this TV until confirmed.', [
      { label: 'Keep current version', run: function () {} },
      { label: 'Install update', run: async function () {
        clearError(); state.updateLoading = true; state.updateMessage = ''; renderUpdate();
        var poll = setInterval(refresh, 5000);
        var result = await call('updateDaemon', {}, 250000);
        clearInterval(poll); state.updateLoading = false;
        if (result.returnValue && result.updated) state.updateMessage = 'Updated to ' + (result.current || 'the new version') + '.';
        else if (result.returnValue) state.updateMessage = 'No newer version was installed (' + (result.current || 'unknown version') + ').';
        else { state.updateMessage = ''; showError(errorMessage(result, 'Updating Tailscale'), installUpdate); }
        renderUpdate(); ensureFocus();
      } }
    ]);
  }
  async function refresh() {
    if (state.refreshing) return;
    state.refreshing = true;
    var epoch = state.mutationEpoch;
    var response = await call('status', {});
    state.refreshing = false;
    if (epoch !== state.mutationEpoch) return;
    if (!response.returnValue || ['Running', 'Stopped', 'Starting', 'NeedsLogin', 'NeedsMachineAuth'].indexOf(response.backendState) === -1 || typeof response.needsLogin !== 'boolean' || response.statusAvailable === false || response.stale === true) {
      state.statusError = response.error || 'status-unavailable';
      if (response.returnValue && typeof response.backendState === 'string' && !state.status) state.status = response;
    } else { state.status = response; state.statusError = null; }
    renderStatus();
    if (state.route === 'auth') {
      if (statusKind() === 'connected') { state.authURL = null; navigate('status', true); }
      else text('auth-progress', statusKind() === 'approval' ? approvalProgress() : state.statusError ? 'Connection status is unavailable. Refresh the sign-in code, or go back to Status and open Troubleshooting.' : 'Waiting for sign-in and TV connection…');
    } else if (state.pending === 'connect') openPendingSignIn();
    if (statusKind() === 'connected') await loadPeers(false);
    else {
      text('peer-summary', state.statusError ? 'Connection status unavailable' : 'Connect to view devices');
      if (state.route === 'devices') renderPeers();
    }
    ensureFocus();
  }
  function approvalProgress() {
    return 'Sign-in is complete. Ask a tailnet administrator to approve this TV in the Tailscale admin console. Waiting for approval…';
  }
  function openPendingSignIn() {
    if (state.authAutoOpened || state.statusError || !state.status || !state.status.needsLogin) return;
    state.authAutoOpened = true; state.authOrigin = el('connection-action'); navigate('auth', true);
  }
  function renderPeers() {
    var kind = statusKind(), list = el('device-list'), region = el('devices-scroll');
    var canShow = kind === 'connected' && !state.statusError;
    if (!canShow) {
      text('devices-feedback', kind === 'unavailable' ? 'Connection status is unavailable. Go back to Status and choose Retry status.' : 'Connect this TV to see other tailnet devices.');
      list.textContent = ''; peersRenderKey = null; region.hidden = true; text('devices-count', ''); return;
    }
    text('devices-feedback', state.peersLoading && !state.peers ? 'Loading devices…' : state.peersError ? errorMessage({ error: state.peersError }, 'Loading devices') : state.peers && !state.peers.length ? 'Your tailnet has reported no other devices. Choose Refresh devices to check again.' : '');
    if (!state.peers || state.peersError) { list.textContent = ''; peersRenderKey = null; region.hidden = true; text('devices-count', ''); return; }
    var online = state.peers.filter(function (peer) { return peer.online; }).length;
    var count = online + ' online · ' + (state.peers.length - online) + ' offline';
    text('devices-count', count); text('peer-summary', count);
    if (state.route !== 'devices') return;
    var key = JSON.stringify(state.peers.map(function (peer) { return [peer.name, peer.given, peer.ip, peer.online, peer.os]; }));
    region.hidden = !state.peers.length;
    if (key === peersRenderKey) return;
    peersRenderKey = key;
    var top = region.scrollTop;
    list.textContent = '';
    state.peers.forEach(function (peer) {
      var row = el('device-row-template').content.firstElementChild.cloneNode(true);
      row.querySelector('.device-name').textContent = peer.given || peer.name;
      row.querySelector('.device-host').textContent = peer.given && peer.given !== peer.name ? peer.name : '';
      row.querySelector('.device-status').textContent = peer.online ? 'Online' : 'Offline';
      row.querySelector('.device-status').classList.add(peer.online ? 'online' : 'offline');
      row.querySelector('.device-address').textContent = peer.ip;
      row.querySelector('.device-os').textContent = peer.os || 'Operating system not reported';
      list.appendChild(row);
    });
    region.hidden = !state.peers.length; region.scrollTop = top;
  }
  async function loadPeers(manual) {
    if (state.peersLoading || statusKind() !== 'connected') { if (manual) renderPeers(); return; }
    state.peersLoading = true; el('refresh-devices').disabled = true; renderPeers();
    var epoch = state.mutationEpoch;
    var response = await call('getPeers', {}, 15000);
    state.peersLoading = false; el('refresh-devices').disabled = false;
    if (epoch !== state.mutationEpoch) { renderPeers(); ensureFocus(); return; }
    if (response.returnValue && Array.isArray(response.peers) && response.peers.length <= 100 && response.peers.every(function (peer) { return peer && typeof peer === 'object' && typeof peer.name === 'string' && typeof peer.ip === 'string' && typeof peer.online === 'boolean'; })) { state.peers = response.peers; state.peersError = null; }
    else { state.peersError = response.error || 'peers-unavailable'; text('peer-summary', 'Device information unavailable'); }
    renderPeers(); ensureFocus();
  }
  function paintPrefs() {
    prefKeys.forEach(function (key) {
      var input = el('pref-' + key);
      input.disabled = !state.draft || state.prefsLoading || !!state.prefsError || !!state.pending;
      input.checked = !!state.draft && state.draft[key];
    });
    text('save-state', state.pending === 'save' ? 'Saving settings…' : state.prefsLoading ? 'Loading settings…' : state.prefsError ? errorMessage({ error: state.prefsError }, 'Loading settings') : state.saveMessage || (dirty() ? 'Unsaved changes' : 'No unsaved changes.'));
    el('save-settings').disabled = !dirty() || !!state.pending || !!state.prefsError || state.prefsLoading;
    el('discard-settings').disabled = !dirty() || !!state.pending || state.prefsLoading;
    el('retry-preferences').hidden = !state.prefsError;
    el('retry-preferences').disabled = !!state.pending || state.prefsLoading;
  }
  async function loadPrefs() {
    if (state.prefsLoading || dirty()) return;
    state.prefsLoading = true; state.prefsError = null; paintPrefs();
    var response = await call('getPreferences', {});
    state.prefsLoading = false;
    if (response.returnValue && prefKeys.every(function (key) { return typeof response[key] === 'boolean'; })) {
      state.saved = copyPrefs(response); state.draft = copyPrefs(response); state.prefsError = null;
    } else { state.prefsError = response.error || 'preferences-unavailable'; }
    paintPrefs(); ensureFocus();
  }
  async function savePrefs() {
    if (!dirty() || state.pending || state.prefsError) return false;
    var requested = copyPrefs(state.draft);
    state.pending = 'save'; state.saveMessage = ''; paintPrefs(); renderStatus();
    var result = await call('setPreferences', requested, 35000);
    var readback = result.returnValue ? await call('getPreferences', {}) : null;
    state.pending = null;
    if (result.returnValue && readback.returnValue && prefsEqual(requested, readback)) {
      state.saved = copyPrefs(readback); state.draft = copyPrefs(readback);
      state.saveMessage = result.applied === false ? 'Settings saved. They will apply when you connect this TV.' : 'Settings saved and applied.';
      clearError();
    } else {
      state.saveMessage = result.saved === true ? 'Settings saved, but applying them was not confirmed. Retry to apply them.' : 'Saving was not confirmed. Your edits are kept.';
      showError(errorMessage(result.returnValue ? { error: 'apply-failed' } : result, 'Saving settings'), savePrefs);
    }
    paintPrefs(); renderStatus(); ensureFocus();
    return result.returnValue && !!readback && readback.returnValue && prefsEqual(requested, readback);
  }
  function discardPrefs() { state.draft = copyPrefs(state.saved); state.saveMessage = ''; paintPrefs(); }
  function closeDialog() {
    if (dialog.open) dialog.close();
    var target = dialogReturn; dialogReturn = null;
    if (available(target)) focus(target); else ensureFocus();
  }
  function confirm(title, description, choices) {
    if (dialog.open) return;
    dialogReturn = document.activeElement;
    text('confirmation-title', title); text('confirmation-description', description);
    var group = el('confirmation-actions'); group.textContent = '';
    choices.forEach(function (choice, index) {
      var button = document.createElement('button'); button.className = 'button ' + (choice.danger ? 'secondary danger' : 'secondary'); button.textContent = choice.label;
      button.addEventListener('click', function () { closeDialog(); choice.run(); }); group.appendChild(button);
      if (index === 0) button.autofocus = true;
    });
    dialog.showModal(); focus(group.firstElementChild);
  }
  function guardLeave(proceed) {
    if (state.pending === 'save') { showError('Wait for the settings save to finish before leaving this screen.'); return; }
    if (!dirty()) { proceed(); return; }
    confirm('Unsaved settings', 'Save these settings before leaving? Discard changes to leave without saving, or Keep editing to stay here.', [
      { label: 'Keep editing', run: function () {} },
      { label: 'Discard changes', run: function () { discardPrefs(); proceed(); } },
      { label: 'Save settings', run: async function () { if (await savePrefs()) proceed(); } }
    ]);
  }
  function navigate(route, forced, backwards) {
    if (!routeTitles[route] || route === state.route) return;
    if (!forced && editing(state.route) && !editing(route)) { guardLeave(function () { navigate(route, true, backwards); }); return; }
    if (document.activeElement.id) state.focus[state.route] = document.activeElement.id;
    if (backwards) state.history.pop();
    else if (route === 'status') state.history = ['status'];
    else if (route === 'settings') state.history = ['status', 'settings'];
    else state.history.push(route);
    if (route === 'auth') state.authAutoOpened = true;
    if (state.route === 'auth') {
      state.authRequest++; state.authLoading = false; state.authURL = null;
      el('qr-box').textContent = ''; text('auth-url', '');
    }
    state.route = route;
    state.suppressHoverUntil = Date.now() + 250;
    document.querySelectorAll('.screen').forEach(function (section) { section.hidden = section.id !== 'screen-' + route; });
    var root = route === 'status' || route === 'settings';
    el('root-nav').hidden = !root; el('child-header').hidden = root; el('save-bar').hidden = !editing(route);
    ['status', 'settings'].forEach(function (name) { var node = el('nav-' + name); if (route === name) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
    text('screen-title', routeTitles[route]); text('parent-title', routeTitles[state.history[state.history.length - 2]] || 'Status');
    window.scrollTo(0, 0);
    ensureFocus(true);
    if (editing(route) && !state.draft) loadPrefs();
    if (route === 'devices') { renderPeers(); loadPeers(true); }
    if (route === 'details') renderStatus();
    if (route === 'troubleshooting') loadDiagnostics();
    if (route === 'auth') loadAuth();
  }
  function back() {
    if (dialog.open) { closeDialog(); return; }
    if (state.history.length > 1) { navigate(state.history[state.history.length - 2], false, true); return; }
    confirm('Close Tailscale?', 'The TV stays connected in the background. Closing this app does not disconnect Tailscale.', [
      { label: 'Stay here', run: function () {} },
      { label: 'Close app', run: function () {
        if (window.PalmSystem && window.PalmSystem.platformBack && window.webOS) window.webOS.platformBack();
        else showError('Platform exit is available on the LG TV. You can close this browser preview.');
      } }
    ]);
  }
  function validAuthURL(value) {
    if (typeof value !== 'string' || value.length > 8192) return false;
    try { var url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch (ignore) { return false; }
  }
  async function loadAuth() {
    if (state.authLoading) return;
    state.authLoading = true;
    var request = ++state.authRequest;
    state.authURL = null; el('qr-box').textContent = ''; text('auth-url', ''); text('qr-feedback', 'Loading sign-in information…'); text('auth-progress', '');
    el('screen-auth').querySelector('.instructions').hidden = true;
    el('refresh-auth').disabled = true;
    var response = await call('getAuthUrl', {});
    if (request !== state.authRequest || state.route !== 'auth') return;
    state.authLoading = false; el('refresh-auth').disabled = false;
    if (response.returnValue && response.needsLogin && validAuthURL(response.authUrl)) {
      state.authURL = response.authUrl; text('auth-url', response.authUrl);
      el('screen-auth').querySelector('.instructions').hidden = false;
      try {
        var qr = qrcode(0, 'M'); qr.addData(response.authUrl); qr.make();
        el('qr-box').innerHTML = qr.createSvgTag({ scalable: true });
        el('qr-box').firstChild.setAttribute('role', 'img'); el('qr-box').firstChild.setAttribute('aria-label', 'QR code for the sign-in address shown beside it');
        text('qr-feedback', 'Scan this code with your phone.');
      } catch (ignore) { text('qr-feedback', 'The QR code could not be displayed. Open the sign-in address on your phone instead.'); }
      text('auth-progress', 'Waiting for sign-in and TV connection…');
    } else {
      text('qr-feedback', statusKind() === 'approval' ? 'Sign-in complete. No new sign-in code is needed.' : response.returnValue ? 'No sign-in code is available yet.' : errorMessage(response, 'Loading sign-in'));
      text('auth-progress', statusKind() === 'approval' ? approvalProgress() : response.returnValue && !response.needsLogin ? 'Go back to Status to check the TV’s connection.' : 'Choose Refresh sign-in code to try again. Going back to Status does not disconnect the TV.');
    }
  }
  async function runOperation(method) {
    if (state.pending) return;
    clearError(); state.pending = method; state.mutationEpoch++;
    if (method === 'connect') state.authAutoOpened = false;
    state.peers = null; state.peersError = null;
    if (state.route === 'devices') renderPeers();
    renderStatus(); ensureFocus();
    // Read-only polling continues while a connect request waits for phone approval.
    var pendingPoll = setInterval(refresh, 2000);
    var result = await call(method, {}, method === 'connect' ? 60000 : 35000);
    clearInterval(pendingPoll); state.pending = null; state.mutationEpoch++;
    while (state.refreshing) await new Promise(function (resolve) { setTimeout(resolve, 50); });
    await refresh();
    if (!result.returnValue && !(method === 'connect' && !state.statusError && state.status && (state.status.needsLogin || state.status.backendState === 'NeedsMachineAuth'))) showError(errorMessage(result, method === 'logout' ? 'Signing out' : method === 'disconnect' ? 'Disconnecting' : 'Connecting'), function () { runOperation(method); });
    else if (method === 'connect') openPendingSignIn();
    else if (method === 'logout' && result.returnValue) { navigate('status', true); }
    renderStatus(); ensureFocus();
  }
  async function loadDiagnostics() {
    if (state.diagnosticsLoading) return;
    state.diagnosticsLoading = true; el('refresh-diagnostics').disabled = true; text('diagnostics-feedback', 'Checking the background service…');
    var response = await call('getDiagnostics', {});
    state.diagnosticsLoading = false; el('refresh-diagnostics').disabled = false; state.diagnostics = response;
    text('raw-diagnostics', JSON.stringify(response, null, 2));
    if (!response.returnValue) {
      text('diagnostics-feedback', errorMessage(response, 'Loading diagnostics'));
      detailList('diagnostic-summary', [['Service communication', 'Unavailable'], ['Connection', 'Not confirmed']]);
    } else {
      text('diagnostics-feedback', 'The background service responded. This does not confirm access to other tailnet devices.');
      detailList('diagnostic-summary', [['Service communication', 'Available'], ['Daemon', response.daemon], ['Host discovery', response.hostProbed === true ? 'TV information received' : 'Not reported'], ['TUN device', response.host && typeof response.host.tunExists === 'boolean' ? response.host.tunExists ? 'Present' : 'Not found' : 'Not confirmed'], ['Service version', response.serviceVersion], ['Tailscale version', response.tailscaleVersion]]);
    }
    ensureFocus();
  }
  function moveFocus(key) {
    var current = document.activeElement, nodes = controls(), origin = current.getBoundingClientRect();
    if (nodes.indexOf(current) === -1) { ensureFocus(); return; }
    if (current.classList.contains('scroll-region') && (key === 38 || key === 40)) {
      var canScroll = key === 38 ? current.scrollTop > 1 : current.scrollTop + current.clientHeight < current.scrollHeight - 1;
      if (canScroll) { current.scrollTop += key === 38 ? -160 : 160; return; }
    }
    var x = origin.left + origin.width / 2, y = origin.top + origin.height / 2;
    var horizontal = key === 37 || key === 39, forward = key === 39 || key === 40;
    var best = null, bestScore = Infinity;
    nodes.forEach(function (node) {
      if (node === current) return;
      var rect = node.getBoundingClientRect(), dx = rect.left + rect.width / 2 - x, dy = rect.top + rect.height / 2 - y;
      var primary = horizontal ? dx : dy, cross = horizontal ? Math.abs(dy) : Math.abs(dx);
      if (forward ? primary <= 2 : primary >= -2) return;
      var overlaps = horizontal ? rect.top < origin.bottom && rect.bottom > origin.top : rect.left < origin.right && rect.right > origin.left;
      // Prefer a control in the same visible row/column over a diagonal shortcut.
      var score = Math.abs(primary) + cross * 2 + (overlaps ? 0 : 10000);
      if (score < bestScore) { best = node; bestScore = score; }
    });
    focus(best);
  }
  document.addEventListener('keydown', function (event) {
    var key = event.keyCode;
    if (key === 9 && dialog.open) {
      var nodes = controls(), index = nodes.indexOf(document.activeElement);
      if (nodes.length && (index === -1 || (event.shiftKey ? index === 0 : index === nodes.length - 1))) {
        event.preventDefault(); focus(event.shiftKey ? nodes[nodes.length - 1] : nodes[0]);
      }
    }
    else if (key >= 37 && key <= 40) { event.preventDefault(); moveFocus(key); }
    else if (key === 461 || key === 10009 || key === 8 || key === 27) { event.preventDefault(); back(); }
    else if (key === 13 && document.activeElement.matches('input[type="checkbox"]')) { event.preventDefault(); document.activeElement.click(); }
  });
  document.addEventListener('mouseover', function (event) {
    if (Date.now() < state.suppressHoverUntil) return;
    var target = event.target.closest('button, input, label');
    if (target && target.tagName === 'LABEL') target = el(target.htmlFor);
    if (available(target) && (!dialog.open || dialog.contains(target))) target.focus();
  });
  dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeDialog(); });
  document.querySelectorAll('[data-route]').forEach(function (button) { button.addEventListener('click', function () { navigate(button.getAttribute('data-route')); }); });
  el('back-button').addEventListener('click', back);
  el('close-auth').addEventListener('click', back);
  el('refresh-auth').addEventListener('click', loadAuth);
  el('refresh-devices').addEventListener('click', function () { loadPeers(true); });
  el('refresh-diagnostics').addEventListener('click', loadDiagnostics);
  el('retry-preferences').addEventListener('click', loadPrefs);
  el('save-settings').addEventListener('click', savePrefs);
  el('install-update').addEventListener('click', installUpdate);
  el('discard-settings').addEventListener('click', discardPrefs);
  el('dismiss-error').addEventListener('click', function () { clearError(); ensureFocus(); });
  el('retry-operation').addEventListener('click', function () { if (state.retry) state.retry(); });
  document.querySelectorAll('[data-pref]').forEach(function (input) {
    input.addEventListener('change', function () { if (!state.draft) return; state.draft[input.getAttribute('data-pref')] = input.checked; state.saveMessage = ''; paintPrefs(); });
  });
  el('connection-action').addEventListener('click', function () {
    var kind = statusKind();
    if (kind === 'unavailable' || kind === 'approval') refresh();
    else if (kind === 'unsupported') navigate('troubleshooting');
    else if (kind === 'login') { state.authOrigin = el('connection-action'); navigate('auth'); }
    else runOperation(kind === 'connected' ? 'disconnect' : 'connect');
  });
  el('sign-out').addEventListener('click', function () {
    guardLeave(function () { confirm('Sign out of Tailscale?', 'This TV will disconnect and lose its Tailscale sign-in. You will need to sign in again to reconnect. To keep its sign-in, cancel and choose Disconnect on Status.', [
      { label: 'Cancel', run: function () {} }, { label: 'Sign out', danger: true, run: function () { runOperation('logout'); } }
    ]); });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  setInterval(function () { if (!document.hidden) refresh(); }, 15000);
  setInterval(function () { if (state.route === 'auth' && !document.hidden) refresh(); }, 2000);
  refresh(); ensureFocus();
})();
