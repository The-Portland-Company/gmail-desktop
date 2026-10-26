// Claude chat widget — a floating Bartok button (bottom-right) that expands
// into a chat panel driven by the LOCAL claude CLI (via window.gmailClaude).
// Shows a live task list with checkboxes and red/green/orange status icons.
// Chat history persists in localStorage as switchable sessions; each session
// maps to a claude session-id uuid so `--resume` carries memory across restarts.
(function () {
  if (window.__gmailClaudeWidget) return;
  window.__gmailClaudeWidget = true;
  if (!window.gmailClaude) { console.warn('gmailClaude bridge missing'); return; }

  var ICON = window.__BARTOK_ICON || '';

  /* ------------------------------------------------ session persistence --- */
  var LS_SESSIONS = 'bartok.sessions';
  var LS_ACTIVE = 'bartok.activeSession';
  function uuid() {
    try { return crypto.randomUUID(); }
    catch (e) { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); }); }
  }
  function loadSessions() {
    try { var a = JSON.parse(localStorage.getItem(LS_SESSIONS) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveSessions() { try { localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions)); } catch (e) {} }
  function setActiveId(id) { try { localStorage.setItem(LS_ACTIVE, id); } catch (e) {} }
  function getActiveId() { try { return localStorage.getItem(LS_ACTIVE) || ''; } catch (e) { return ''; } }

  var sessions = loadSessions();
  var activeId = getActiveId();

  function active() {
    var s = sessions.filter(function (x) { return x.id === activeId; })[0];
    if (!s) s = newSession(false);
    return s;
  }
  function newSession(makeActive) {
    var s = { id: uuid(), title: 'New chat', started: false, created: Date.now(), updated: Date.now(), messages: [], todos: [] };
    sessions.unshift(s);
    if (makeActive !== false) { activeId = s.id; setActiveId(activeId); }
    saveSessions();
    return s;
  }
  function touch(s) { s.updated = Date.now(); sessions.sort(function (a, b) { return b.updated - a.updated; }); saveSessions(); }

  /* -------------------------------------------------------------- shell --- */
  var host = document.createElement('div');
  host.id = 'bartok-claude-host';
  host.setAttribute('data-darkreader-ignore', '');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
    .fab {
      position: fixed; right: 28px; bottom: 28px; width: 58px; height: 58px;
      border-radius: 50%; cursor: pointer; border: none; padding: 0;
      background: #1b1c1f; box-shadow: 0 6px 20px rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s ease;
    }
    .fab:hover { transform: scale(1.06); }
    .fab img { width: 34px; height: 34px; border-radius: 8px; pointer-events: none; }
    .fab .dot {
      position: absolute; right: 2px; top: 2px; width: 14px; height: 14px;
      border-radius: 50%; border: 2px solid #1b1c1f; background: #6b7280;
    }
    .dot.idle { background: #6b7280; }
    .dot.working { background: #f59e0b; animation: pulse 1s infinite; }
    .dot.success { background: #22c55e; }
    .dot.error { background: #ef4444; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

    .panel {
      position: fixed; right: 28px; bottom: 28px; width: 390px; height: 580px;
      max-height: calc(100vh - 56px); background: #202124; color: #e8eaed;
      border: 1px solid #3c4043; border-radius: 16px; overflow: hidden;
      box-shadow: 0 16px 48px rgba(0,0,0,.55); display: none; flex-direction: column;
    }
    .panel.open { display: flex; }
    .hidden { display: none !important; }

    .head { display:flex; align-items:center; gap:8px; padding:12px 14px;
      background:#17181b; border-bottom:1px solid #3c4043; }
    .head img { width:26px; height:26px; border-radius:6px; }
    .head .title { font-weight:600; font-size:14px; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .head .state { font-size:11px; padding:3px 8px; border-radius:10px; background:#2a2b2f; color:#9aa0a6; }
    .head .state.working { color:#f59e0b; } .head .state.success { color:#22c55e; } .head .state.error { color:#ef4444; }
    .head button { background:none; border:none; color:#9aa0a6; cursor:pointer; font-size:15px; padding:4px 7px; border-radius:6px; line-height:1; }
    .head button:hover { background:#2a2b2f; color:#e8eaed; }

    /* sessions drawer */
    .drawer { position:absolute; inset:0; background:#202124; display:none; flex-direction:column; z-index:5; }
    .drawer.open { display:flex; }
    .drawer .dhead { display:flex; align-items:center; gap:8px; padding:12px 14px; background:#17181b; border-bottom:1px solid #3c4043; }
    .drawer .dhead .title { flex:1; font-weight:600; font-size:14px; }
    .slist { flex:1; overflow:auto; padding:6px; }
    .sitem { display:flex; align-items:center; gap:8px; padding:9px 10px; border-radius:10px; cursor:pointer; }
    .sitem:hover { background:#2a2b2f; }
    .sitem.active { background:#2f3b52; }
    .sitem .st { flex:1; min-width:0; }
    .sitem .sn { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .sitem .sd { font-size:11px; color:#80868b; margin-top:2px; }
    .sitem .del { opacity:0; color:#9aa0a6; font-size:13px; padding:2px 6px; border-radius:6px; }
    .sitem:hover .del { opacity:.8; } .sitem .del:hover { background:#3a1e1e; color:#f7b4b4; }
    .newbtn { margin:8px; padding:9px; text-align:center; background:#3b82f6; color:#fff; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600; }
    .newbtn:hover { background:#2f6fd6; }

    .tasks { border-bottom:1px solid #3c4043; padding:8px 10px; max-height:160px; overflow:auto; }
    .tasks .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#80868b; margin:2px 4px 6px; }
    .task { display:flex; align-items:center; gap:8px; padding:4px 4px; font-size:13px; }
    .task .box { width:15px; height:15px; border-radius:4px; border:1.5px solid #5f6368; flex:none;
      display:flex; align-items:center; justify-content:center; font-size:11px; }
    .task.completed .box { background:#22c55e; border-color:#22c55e; color:#0b1f12; }
    .task.in_progress .box { border-color:#f59e0b; }
    .task.stopped .box { border-color:#ef4444; }
    .task .ic { font-size:12px; flex:none; width:14px; text-align:center; }
    .task.completed .ic { color:#22c55e; } .task.in_progress .ic { color:#f59e0b; }
    .task.stopped .ic { color:#ef4444; } .task.pending .ic { color:#6b7280; }
    .task .txt { flex:1; color:#e8eaed; }
    .task.completed .txt { color:#9aa0a6; text-decoration:line-through; }

    .log { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:10px; }
    .msg { max-width:88%; padding:8px 11px; border-radius:12px; font-size:13px; line-height:1.45; white-space:pre-wrap; word-wrap:break-word; }
    .msg.user { align-self:flex-end; background:#394457; }
    .msg.assistant { align-self:flex-start; background:#2a2b2f; }
    .msg.tool { align-self:flex-start; background:transparent; color:#80868b; font-size:11px; padding:2px 4px; font-style:italic; }
    .msg.err { align-self:flex-start; background:#3a1e1e; color:#f7b4b4; }

    .foot { display:flex; gap:8px; padding:10px; border-top:1px solid #3c4043; background:#17181b; }
    .foot textarea { flex:1; resize:none; height:38px; max-height:120px; background:#202124; color:#e8eaed;
      border:1px solid #3c4043; border-radius:10px; padding:9px 11px; font-size:13px; outline:none; }
    .foot textarea:focus { border-color:#5f6368; }
    .foot button { border:none; border-radius:10px; padding:0 14px; font-size:13px; font-weight:600; cursor:pointer; }
    .send { background:#3b82f6; color:#fff; } .send:hover { background:#2f6fd6; }
    .stop { background:#ef4444; color:#fff; } .stop:hover { background:#d63d3d; }
  </style>

  <button class="fab" title="Bartok · Claude Code">
    <img src="${ICON}" alt="Bartok"/>
    <span class="dot idle"></span>
  </button>

  <section class="panel">
    <div class="head">
      <img src="${ICON}" alt=""/>
      <span class="title">Bartok</span>
      <span class="state">idle</span>
      <button class="sessions" title="Chats">☰</button>
      <button class="new" title="New chat">+</button>
      <button class="min" title="Collapse">—</button>
    </div>

    <div class="drawer">
      <div class="dhead"><span class="title">Chats</span><button class="dclose" title="Back">✕</button></div>
      <div class="newbtn">+ New chat</div>
      <div class="slist"></div>
    </div>

    <div class="tasks hidden"><div class="lbl">Tasks</div><div class="tasklist"></div></div>
    <div class="log"></div>
    <div class="foot">
      <textarea class="input" placeholder="Ask Bartok to clean things up…"></textarea>
      <button class="send">Send</button>
      <button class="stop hidden">Stop</button>
    </div>
  </section>`;

  var $ = function (s) { return root.querySelector(s); };
  var fab = $('.fab'), dot = $('.dot'), panel = $('.panel');
  var titleEl = $('.head .title'), stateEl = $('.state');
  var logEl = $('.log'), tasksBox = $('.tasks'), taskList = $('.tasklist');
  var input = $('.input'), sendBtn = $('.send'), stopBtn = $('.stop'), minBtn = $('.min');
  var sessionsBtn = $('.sessions'), newBtn = $('.new'), drawer = $('.drawer'), dcloseBtn = $('.dclose'),
      newInDrawer = $('.newbtn'), slist = $('.slist');

  var running = false;

  function setState(s) { // idle | working | success | error
    dot.className = 'dot ' + s;
    stateEl.className = 'state ' + (s === 'idle' ? '' : s);
    stateEl.textContent = s;
    running = (s === 'working');
    stopBtn.classList.toggle('hidden', !running);
    sendBtn.classList.toggle('hidden', running);
  }

  function addBubble(cls, text) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }
  // Add to the view AND persist to the active session (tool chatter isn't saved).
  function addMsg(cls, text) {
    addBubble(cls, text);
    if (cls !== 'tool') {
      var s = active();
      s.messages.push({ cls: cls, text: text });
      if (s.title === 'New chat' && cls === 'user') s.title = text.slice(0, 48);
      touch(s);
    }
  }

  var TASK_IC = { completed: '✓', in_progress: '⟳', pending: '○', stopped: '■' };
  function renderTasks(todos) {
    if (!todos || !todos.length) { tasksBox.classList.add('hidden'); taskList.innerHTML = ''; return; }
    tasksBox.classList.remove('hidden');
    taskList.innerHTML = '';
    todos.forEach(function (t) {
      var st = t.status || 'pending';
      var row = document.createElement('div');
      row.className = 'task ' + st;
      row.innerHTML = (st === 'completed' ? '<span class="box">✓</span>' : '<span class="box"></span>')
        + '<span class="ic">' + (TASK_IC[st] || '○') + '</span><span class="txt"></span>';
      row.querySelector('.txt').textContent = t.content || t.activeForm || '';
      taskList.appendChild(row);
    });
  }

  // Rebuild the transcript + tasks view from a saved session.
  function renderSession(s) {
    logEl.innerHTML = '';
    (s.messages || []).forEach(function (m) { addBubble(m.cls, m.text); });
    renderTasks(s.todos || []);
    titleEl.textContent = s.title || 'Bartok';
    setState('idle');
  }

  function renderSessionList() {
    slist.innerHTML = '';
    sessions.forEach(function (s) {
      var it = document.createElement('div');
      it.className = 'sitem' + (s.id === activeId ? ' active' : '');
      var when = new Date(s.updated || s.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      it.innerHTML = '<div class="st"><div class="sn"></div><div class="sd">' + when + '</div></div><span class="del" title="Delete">🗑</span>';
      it.querySelector('.sn').textContent = s.title || 'New chat';
      it.querySelector('.st').addEventListener('click', function () { switchTo(s.id); });
      it.querySelector('.del').addEventListener('click', function (e) { e.stopPropagation(); deleteSession(s.id); });
      slist.appendChild(it);
    });
  }

  function switchTo(id) {
    if (running) window.gmailClaude.stop();
    activeId = id; setActiveId(id);
    renderSession(active());
    drawer.classList.remove('open');
  }
  function deleteSession(id) {
    sessions = sessions.filter(function (x) { return x.id !== id; });
    if (activeId === id) { activeId = sessions[0] ? sessions[0].id : ''; setActiveId(activeId); }
    saveSessions();
    if (!sessions.length) newSession();
    renderSessionList();
    renderSession(active());
  }
  function startNew() {
    if (running) window.gmailClaude.stop();
    newSession();
    renderSession(active());
    drawer.classList.remove('open');
    input.focus();
  }

  function handleEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'system') { setState('working'); return; }
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      ev.message.content.forEach(function (b) {
        if (b.type === 'text' && b.text && b.text.trim()) addMsg('assistant', b.text.trim());
        else if (b.type === 'tool_use') {
          if (b.name === 'TodoWrite' && b.input && b.input.todos) {
            var s = active(); s.todos = b.input.todos; touch(s); renderTasks(s.todos);
          } else { addBubble('tool', 'using ' + (b.name || 'tool') + '…'); }
        }
      });
      return;
    }
    if (ev.type === 'result') {
      var bad = ev.is_error || (ev.subtype && ev.subtype !== 'success');
      setState(bad ? 'error' : 'success');
      if (bad && ev.subtype) addMsg('err', 'Stopped: ' + ev.subtype);
      return;
    }
    if (ev.type === 'bridge-error') { addMsg('err', ev.error || 'Bridge error'); markStopped(); setState('error'); return; }
    if (ev.type === 'turn-closed') {
      if (running) {
        if (ev.code) { addMsg('err', 'Claude exited (code ' + ev.code + ')' + (ev.stderr ? ': ' + ev.stderr : '')); markStopped(); setState('error'); }
        else setState('success');
      }
    }
  }

  function markStopped() {
    var s = active(); var changed = false;
    s.todos = (s.todos || []).map(function (t) {
      if (t.status === 'in_progress' || t.status === 'pending') { changed = true; return Object.assign({}, t, { status: 'stopped' }); }
      return t;
    });
    if (changed) { touch(s); renderTasks(s.todos); }
  }

  window.gmailClaude.onEvent(handleEvent);

  function submit() {
    var text = input.value.trim();
    if (!text || running) return;
    var s = active();
    addMsg('user', text);
    input.value = ''; input.style.height = '38px';
    setState('working');
    window.gmailClaude.send(text, s.id, !!s.started); // resume once the session has had a turn
    s.started = true; saveSessions();
  }

  sendBtn.addEventListener('click', submit);
  stopBtn.addEventListener('click', function () { window.gmailClaude.stop(); addBubble('tool', 'stop requested…'); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
  input.addEventListener('input', function () { input.style.height = '38px'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

  sessionsBtn.addEventListener('click', function () { renderSessionList(); drawer.classList.add('open'); });
  dcloseBtn.addEventListener('click', function () { drawer.classList.remove('open'); });
  newBtn.addEventListener('click', startNew);
  newInDrawer.addEventListener('click', startNew);

  function open() { panel.classList.add('open'); fab.classList.add('hidden'); renderSession(active()); input.focus(); }
  function close() { panel.classList.remove('open'); fab.classList.remove('hidden'); }
  fab.addEventListener('click', open);
  minBtn.addEventListener('click', close);

  if (!sessions.length) newSession();
})();
