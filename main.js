const { app, BrowserWindow, session, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Seed Google auth cookies once, so the app is signed in without a fresh login.
async function importCookies(ses) {
  const flag = path.join(app.getPath('userData'), '.cookies-imported');
  const file = path.join(__dirname, 'cookies.json');
  if (fs.existsSync(flag) || !fs.existsSync(file)) return;
  let list;
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return; }
  const ssMap = { None: 'no_restriction', Lax: 'lax', Strict: 'strict' };
  let ok = 0;
  for (const c of list) {
    const isHost = c.name.startsWith('__Host-');
    const host = c.domain.replace(/^\./, '');
    const url = 'https://' + host + (c.path || '/');
    const det = {
      url,
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: isHost ? true : !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: ssMap[c.sameSite] || 'unspecified',
    };
    if (!isHost) det.domain = c.domain;           // __Host- cookies must be host-only
    if (c.expires) det.expirationDate = c.expires;
    try { await ses.cookies.set(det); ok++; } catch (e) { /* skip bad ones */ }
  }
  try { fs.writeFileSync(flag, String(ok)); } catch (e) {}
  console.log('imported cookies:', ok, '/', list.length);
}

// A clean Chrome UA so Google's sign-in doesn't flag an "insecure browser".
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Gmail',
    backgroundColor: '#202124',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs fs to load Dark Reader
      spellcheck: true,
    },
  });

  const ses = win.webContents.session;
  ses.setUserAgent(CHROME_UA);

  // Strip CSP so Dark Reader can be injected into the page (Gmail's CSP blocks inline scripts).
  ses.webRequest.onHeadersReceived((details, cb) => {
    const h = details.responseHeaders || {};
    for (const k of Object.keys(h)) {
      if (/^content-security-policy(-report-only)?$/i.test(k)) delete h[k];
    }
    cb({ responseHeaders: h });
  });

  // Auto-grant desktop notifications (and media) so Gmail alerts fire natively.
  ses.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
  });
  ses.setPermissionCheckHandler(() => true);

  importCookies(ses).finally(() => {
    win.loadURL('https://mail.google.com/mail/u/0/', { userAgent: CHROME_UA });
  });

  // Unwrap Gmail's google.com/url?q=... redirector to the real destination.
  function realUrl(url) {
    try {
      const u = new URL(url);
      if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === '/url') {
        const q = u.searchParams.get('q') || u.searchParams.get('url');
        if (q) return q;
      }
    } catch (e) {}
    return url;
  }

  // True only for the Gmail/account surfaces that must stay in-app.
  function isInApp(url) {
    try {
      const h = new URL(url).hostname;
      return /^(mail|accounts|login|myaccount|chat|contacts|drive|docs|calendar)\.google\.com$/.test(h)
        || h === 'mail.google.com';
    } catch (e) { return false; }
  }

  // New windows / target=_blank: keep Gmail surfaces in-app, everything else to the OS default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const dest = realUrl(url);
    if (isInApp(dest)) return { action: 'allow' };
    shell.openExternal(dest);
    return { action: 'deny' };
  });

  // In-place navigation to an external site: bounce it to the default browser.
  win.webContents.on('will-navigate', (e, url) => {
    const dest = realUrl(url);
    if (!isInApp(dest)) {
      e.preventDefault();
      shell.openExternal(dest);
    }
  });

  // Close to tray-like behavior: on macOS keep app alive, just hide window.
  win.on('close', (e) => {
    if (!app.isQuitting && process.platform === 'darwin') {
      e.preventDefault();
      win.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (win) win.show();
    else createWindow();
  });
});

// --- Claude Code bridge: drive the user's LOCAL claude CLI (their logged-in
// subscription session, NOT the API) and stream events to the chat widget. ---
const CLAUDE_BIN = path.join(os.homedir(), '.local', 'bin', 'claude');
let claudeChild = null;

function claudeBin() {
  return fs.existsSync(CLAUDE_BIN) ? CLAUDE_BIN : 'claude';
}

// The renderer owns session identity (so history + switching persist across
// app restarts): it passes a stable session-id uuid and whether this session
// has been started yet (resume vs. create).
function runClaude(text, sessionId, resume) {
  if (claudeChild) return; // one turn at a time
  if (!sessionId) sessionId = crypto.randomUUID();

  const args = [
    '-p', text,
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions',
  ];
  if (resume) args.push('--resume', sessionId);
  else args.push('--session-id', sessionId);

  const send = (ev) => { if (win && !win.isDestroyed()) win.webContents.send('claude-event', ev); };

  let child;
  try {
    child = spawn(claudeBin(), args, {
      cwd: os.homedir(),
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT: '1',
        CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT: '1',
      },
    });
  } catch (e) {
    send({ type: 'bridge-error', error: String(e && e.message || e) });
    return;
  }
  claudeChild = child;

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try { send(JSON.parse(line)); }
      catch (e) { /* non-JSON noise, ignore */ }
    }
  });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });
  child.on('error', (e) => {
    send({ type: 'bridge-error', error: String(e && e.message || e) });
  });
  child.on('close', (code) => {
    claudeChild = null;
    send({ type: 'turn-closed', code, stderr: code ? stderr.slice(-2000) : '' });
  });
}

ipcMain.on('claude-send', (e, payload) => {
  const p = payload || {};
  const text = typeof p === 'string' ? p : p.text;
  if (text && String(text).trim()) runClaude(String(text).trim(), p.sessionId, !!p.resume);
});
ipcMain.on('claude-stop', () => {
  if (claudeChild) { try { claudeChild.kill('SIGTERM'); } catch (e) {} }
});

// Unread badge from the renderer.
ipcMain.on('unread-count', (e, count) => {
  const n = Number(count) || 0;
  if (process.platform === 'darwin') {
    app.dock.setBadge(n > 0 ? String(n) : '');
  } else {
    app.setBadgeCount(n);
  }
});

// Bring the window forward when a notification is clicked.
ipcMain.on('focus-window', () => {
  if (win) { win.show(); win.focus(); }
});

app.on('before-quit', () => { app.isQuitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
