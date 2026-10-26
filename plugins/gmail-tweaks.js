/*
 * gmail-tweaks  —  runs in the Gmail page's MAIN world (injected by preload via
 * webFrame.executeJavaScript, so it bypasses Gmail's CSP).
 *
 * UI chrome tweaks (1-7) + message grouping by Sender / Label / Label->Sender (8-10).
 * Everything is wrapped in try/catch and anchored on stable attributes
 * (aria-label / role / href / img src) rather than Gmail's obfuscated classes,
 * so a Gmail update degrades gracefully instead of white-screening the app.
 */
(function () {
  'use strict';
  if (window.__gmTweaks) return;
  window.__gmTweaks = true;

  var LS = {
    rail: 'gmTweaks.railHidden',   // '1' = hide the Mail/Chat/Meet rail (default)
    group: 'gmTweaks.groupMode',   // none|sender|label|label-sender
    collapsed: 'gmTweaks.collapsed'
  };
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------------------------------------------------------------- CSS --- */
  function injectCSS() {
    if (document.getElementById('gm-tweaks-css')) return;
    var css = [
      /* 2 Support, 3 Studio, 4 Gemini icon, 6 keyboard/input-tools dropdown */
      'a[role=button][aria-label="Support"],',
      '[role=button][aria-label="Studio"],',
      'header button[aria-label="Ask Gemini"],',
      '[aria-label="Gemini"],',
      'header [jslog^="194062"],',          /* Gemini side-panel sparkle (no aria-label) */
      '[aria-label^="Input tools"],',
      '[aria-label^="Select input tool"]{display:none !important;}',
      /* 1 far-left Mail/Chat/Meet rail (toggled) */
      'body.gm-rail-hidden .gm-rail{display:none !important;}',
      /* 5/7 flagged by JS */
      '.gm-hide{display:none !important;}',
      /* rail toggle button */
      '#gm-rail-toggle{position:fixed;left:8px;bottom:8px;z-index:9999;width:28px;height:28px;border-radius:8px;',
      'border:1px solid rgba(255,255,255,.18);background:rgba(60,64,67,.9);color:#e8eaed;font:14px/26px sans-serif;',
      'text-align:center;cursor:pointer;opacity:.5;transition:opacity .15s;}',
      '#gm-rail-toggle:hover{opacity:1;}',
      /* grouping control — sits inline in the toolbar row that has pagination */
      '#gm-group-bar{display:inline-flex;gap:6px;align-items:center;margin:0 12px;font:12px/18px "Google Sans",sans-serif;vertical-align:middle;}',
      '#gm-group-bar .gm-lbl{opacity:.7;margin-right:2px;}',
      '#gm-group-bar button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:inherit;',
      'border-radius:14px;padding:3px 12px;cursor:pointer;font:inherit;}',
      '#gm-group-bar button.gm-active{background:#8ab4f8;color:#202124;border-color:#8ab4f8;font-weight:600;}',
      /* group header rows */
      'tr.gm-grp{cursor:pointer;}',
      'tr.gm-grp>td{padding:6px 10px !important;font:600 12px/18px "Google Sans",sans-serif;',
      'background:rgba(255,255,255,.05);border-top:1px solid rgba(255,255,255,.08);user-select:none;}',
      'tr.gm-grp.gm-sub>td{padding-left:34px !important;font-weight:500;opacity:.9;background:rgba(255,255,255,.03);}',
      'tr.gm-grp .gm-caret{display:inline-block;width:14px;}',
      'tr.gm-grp .gm-count{opacity:.55;font-weight:400;margin-left:6px;}',
      'tr.gm-collapsed-row{display:none !important;}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'gm-tweaks-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ----------------------------------------------- JS-driven chrome hides --- */
  function applyChrome() {
    try {
      // 7 Upgrade button (no stable aria-label -> match by text in the header)
      var header = document.querySelector('header') || document.querySelector('div[role=banner]') || document;
      [].slice.call(header.querySelectorAll('button,[role=button],[role=link],a')).forEach(function (el) {
        var t = (el.getAttribute('aria-label') || el.innerText || '').trim();
        if (t === 'Upgrade') el.classList.add('gm-hide');
      });
      // 5 "Google" wordmark logo beside the profile photo (KEEP the photo).
      // The logo and the photo live in the same role=button chip, so hide only
      // the largest logo-wrapper that does NOT also contain the account link.
      var logo = document.querySelector("img[src*='/ac/images/logo']");
      var prof = header.querySelector('a[aria-label^="Google Account"]');
      if (logo) {
        var wrap = logo, up = logo.parentElement;
        while (up && prof && !up.contains(prof)) { wrap = up; up = up.parentElement; }
        wrap.classList.add('gm-hide');
      }
      // 4 Gemini sparkle fallback: match its jslog feature id (no aria-label on it)
      [].slice.call(header.querySelectorAll('div[jslog]')).forEach(function (el) {
        var j = el.getAttribute('jslog') || '';
        if (/^194062/.test(j)) el.classList.add('gm-hide');
      });
    } catch (e) {}
    applyRail();
  }

  // 1 far-left Mail/Chat/Meet rail
  function railEl() {
    var mail = document.querySelector('div[role=link][aria-label^="Mail,"]');
    return mail ? mail.closest('[role=navigation]') : null;
  }
  function applyRail() {
    try {
      var r = railEl();
      if (r) r.classList.add('gm-rail');
      document.body.classList.toggle('gm-rail-hidden', get(LS.rail, '1') === '1');
    } catch (e) {}
  }
  function toggleRail() { set(LS.rail, get(LS.rail, '1') === '1' ? '0' : '1'); applyRail(); }

  function addRailToggle() {
    if (document.getElementById('gm-rail-toggle')) return;
    var b = document.createElement('div');
    b.id = 'gm-rail-toggle';
    b.textContent = '☰'; // ☰
    b.title = 'Toggle Mail/Chat/Meet rail';
    b.addEventListener('click', toggleRail);
    document.body.appendChild(b);
    // keyboard shortcut: Ctrl/Cmd+Shift+L
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); toggleRail(); }
    });
  }

  /* ----------------------------------------------------------- grouping --- */
  var MODE = get(LS.group, 'none');
  var collapsed = (function () { try { return new Set(JSON.parse(get(LS.collapsed, '[]'))); } catch (e) { return new Set(); } })();
  function saveCollapsed() { set(LS.collapsed, JSON.stringify([].concat(Array.from(collapsed)))); }
  var applying = false;

  function listTable() {
    // the visible message-list grid
    var t = document.querySelector('div[role=main] table.zt') || document.querySelector('div[role=main] table[role=grid]') || document.querySelector('div[role=main] table.F');
    return t;
  }
  function rowSender(r) {
    var s = r.querySelector('span.yP[email], span[email]');
    if (s) return { key: (s.getAttribute('email') || s.getAttribute('name') || s.innerText || '?').toLowerCase(), label: (s.getAttribute('name') || s.innerText || s.getAttribute('email') || '?').trim() };
    return { key: '?', label: '(unknown sender)' };
  }
  function rowLabels(r) {
    var ls = [].slice.call(r.querySelectorAll('.av')).map(function (e) { return (e.innerText || '').trim(); }).filter(Boolean);
    return ls.length ? ls : null;
  }

  function clearGroups(tbody) {
    [].slice.call(tbody.querySelectorAll('tr.gm-grp')).forEach(function (h) { h.remove(); });
    [].slice.call(tbody.querySelectorAll('tr.zA')).forEach(function (r) { r.classList.remove('gm-collapsed-row'); });
  }

  function makeHeader(text, count, key, sub) {
    var tr = document.createElement('tr');
    tr.className = 'gm-grp' + (sub ? ' gm-sub' : '');
    tr.dataset.gkey = key;
    var td = document.createElement('td');
    td.colSpan = 100;
    var isOpen = !collapsed.has(key);
    td.innerHTML = '<span class="gm-caret">' + (isOpen ? '▾' : '▸') + '</span>' +
      '<span class="gm-name"></span><span class="gm-count">' + count + '</span>';
    td.querySelector('.gm-name').textContent = text;
    tr.appendChild(td);
    tr.addEventListener('click', function () {
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
      saveCollapsed(); applyGrouping();
    });
    return tr;
  }

  function applyGrouping() {
    if (applying) return;
    var table = listTable();
    if (!table) return;
    var tbody = table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) return;
    applying = true;
    try {
      clearGroups(tbody);
      var rows = [].slice.call(tbody.querySelectorAll('tr.zA'));
      if (MODE === 'none' || !rows.length) { return; }

      // Build an ordered grouping structure.
      var order = [];           // [{key,label,rows:[],subs:Map?}]
      var index = {};
      function bucket(k, lbl) { if (!index[k]) { index[k] = { key: k, label: lbl, rows: [], subs: {}, subOrder: [] }; order.push(index[k]); } return index[k]; }

      rows.forEach(function (r) {
        if (MODE === 'sender') {
          var s = rowSender(r); bucket('s:' + s.key, s.label).rows.push(r);
        } else if (MODE === 'label') {
          var L = rowLabels(r); var name = L ? L[0] : '(no label)';
          bucket('l:' + name, name).rows.push(r);
        } else if (MODE === 'label-sender') {
          var L2 = rowLabels(r); var lname = L2 ? L2[0] : '(no label)';
          var b = bucket('l:' + lname, lname);
          var s2 = rowSender(r); var sk = 'l:' + lname + '|s:' + s2.key;
          if (!b.subs[sk]) { b.subs[sk] = { key: sk, label: s2.label, rows: [] }; b.subOrder.push(b.subs[sk]); }
          b.subs[sk].rows.push(r);
        }
      });

      // Re-emit rows under headers, in order.
      var frag = document.createDocumentFragment();
      order.forEach(function (g) {
        var total = g.rows.length || g.subOrder.reduce(function (a, s) { return a + s.rows.length; }, 0);
        var gHidden = collapsed.has(g.key);
        frag.appendChild(makeHeader(g.label, total, g.key, false));
        if (MODE === 'label-sender') {
          g.subOrder.forEach(function (s) {
            var subHidden = gHidden || collapsed.has(s.key);
            var h = makeHeader(s.label, s.rows.length, s.key, true);
            if (gHidden) h.classList.add('gm-collapsed-row');
            frag.appendChild(h);
            s.rows.forEach(function (r) { if (subHidden) r.classList.add('gm-collapsed-row'); frag.appendChild(r); });
          });
        } else {
          g.rows.forEach(function (r) { if (gHidden) r.classList.add('gm-collapsed-row'); frag.appendChild(r); });
        }
      });
      tbody.appendChild(frag);
    } catch (e) { /* leave list untouched on error */ }
    finally { applying = false; }
  }

  function setMode(m) {
    MODE = m; set(LS.group, m);
    [].slice.call(document.querySelectorAll('#gm-group-bar button')).forEach(function (b) {
      b.classList.toggle('gm-active', b.dataset.mode === m);
    });
    // undo grouping cleanly when switching to none
    var t = listTable(); if (t && t.tBodies[0] && m === 'none') clearGroups(t.tBodies[0]);
    applyGrouping();
  }

  // The pagination cluster ("1–71 of 71" + Older/Newer) lives in the top
  // toolbar; return it so we can drop the group bar into that same row.
  function pagerCluster() {
    var btn = document.querySelector('div[role=main] [aria-label="Older"],'
      + ' div[role=main] [aria-label="Newer"], [aria-label="Older"], [aria-label="Newer"]');
    if (!btn) return null;
    // The toolbar ([gh="tm"]) lays its children out horizontally, but the
    // pagination lives in a vertically-stacked sub-wrapper. Climb to the
    // pagination's top-level block *within* the toolbar and insert BEFORE that,
    // so the group bar sits beside the pagination on the toolbar row instead of
    // pushing "N of M" onto a second line.
    var tb = btn.closest('[gh="tm"]') || btn.closest('[role=toolbar]');
    var cluster = btn.parentElement;
    if (tb) {
      while (cluster && cluster.parentElement && cluster.parentElement !== tb) {
        cluster = cluster.parentElement;
      }
    }
    return (cluster && cluster.parentElement) ? cluster : btn.parentElement;
  }

  function addGroupBar() {
    if (document.getElementById('gm-group-bar')) return;
    var cluster = pagerCluster();
    if (!cluster || !cluster.parentElement) return; // toolbar not ready yet
    var bar = document.createElement('div');
    bar.id = 'gm-group-bar';
    bar.innerHTML = '<span class="gm-lbl">Group:</span>';
    [['none', 'None'], ['sender', 'Sender'], ['label', 'Label'], ['label-sender', 'Label → Sender']].forEach(function (p) {
      var b = document.createElement('button');
      b.dataset.mode = p[0]; b.textContent = p[1];
      if (p[0] === MODE) b.classList.add('gm-active');
      b.addEventListener('click', function () { setMode(p[0]); });
      bar.appendChild(b);
    });
    // drop it into the toolbar row, just before the pagination cluster
    cluster.parentElement.insertBefore(bar, cluster);
  }

  /* ---------------------------------------------------- observe & apply --- */
  var t;
  function tick() {
    injectCSS();
    applyChrome();
    addRailToggle();
    addGroupBar();
    if (MODE !== 'none') applyGrouping();
  }
  function schedule() { clearTimeout(t); t = setTimeout(tick, 250); }

  injectCSS();
  tick();
  try {
    var mo = new MutationObserver(function () { if (!applying) schedule(); });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  // belt-and-suspenders: re-apply chrome hides periodically (header re-renders)
  setInterval(function () { try { injectCSS(); applyChrome(); addRailToggle(); addGroupBar(); } catch (e) {} }, 3000);
})();
