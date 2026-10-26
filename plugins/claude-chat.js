// Claude chat widget — a floating Bartok button (bottom-right) that expands
// into a chat panel driven by the LOCAL claude CLI (via window.gmailClaude).
// Shows a live task list with checkboxes and red/green/orange status icons.
(function () {
  if (window.__gmailClaudeWidget) return;
  window.__gmailClaudeWidget = true;
  if (!window.gmailClaude) { console.warn('gmailClaude bridge missing'); return; }

  const ICON = window.__BARTOK_ICON || '';

  // ---- host + shadow root (isolated from Gmail's styles) ----
  const host = document.createElement('div');
  host.id = 'bartok-claude-host';
  host.setAttribute('data-darkreader-ignore', '');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; }
    .fab {
      position: fixed; right: 28px; bottom: 28px; width: 58px; height: 58px;
      border-radius: 50%; cursor: pointer; border: none; padding: 0;
      background: #1b1c1f; box-shadow: 0 6px 20px rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s ease, box-shadow .15s ease;
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
      position: fixed; right: 28px; bottom: 28px; width: 380px; height: 560px;
      max-height: calc(100vh - 56px); background: #202124; color: #e8eaed;
      border: 1px solid #3c4043; border-radius: 16px; overflow: hidden;
      box-shadow: 0 16px 48px rgba(0,0,0,.55); display: none; flex-direction: column;
    }
    .panel.open { display: flex; }
    .hidden { display: none !important; }

    .head { display:flex; align-items:center; gap:10px; padding:12px 14px;
      background:#17181b; border-bottom:1px solid #3c4043; }
    .head img { width:26px; height:26px; border-radius:6px; }
    .head .title { font-weight:600; font-size:14px; flex:1; }
    .head .state { font-size:11px; padding:3px 8px; border-radius:10px; background:#2a2b2f; color:#9aa0a6; }
    .head .state.working { color:#f59e0b; } .head .state.success { color:#22c55e; } .head .state.error { color:#ef4444; }
    .head button { background:none; border:none; color:#9aa0a6; cursor:pointer; font-size:16px; padding:4px 6px; border-radius:6px; }
    .head button:hover { background:#2a2b2f; color:#e8eaed; }

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
      <button class="min" title="Collapse">—</button>
    </div>
    <div class="tasks hidden"><div class="lbl">Tasks</div><div class="tasklist"></div></div>
    <div class="log"></div>
    <div class="foot">
      <textarea class="input" placeholder="Ask Bartok to clean things up…"></textarea>
      <button class="send">Send</button>
      <button class="stop hidden">Stop</button>
    </div>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const fab = $('.fab'), dot = $('.dot'), panel = $('.panel');
  const stateEl = $('.state'), logEl = $('.log'), tasksBox = $('.tasks'), taskList = $('.tasklist');
  const input = $('.input'), sendBtn = $('.send'), stopBtn = $('.stop'), minBtn = $('.min');

  let running = false;

  function setState(s) { // idle | working | success | error
    dot.className = 'dot ' + s;
    stateEl.className = 'state ' + (s === 'idle' ? '' : s);
    stateEl.textContent = s;
    running = (s === 'working');
    stopBtn.classList.toggle('hidden', !running);
    sendBtn.classList.toggle('hidden', running);
  }

  function addMsg(cls, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
    return d;
  }

  const TASK_IC = { completed: '✓', in_progress: '⟳', pending: '○', stopped: '■' };
  function renderTasks(todos) {
    if (!todos || !todos.length) { tasksBox.classList.add('hidden'); return; }
    tasksBox.classList.remove('hidden');
    taskList.innerHTML = '';
    for (const t of todos) {
      const st = t.status || 'pending';
      const row = document.createElement('div');
      row.className = 'task ' + st;
      const box = st === 'completed' ? '<span class="box">✓</span>' : '<span class="box"></span>';
      row.innerHTML = box + '<span class="ic">' + (TASK_IC[st] || '○') + '</span>'
        + '<span class="txt"></span>';
      row.querySelector('.txt').textContent = t.content || t.activeForm || '';
      taskList.appendChild(row);
    }
  }
  let lastTodos = [];

  function handleEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'system') { setState('working'); return; }
    if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
      for (const b of ev.message.content) {
        if (b.type === 'text' && b.text && b.text.trim()) addMsg('assistant', b.text.trim());
        else if (b.type === 'tool_use') {
          if (b.name === 'TodoWrite' && b.input && b.input.todos) {
            lastTodos = b.input.todos; renderTasks(lastTodos);
          } else {
            addMsg('tool', 'using ' + (b.name || 'tool') + '…');
          }
        }
      }
      return;
    }
    if (ev.type === 'result') {
      const bad = ev.is_error || (ev.subtype && ev.subtype !== 'success');
      setState(bad ? 'error' : 'success');
      if (bad && ev.subtype) addMsg('err', 'Stopped: ' + ev.subtype);
      return;
    }
    if (ev.type === 'bridge-error') {
      addMsg('err', ev.error || 'Bridge error'); markStopped(); setState('error'); return;
    }
    if (ev.type === 'turn-closed') {
      if (running) { // closed without a clean result
        if (ev.code) { addMsg('err', 'Claude exited (code ' + ev.code + ')' + (ev.stderr ? ': ' + ev.stderr : '')); markStopped(); setState('error'); }
        else setState('success');
      }
    }
  }

  function markStopped() { // any unfinished task becomes a red stopped marker
    let changed = false;
    lastTodos = lastTodos.map((t) => {
      if (t.status === 'in_progress' || t.status === 'pending') { changed = true; return { ...t, status: 'stopped' }; }
      return t;
    });
    if (changed) renderTasks(lastTodos);
  }

  window.gmailClaude.onEvent(handleEvent);

  function submit() {
    const text = input.value.trim();
    if (!text || running) return;
    addMsg('user', text);
    input.value = '';
    lastTodos = []; renderTasks([]);
    setState('working');
    window.gmailClaude.send(text);
  }

  sendBtn.addEventListener('click', submit);
  stopBtn.addEventListener('click', () => { window.gmailClaude.stop(); addMsg('tool', 'stop requested…'); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => {
    input.style.height = '38px'; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });

  function open() { panel.classList.add('open'); fab.classList.add('hidden'); input.focus(); }
  function close() { panel.classList.remove('open'); fab.classList.remove('hidden'); }
  fab.addEventListener('click', open);
  minBtn.addEventListener('click', close);
})();
