// Small bridge for lib/services/push/push_web.dart: subscribing to Web Push
// needs a few browser APIs that are much simpler to drive from plain JS.
window.samepacePush = (function () {
  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window &&
      'Notification' in window;
  }

  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function standalone() {
    return window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
  }

  // iPhone/iPad only allow push for web apps opened from the home screen.
  function needsHomeScreen() {
    return isIos() && !standalone() && !supported();
  }

  function b64urlToBytes(value) {
    var b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var raw = atob(b64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function bytesToB64url(buffer) {
    var bytes = new Uint8Array(buffer);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function findRegistration() {
    var regs = await navigator.serviceWorker.getRegistrations();
    for (var i = 0; i < regs.length; i++) {
      var w = regs[i].active || regs[i].waiting || regs[i].installing;
      if (w && w.scriptURL.indexOf('push_sw.js') !== -1) return regs[i];
    }
    return null;
  }

  async function activeRegistration() {
    var reg = await navigator.serviceWorker.register('push_sw.js');
    if (reg.active) return reg;
    var worker = reg.installing || reg.waiting;
    await new Promise(function (resolve) {
      if (!worker) return resolve();
      worker.addEventListener('statechange', function () {
        if (worker.state === 'activated') resolve();
      });
    });
    return reg;
  }

  // Must be the first thing a tap handler calls (iOS only allows the
  // permission prompt directly from a user gesture).
  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  }

  // Returns JSON {endpoint, p256dh, auth}.
  async function subscribe(publicKey) {
    var reg = await activeRegistration();
    var sub = await reg.pushManager.getSubscription();
    if (sub && sub.options && sub.options.applicationServerKey &&
        bytesToB64url(sub.options.applicationServerKey) !== publicKey) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(publicKey),
      });
    }
    return JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: bytesToB64url(sub.getKey('p256dh')),
      auth: bytesToB64url(sub.getKey('auth')),
    });
  }

  // Same JSON as subscribe() for this device's current subscription, or null.
  async function current() {
    if (!supported()) return null;
    if (Notification.permission !== 'granted') return null;
    var reg = await findRegistration();
    if (!reg) return null;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    return JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: bytesToB64url(sub.getKey('p256dh')),
      auth: bytesToB64url(sub.getKey('auth')),
    });
  }

  // Returns the endpoint that was removed, or null.
  async function unsubscribe() {
    if (!supported()) return null;
    var reg = await findRegistration();
    if (!reg) return null;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    var endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  }

  return {
    supported: supported,
    needsHomeScreen: needsHomeScreen,
    requestPermission: requestPermission,
    subscribe: subscribe,
    current: current,
    unsubscribe: unsubscribe,
  };
})();
