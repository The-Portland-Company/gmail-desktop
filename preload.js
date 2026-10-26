const { ipcRenderer, webFrame, contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');

// --- Expose a tiny bridge to the LOCAL claude CLI for the chat widget ---
// The page gets send/stop/reset + an event stream; main.js owns the process.
const claudeListeners = new Set();
ipcRenderer.on('claude-event', (e, ev) => {
  for (const cb of claudeListeners) { try { cb(ev); } catch (_) {} }
});
contextBridge.exposeInMainWorld('gmailClaude', {
  send: (text, sessionId, resume) =>
    ipcRenderer.send('claude-send', { text: String(text || ''), sessionId: sessionId || '', resume: !!resume }),
  stop: () => ipcRenderer.send('claude-stop'),
  onEvent: (cb) => { if (typeof cb === 'function') claudeListeners.add(cb); },
});

// --- Dark email bodies: run Dark Reader in the page's main world ---
// webFrame.executeJavaScript runs in the main world and bypasses the page CSP
// that would otherwise block an injected <script> (Gmail sets a strict CSP).
function injectDarkReader() {
  try {
    const src = fs.readFileSync(path.join(__dirname, 'darkreader.js'), 'utf8');
    const boot =
      src +
      '\n;try{' +
      'window.DarkReader.setFetchMethod(window.fetch);' +
      'window.DarkReader.enable({brightness:100,contrast:90,sepia:0});' +
      '}catch(e){console.error("DarkReader enable failed",e);}';
    webFrame.executeJavaScript(boot).catch((e) => console.error('DR exec failed', e));
  } catch (e) {
    console.error('DarkReader inject failed', e);
  }
}

// --- Dock badge: read the unread count out of the Gmail title ---
function reportUnread() {
  try {
    let count = 0;
    // Preferred: the Inbox nav link's aria-label, e.g. "Inbox 12 unread".
    const link = document.querySelector("div[role=navigation] a[aria-label*='nbox']");
    const al = link && link.getAttribute('aria-label');
    let m = al && al.match(/(\d[\d,]*)\s*unread/i);
    if (m) count = parseInt(m[1].replace(/,/g, ''), 10);
    else {
      // Fallback: the window title, which shows "(N)" on the inbox view.
      m = document.title.match(/\((\d+)\)/);
      if (m) count = parseInt(m[1], 10);
    }
    ipcRenderer.send('unread-count', count);
  } catch (e) {}
}

// --- Native notifications: focus the window when one is clicked ---
function hookNotifications() {
  try {
    const Orig = window.Notification;
    if (!Orig || Orig.__patched) return;
    const Patched = function (title, opts) {
      const n = new Orig(title, opts);
      n.addEventListener('click', () => ipcRenderer.send('focus-window'));
      return n;
    };
    Patched.__patched = true;
    Patched.requestPermission = Orig.requestPermission.bind(Orig);
    Object.defineProperty(Patched, 'permission', { get: () => 'granted' });
    window.Notification = Patched;
  } catch (e) {}
}

// --- Plugins: run page-world scripts, CSP-free, after Dark Reader ---
function loadPlugin(name) {
  try {
    const src = fs.readFileSync(path.join(__dirname, 'plugins', name), 'utf8');
    webFrame.executeJavaScript(src).catch((e) => console.error('plugin exec failed', name, e));
  } catch (e) {
    console.error('plugin load failed', name, e);
  }
}

// --- Claude chat widget: inject into the page's main world with the Bartok
// icon as a data URI (page scripts can't read fs). ---
function injectChatWidget() {
  try {
    const src = fs.readFileSync(path.join(__dirname, 'plugins', 'claude-chat.js'), 'utf8');
    let icon = '';
    try {
      const b = fs.readFileSync(path.join(__dirname, 'assets', 'bartok-128.png'));
      icon = 'data:image/png;base64,' + b.toString('base64');
    } catch (e) {}
    const boot = 'window.__BARTOK_ICON=' + JSON.stringify(icon) + ';\n' + src;
    webFrame.executeJavaScript(boot).catch((e) => console.error('chat widget exec failed', e));
  } catch (e) {
    console.error('chat widget load failed', e);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  hookNotifications();
  injectDarkReader();
  loadPlugin('gmail-tweaks.js');
  injectChatWidget();
  reportUnread();
  setInterval(reportUnread, 4000);
  // Gmail is a long-lived SPA; Dark Reader keeps itself applied via its own observer.
});
