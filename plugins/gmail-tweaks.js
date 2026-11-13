/*
 * gmail-tweaks  —  runs in the Gmail page's MAIN world (injected by preload via
 * webFrame.executeJavaScript, so it bypasses Gmail's CSP).
 *
 * UI chrome tweaks (1-7) + message grouping by Sender / Label / Label->Sender (8-10)
 * + a List / Cards view toggle (cards = one stack of message cards per group).
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
    collapsed: 'gmTweaks.collapsed',
    view: 'gmTweaks.viewMode',     // list|cards
    gap: 'gmTweaks.cardGap',       // px spacing between card groups
    stack: 'gmTweaks.stackStyle'   // even|tilted
  };
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // DOM builder (no innerHTML: Gmail enforces Trusted Types when its CSP is active)
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

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
      'tr.gm-collapsed-row{display:none !important;}',
      /* view toggle */
      '#gm-group-bar .gm-sep{width:1px;height:16px;background:rgba(255,255,255,.18);margin:0 6px;}',
      /* card view: stacks of message cards replace the list table */
      /* (an overlay on top of the list — Gmail's own list DOM is left untouched, it hangs if altered) */
      '#gm-cards{display:none;position:fixed;z-index:3;overflow-y:auto;overflow-x:hidden;background:#202124;}',
      '#gm-cards.gm-light{background:#fff;}',
      'body.gm-cards-on #gm-cards.gm-show{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--gm-gap,8px) calc(var(--gm-gap,8px) * 0.8);',
      'align-items:start;align-content:start;padding:33px 24px 48px;box-sizing:border-box;font-family:"Google Sans",Roboto,sans-serif;}',
      '#gm-cards{color:#e8eaed;}',
      '#gm-cards.gm-light{color:#202124;}',
      '#gm-cards.gm-light .gm-card{background:#fff;color:#202124;}',
      '#gm-cards.gm-light .gm-stack-h .gm-count,#gm-cards.gm-light .gm-c-labels span{background:rgba(0,0,0,.08);}',
      '#gm-cards.gm-light .gm-opts button{background:rgba(0,0,0,.05);border-color:rgba(0,0,0,.14);}',
      '#gm-cards .gm-opts{grid-column:1/-1;display:flex;justify-content:flex-end;align-items:center;gap:6px;',
      'font:12px/18px "Google Sans",sans-serif;margin-bottom:-14px;}',
      '#gm-cards .gm-opts .gm-lbl{opacity:.7;}',
      '#gm-cards .gm-opts button{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:inherit;',
      'border-radius:14px;padding:3px 12px;cursor:pointer;font:inherit;}',
      '#gm-cards .gm-opts button.gm-active{background:#8ab4f8;color:#202124;border-color:#8ab4f8;font-weight:600;}',
      '#gm-cards .gm-opts input[type=range]{width:96px;accent-color:#8ab4f8;cursor:pointer;margin:0 2px;}',
      '#gm-cards .gm-opts .gm-sep2{width:1px;height:16px;background:rgba(255,255,255,.18);margin:0 8px;}',
      '#gm-cards .gm-sec{grid-column:1/-1;font:600 13px/20px "Google Sans",sans-serif;opacity:.85;',
      'padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.1);}',
      '#gm-cards .gm-stack-h{display:flex;align-items:center;gap:8px;height:24px;margin-bottom:4px;',
      'font:600 12px/18px "Google Sans",sans-serif;cursor:pointer;user-select:none;}',
      '#gm-cards .gm-stack-h .gm-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#gm-cards .gm-stack-h .gm-count{flex:none;opacity:.8;font-weight:500;background:rgba(255,255,255,.1);border-radius:10px;padding:0 8px;}',
      '#gm-cards .gm-stack-h .gm-next{flex:none;margin-left:auto;opacity:.6;font-weight:500;padding:0 6px;border-radius:10px;}',
      '#gm-cards .gm-stack-h .gm-next:hover{opacity:1;background:rgba(255,255,255,.1);}',
      '#gm-cards .gm-stack-b{position:relative;height:116px;}',
      /* hover focus: the hovered stack spreads out, everything else dims */
      '#gm-cards .gm-stack{position:relative;transition:opacity .22s;}',
      '#gm-cards .gm-sec,#gm-cards .gm-opts{transition:opacity .22s;}',
      '#gm-cards.gm-dim .gm-stack:not(.gm-focus),#gm-cards.gm-dim .gm-sec,#gm-cards.gm-dim .gm-opts{opacity:.14;}',
      '#gm-cards .gm-stack.gm-focus{z-index:30;}',
      '#gm-cards .gm-pad{position:absolute;display:none;z-index:50;}',
      '#gm-cards .gm-stack.gm-focus .gm-card{box-shadow:0 4px 10px rgba(0,0,0,.22),0 18px 40px rgba(0,0,0,.32);}',
      /* compact at rest (sender + 2 lines of subject); the hovered stack's cards grow to full size */
      '#gm-cards .gm-card{position:absolute;left:0;right:0;top:24px;height:92px;box-sizing:border-box;padding:10px 12px;display:flex;flex-direction:column;',
      'border-radius:18px;background:#2b2c30;color:#e8eaed;border:5px solid #fff;',
      'box-shadow:0 2px 6px rgba(0,0,0,.14),0 10px 24px rgba(0,0,0,.18);transform-origin:top center;cursor:pointer;overflow:hidden;',
      'transition:transform .38s cubic-bezier(.2,.8,.2,1),height .28s cubic-bezier(.2,.8,.2,1),opacity .38s,box-shadow .2s;}',
      '#gm-cards .gm-stack.gm-focus .gm-card{height:auto;min-height:92px;padding-bottom:12px;}',
      '#gm-cards .gm-card:hover{box-shadow:0 3px 8px rgba(0,0,0,.18),0 14px 30px rgba(0,0,0,.24);}',
      'body.gm-stack-tilted #gm-cards .gm-card{transform-origin:center center;}',
      'body.gm-cards-on.gm-stack-tilted #gm-cards.gm-show{gap:calc(var(--gm-gap,8px) + 8px) calc(var(--gm-gap,8px) + 4px);}',
      '#gm-cards .gm-stack.gm-open .gm-stack-b{height:auto;display:flex;flex-direction:column;gap:10px;}',
      '#gm-cards .gm-stack.gm-open .gm-card{position:relative;transform:none !important;opacity:1 !important;pointer-events:auto !important;}',
      '#gm-cards .gm-stack.gm-open .gm-next{display:none;}',
      '#gm-cards .gm-c-top{flex:none;display:flex;justify-content:space-between;align-items:center;gap:10px;font:12px/18px Roboto,sans-serif;white-space:nowrap;}',
      '#gm-cards .gm-c-from,#gm-cards .gm-c-date{opacity:.75;}',
      '#gm-cards .gm-c-who{display:flex;align-items:center;min-width:0;}',
      '#gm-cards .gm-c-from{overflow:hidden;text-overflow:ellipsis;}',
      /* count badge, left of the sender, on the top card of a stack */
      '#gm-cards .gm-badge{display:none;flex:none;min-width:8px;height:18px;padding:0 5px;margin-right:7px;border-radius:9px;',
      'background:#8ab4f8;color:#202124;font:700 11px/18px "Google Sans",sans-serif;text-align:center;opacity:1;}',
      '#gm-cards .gm-card.gm-top .gm-badge{display:inline-block;}',
      /* full subject: wraps instead of being cut to one line (up to 4 lines) */
      '#gm-cards .gm-c-sub{flex:none;font:500 14px/20px "Google Sans",sans-serif;margin-top:6px;white-space:normal;overflow-wrap:anywhere;',
      'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
      '#gm-cards .gm-stack.gm-focus .gm-c-sub{-webkit-line-clamp:4;}',
      /* excerpt + labels only on the hovered stack */
      '#gm-cards .gm-c-snip{display:none;flex:none;font:12px/17px Roboto,sans-serif;opacity:.66;margin-top:6px;overflow:hidden;overflow-wrap:anywhere;',
      '-webkit-line-clamp:3;-webkit-box-orient:vertical;}',
      '#gm-cards .gm-stack.gm-focus .gm-c-snip{display:-webkit-box;}',
      '#gm-cards .gm-c-labels{display:none;flex:none;order:3;gap:4px;overflow:hidden;white-space:nowrap;margin-top:6px;}',
      '#gm-cards .gm-stack.gm-focus .gm-c-labels{display:flex;}',
      '#gm-cards .gm-stack.gm-focus .gm-c-labels:empty{display:none;}',
      '#gm-cards .gm-c-labels span{font:10px/15px Roboto,sans-serif;padding:0 6px;border-radius:4px;background:rgba(255,255,255,.12);}',
      /* per-card Archive / Delete, shown while the pointer is on the card */
      '#gm-cards .gm-acts{display:none;justify-content:flex-end;gap:6px;margin-top:10px;visibility:hidden;}',
      '#gm-cards .gm-stack.gm-focus .gm-card .gm-acts{display:flex;}',
      '#gm-cards .gm-stack.gm-focus .gm-card:hover .gm-acts{visibility:visible;}',
      '#gm-cards .gm-acts button{width:30px;height:30px;padding:0;border:0;border-radius:50%;cursor:pointer;display:flex;',
      'align-items:center;justify-content:center;background:rgba(255,255,255,.14);color:inherit;transition:background .15s;}',
      '#gm-cards.gm-light .gm-acts button{background:rgba(0,0,0,.08);}',
      '#gm-cards .gm-acts button:hover{background:#8ab4f8;color:#202124;}',
      '#gm-cards .gm-acts button.gm-del:hover{background:#f28b82;color:#202124;}',
      '#gm-cards .gm-card.gm-going{opacity:.25 !important;pointer-events:none !important;}',
      '#gm-cards .gm-unread .gm-c-sub{font-weight:700;}',
      '#gm-cards .gm-unread .gm-c-top{font-weight:600;}',
      '#gm-cards .gm-unread .gm-c-from,#gm-cards .gm-unread .gm-c-date{opacity:1;}',
      '#gm-cards .gm-unread .gm-c-from:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#8ab4f8;margin-right:6px;}'
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
  var NOREPLY = /(^|[^a-z])(no|do[-_. ]?not)[-_. ]?reply/i;
  // "noreply@mail.github.com" -> "Github" (the brand = registrable domain's main label)
  function brandFromEmail(email) {
    var host = String(email || '').split('@')[1];
    if (!host) return '';
    var p = host.toLowerCase().split('.');
    var i = p.length - 2;
    if (p.length > 2 && p[p.length - 1].length === 2 && /^(co|com|org|net|gov|ac|edu)$/.test(p[i])) i--;
    var b = p[Math.max(i, 0)] || '';
    return b.charAt(0).toUpperCase() + b.slice(1);
  }
  // What Gmail's list row tells us about a sender. Gmail cuts long names to 19 chars + "."
  // and shows only the first name on multi-person threads, and Google Groups rewrites
  // the sender as "'Real Name' via Group Name" from the group's own address.
  function senderIdentity(name, email) {
    var n = String(name || '').replace(/\s+/g, ' ').trim();
    var trunc = n.length >= 20 && /\.$/.test(n);
    if (trunc) n = n.slice(0, -1).trim();
    var relayed = false;
    if (n.charAt(0) === "'") {
      relayed = true;
      n = n.slice(1);
      var q = n.indexOf("'");
      if (q > -1) { n = n.slice(0, q); trunc = false; }
    } else {
      var via = n.match(/^(.+?):?\s+via\s+.+$/i);
      if (via) { n = via[1]; trunc = false; }
    }
    n = n.replace(/^['"]+|['"]+$/g, '').trim();
    // No real name (Gmail shows the local part) or a no-reply name -> show the brand instead.
    var brand = false;
    if (!n || n.indexOf('@') > -1 || NOREPLY.test(n)) {
      var bn = brandFromEmail(email);
      if (bn) { n = bn; brand = true; trunc = false; }
      else n = n || email || '?';
    }
    return { key: n.toLowerCase(), label: n + (trunc ? '…' : ''), name: n, trunc: trunc, relayed: relayed, brand: brand, email: String(email || '').toLowerCase() };
  }
  function isPrefixName(a, b) {   // is a's name a shortened form of b's?
    if (a.key.length >= b.key.length || b.key.indexOf(a.key) !== 0) return false;
    return a.trunc || /[^a-z0-9]/.test(b.key.charAt(a.key.length));
  }
  function sameSender(a, b) {
    if (a.key === b.key) return true;
    var sameEmail = a.email && a.email === b.email;
    if ((a.brand || b.brand) && sameEmail) return true;
    if ((sameEmail || a.relayed || b.relayed) && (isPrefixName(a, b) || isPrefixName(b, a))) return true;
    return false;
  }
  // Resolve every row on the page to one sender, merging the different ways Gmail
  // spells the same sender (short name, cut-off name, group relay, no-reply address).
  var senderMap = null;
  function rawSender(r) {
    var s = r.querySelector('span.yP[email], span[email]');
    return s ? senderIdentity(s.getAttribute('name') || s.innerText, s.getAttribute('email')) : null;
  }
  function resolveSenders(rows) {
    var map = new WeakMap(), ids = [], seen = {}, parent = [];
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    var rowIdx = rows.map(function (r) {
      var d = rawSender(r);
      if (!d) return -1;
      var k = d.key + '|' + d.email + '|' + d.relayed + '|' + d.trunc;
      if (seen[k] === undefined) { seen[k] = ids.length; parent.push(ids.length); ids.push(d); }
      return seen[k];
    });
    for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) {
      if (sameSender(ids[i], ids[j])) parent[find(j)] = find(i);
    }
    function score(d) { return (d.brand ? 0 : d.trunc ? 1000 : 2000) + d.name.length; }
    var best = {};
    ids.forEach(function (d, i) { var g = find(i); if (!best[g] || score(d) > score(best[g])) best[g] = d; });
    rows.forEach(function (r, n) {
      if (rowIdx[n] < 0) return;
      var d = best[find(rowIdx[n])];
      map.set(r, { key: d.label.toLowerCase(), label: d.label });
    });
    senderMap = map;
  }
  function rowSender(r) {
    var hit = senderMap && senderMap.get(r);
    if (hit) return hit;
    var d = rawSender(r);
    return d ? { key: d.key, label: d.label } : { key: '?', label: '(unknown sender)' };
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
    td.appendChild(mk('span', 'gm-caret', isOpen ? '▾' : '▸'));
    td.appendChild(mk('span', 'gm-name', text));
    td.appendChild(mk('span', 'gm-count', String(count)));
    tr.appendChild(td);
    tr.addEventListener('click', function () {
      if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
      saveCollapsed(); applyGrouping();
    });
    return tr;
  }

  // Ordered grouping structure for the current MODE: [{key,label,rows:[],subOrder:[{key,label,rows}]}]
  function buildGroups(rows) {
    var order = [];
    var index = {};
    resolveSenders(rows);
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
    return order;
  }

  function applyGrouping() {
    if (applying) return;
    var table = listTable();
    if (!table) return;
    var tbody = table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) return;
    applying = true;
    try {
      var rows = [].slice.call(tbody.querySelectorAll('tr.zA'));
      if (MODE === 'none' || !rows.length) { clearGroups(tbody); return; }

      // The layout we want: headers + rows, in order.
      var want = [];
      function head(label, count, key, sub, hidden) {
        want.push({ h: true, key: key, label: label, count: count, sub: sub, hidden: hidden,
          sig: [key, label, count, sub, hidden, collapsed.has(key)].join('\u0001') });
      }
      buildGroups(rows).forEach(function (g) {
        var total = g.rows.length || g.subOrder.reduce(function (a, s) { return a + s.rows.length; }, 0);
        var gHidden = collapsed.has(g.key);
        head(g.label, total, g.key, false, false);
        if (MODE === 'label-sender') {
          g.subOrder.forEach(function (s) {
            var subHidden = gHidden || collapsed.has(s.key);
            head(s.label, s.rows.length, s.key, true, gHidden);
            s.rows.forEach(function (r) { want.push({ row: r, hidden: subHidden }); });
          });
        } else {
          g.rows.forEach(function (r) { want.push({ row: r, hidden: gHidden }); });
        }
      });

      // Already laid out that way? Then touch nothing. This makes re-applying free, so it
      // can run the instant Gmail redraws the list (no flash of missing group headers).
      var kids = tbody.children, same = kids.length === want.length;
      for (var i = 0; same && i < want.length; i++) {
        var w = want[i], k = kids[i];
        same = w.h ? (k._gmSig === w.sig) : (k === w.row && k.classList.contains('gm-collapsed-row') === w.hidden);
      }
      if (same) return;

      clearGroups(tbody);
      var frag = document.createDocumentFragment();
      want.forEach(function (w) {
        if (w.h) {
          var h = makeHeader(w.label, w.count, w.key, w.sub);
          h._gmSig = w.sig;
          if (w.hidden) h.classList.add('gm-collapsed-row');
          frag.appendChild(h);
        } else {
          if (w.hidden) w.row.classList.add('gm-collapsed-row');
          frag.appendChild(w.row);
        }
      });
      tbody.appendChild(frag);
    } catch (e) { /* leave list untouched on error */ }
    finally { applying = false; }
  }

  function setMode(m) {
    MODE = m; set(LS.group, m);
    [].slice.call(document.querySelectorAll('#gm-group-bar button[data-mode]')).forEach(function (b) {
      b.classList.toggle('gm-active', b.dataset.mode === m);
    });
    // undo grouping cleanly when switching to none
    var t = listTable(); if (t && t.tBodies[0] && m === 'none') clearGroups(t.tBodies[0]);
    if (VIEW === 'cards') renderCards(); else applyGrouping();
  }

  /* ---------------------------------------------------------- card view --- */
  // Each group becomes a stack of cards (top card in front, the next two peeking
  // behind it). Click the top card to open the message, a card behind it (or
  // "next") to bring another forward, and the stack's title to fan it out.
  var VIEW = get(LS.view, 'list');
  var GAP_MIN = 4, GAP_MAX = 40;
  var GAP = Math.max(GAP_MIN, Math.min(GAP_MAX, parseInt(get(LS.gap, String(GAP_MIN)), 10) || GAP_MIN));
  function applyGap() { var b = document.getElementById('gm-cards'); if (b) b.style.setProperty('--gm-gap', GAP + 'px'); }
  var stackOff = {};            // group key -> index of the card currently on top
  var stackOpen = new Set();    // group keys that are fanned out
  var cardSig = '';
  var STACK = get(LS.stack, 'even');   // even = straight offset stack, tilted = fanned / rotated
  var TILT = [0, -5, 4.5, -8];

  function txt(el) { return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
  function rowData(r) {
    return {
      from: rowSender(r).label,
      subject: txt(r.querySelector('.bog')) || '(no subject)',
      snippet: txt(r.querySelector('.y2')).replace(/^[-\u2013\u2014]\s*/, ''),
      date: txt(r.querySelector('td.xW span[title]') || r.querySelector('td.xW')),
      unread: r.classList.contains('zE'),
      labels: rowLabels(r) || []
    };
  }
  function openRow(r) {
    try {
      var el = r.querySelector('[data-legacy-thread-id]');
      var id = el && el.getAttribute('data-legacy-thread-id');
      if (id) {
        var base = (location.hash || '#inbox').replace(/\?.*$/, '').replace(/\/p\d+$/, '');
        location.hash = base + '/' + id;
        return;
      }
      ['mousedown', 'mouseup', 'click'].forEach(function (t) {
        r.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
    } catch (e) {}
  }
  // Hover focus: one stack at a time is spread out with the rest of the canvas dimmed.
  var focusSt = null, focusT = null;
  function setFocus(st) {
    clearTimeout(focusT);
    if (focusSt === st) return;
    var old = focusSt, box = document.getElementById('gm-cards');
    focusSt = st;
    if (old) { old.classList.remove('gm-focus'); if (old.isConnected) layoutStack(old); }
    if (box) box.classList.toggle('gm-dim', !!st);
    if (st) { st.classList.add('gm-focus'); layoutStack(st); st._cards.forEach(loadExcerpt); }
  }
  // Excerpt for a card: Gmail's own snippet when the list shows one, otherwise the opening
  // text of the latest message, read from Gmail's print view (fetched once, on first hover).
  var excerptCache = {};
  function htmlToText(h) {
    return h.replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/gi, '&')
      .replace(/[\u034f\u00ad\u200b-\u200f\u2060\ufeff\u2007\u00a0]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function fetchExcerpt(id) {
    if (!excerptCache[id]) {
      excerptCache[id] = fetch(location.pathname + '?ui=2&view=pt&search=all&th=' + encodeURIComponent(id), { credentials: 'include' })
        .then(function (r) { return r.ok ? r.text() : ''; })
        .then(function (t) {
          var i = t.lastIndexOf('class="message"');
          if (i < 0) return '';
          var m = t.slice(i), j = m.indexOf('cellpadding=12');
          var txt = htmlToText(j > -1 ? m.slice(m.indexOf('>', j) + 1) : m);
          // Gmail print-view placeholders for collapsed/quoted bodies are not an excerpt
          txt = txt.replace(/\[(?:Quoted text hidden|Message clipped|.*?View entire message.*?)\]/gi, ' ')
                   .replace(/\s+/g, ' ').trim();
          return txt.slice(0, 260);
        })
        .catch(function () { delete excerptCache[id]; return ''; });
    }
    return excerptCache[id];
  }
  function loadExcerpt(c) {
    if (c._excerpt || !c._row || !c._snipEl) return;
    c._excerpt = true;
    if (c._snipEl.textContent) return;
    var el = c._row.querySelector('[data-legacy-thread-id]');
    var id = el && el.getAttribute('data-legacy-thread-id');
    if (!id) return;
    fetchExcerpt(id).then(function (t) { if (t && c.isConnected) c._snipEl.textContent = t; });
  }
  function isSpread(st) { return focusSt === st && st._cards.length > 1 && !stackOpen.has(st._key); }
  // Archive / Delete act through Gmail's own per-row buttons (present in every list row).
  var ACTS = {
    Archive: { sel: 'li[data-tooltip="Archive"], li.brq', d: 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z' },
    Delete: { sel: 'li[data-tooltip="Delete"], li.bru', d: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z' }
  };
  function rowAction(r, name) {
    try {
      var el = r.querySelector(ACTS[name].sel);
      if (!el) return false;
      ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(function (t) {
        el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
      });
      return true;
    } catch (e) { return false; }
  }
  function actButton(name, r, card) {
    var b = mk('button', name === 'Delete' ? 'gm-del' : 'gm-arc');
    b.title = name; b.setAttribute('aria-label', name);
    var ns = 'http://www.w3.org/2000/svg', sv = document.createElementNS(ns, 'svg'), pa = document.createElementNS(ns, 'path');
    sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('width', '16'); sv.setAttribute('height', '16');
    pa.setAttribute('d', ACTS[name].d); pa.setAttribute('fill', 'currentColor');
    sv.appendChild(pa); b.appendChild(sv);
    b.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (!rowAction(r, name)) return;
      card.classList.add('gm-going');   // Gmail removes the row, which redraws the cards
      setTimeout(function () { if (card.isConnected) card.classList.remove('gm-going'); }, 2500);
    });
    return b;
  }
  function layoutStack(st) {
    var cards = st._cards, n = cards.length, off = (stackOff[st._key] || 0) % n;
    if (st._pad) st._pad.style.display = 'none';
    if (isSpread(st)) {
      // lay every card out in a grid centred on the stack (nudged only to stay on screen)
      var body = st.querySelector('.gm-stack-b'), box = document.getElementById('gm-cards');
      var sr = body.getBoundingClientRect(), br = box.getBoundingClientRect(), gap = 16;
      var w = sr.width;
      var baseL = sr.left, baseT = sr.top + 24;                   // where a resting card sits
      var boxR = br.left + box.clientWidth;                       // excludes the scrollbar
      var fit = Math.max(1, Math.floor((boxR - br.left - 32 + gap) / (w + gap)));
      var cols = Math.min(fit, n <= 3 ? n : n === 4 ? 2 : 3);
      var rowsN = Math.ceil(n / cols);
      function cardAt(p) { return cards[(p + off) % n]; }         // card shown at grid slot p
      var rowH = [];                                              // tallest card per row (heights vary)
      for (var r = 0; r < rowsN; r++) {
        var mh = 0;
        for (var cc = 0; cc < cols; cc++) { var pp = r * cols + cc; if (pp < n) { var hh = cardAt(pp).offsetHeight || 92; if (hh > mh) mh = hh; } }
        rowH.push(mh);
      }
      var rowY = [], acc = 0;
      for (var r2 = 0; r2 < rowsN; r2++) { rowY.push(acc); acc += rowH[r2] + gap; }
      var W = cols * w + (cols - 1) * gap, H = acc - gap;
      var gx = baseL + w / 2 - W / 2, gy = baseT;
      gx = Math.max(br.left + 16, Math.min(gx, boxR - 16 - W));
      gy = H <= br.height - 16 ? Math.max(br.top + 8, Math.min(gy, br.bottom - 8 - H)) : br.top + 8;
      cards.forEach(function (c, i) {
        var pos = (i - off + n) % n, row = Math.floor(pos / cols), col = pos % cols;
        var inRow = row === rowsN - 1 ? n - row * cols : cols;     // centre a short last row
        var x = gx + (cols - inRow) * (w + gap) / 2 + col * (w + gap), y = gy + rowY[row];
        c._pos = pos;
        c.classList.toggle('gm-top', pos === 0);
        c.style.zIndex = String(100 + n - pos);
        c.style.transform = 'translate(' + (x - baseL) + 'px,' + (y - baseT) + 'px)';
        c.style.opacity = '1';
        c.style.pointerEvents = '';
      });
      // invisible pad under the spread so the gaps between cards still count as hovering
      if (st._pad) {
        var ps = st._pad.style;
        ps.display = 'block';
        ps.left = (gx - sr.left - 14) + 'px'; ps.top = (gy - sr.top - 14) + 'px';
        ps.width = (W + 28) + 'px'; ps.height = (H + 28) + 'px';
      }
      return;
    }
    cards.forEach(function (c, i) {
      var pos = (i - off + n) % n, p = Math.min(pos, 3);
      c._pos = pos;
      c.classList.toggle('gm-top', pos === 0);
      c.style.zIndex = String(n - pos);
      c.style.transform = STACK === 'tilted'
        ? 'translateY(' + (-p * 5) + 'px) rotate(' + TILT[p] + 'deg) scale(' + (1 - p * 0.02) + ')'
        : 'translateY(' + (-p * 11) + 'px) scale(' + (1 - p * 0.05) + ')';
      c.style.opacity = pos < 3 ? '1' : '0';
      c.style.pointerEvents = pos < 3 ? '' : 'none';
    });
  }
  function makeCard(r, st, i, count) {
    var d = rowData(r);
    var c = document.createElement('div');
    c.className = 'gm-card' + (d.unread ? ' gm-unread' : '');
    var top = mk('div', 'gm-c-top');
    var who = mk('span', 'gm-c-who');
    if (count > 1) { var bd = mk('span', 'gm-badge', String(count)); bd.title = count + ' conversations'; who.appendChild(bd); }
    who.appendChild(mk('span', 'gm-c-from', d.from));
    top.appendChild(who);
    top.appendChild(mk('span', 'gm-c-date', d.date));
    c.appendChild(top);
    c.appendChild(mk('div', 'gm-c-sub', d.subject));
    c._row = r;
    c._snipEl = mk('div', 'gm-c-snip', d.snippet);
    c.appendChild(c._snipEl);
    var lb = mk('div', 'gm-c-labels');
    d.labels.slice(0, 4).forEach(function (l) { lb.appendChild(mk('span', '', l)); });
    c.appendChild(lb);
    var acts = mk('div', 'gm-acts');
    acts.appendChild(actButton('Archive', r, c));
    acts.appendChild(actButton('Delete', r, c));
    c.appendChild(acts);
    c.title = d.subject;
    c.addEventListener('click', function () {
      if (st._cards.length > 1 && !stackOpen.has(st._key) && !isSpread(st) && c._pos > 0) { stackOff[st._key] = i; layoutStack(st); }
      else { setFocus(null); openRow(r); }
    });
    return c;
  }
  function makeStack(key, label, rows) {
    var st = document.createElement('div');
    st.className = 'gm-stack' + (stackOpen.has(key) ? ' gm-open' : '');
    st._key = key;
    // No title row above a stack: the sender is already on the card, and the count is a
    // badge on the top card. Only Label grouping keeps one (the label isn't on the card).
    if (label !== null && MODE === 'label') {
      var h = mk('div', 'gm-stack-h');
      h.appendChild(mk('span', 'gm-name', label));
      st.appendChild(h);
    }
    var b = document.createElement('div');
    b.className = 'gm-stack-b';
    st._cards = rows.map(function (r, i) { var c = makeCard(r, st, i, rows.length); b.appendChild(c); return c; });
    if (rows.length > 1) { st._pad = mk('div', 'gm-pad'); b.appendChild(st._pad); }
    st.appendChild(b);
    layoutStack(st);
    // small delays so sweeping the mouse across the grid doesn't make stacks pop open
    st.addEventListener('mouseenter', function () { clearTimeout(focusT); focusT = setTimeout(function () { setFocus(st); }, 140); });
    st.addEventListener('mouseleave', function () { clearTimeout(focusT); focusT = setTimeout(function () { if (focusSt === st) setFocus(null); }, 200); });
    return st;
  }
  // Background of the list area (the overlay copies it, and cards follow light/dark).
  function areaBg(el) {
    try {
      for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
        var c = getComputedStyle(n).backgroundColor, m = c.match(/[\d.]+/g);
        if (m && (m.length < 4 || parseFloat(m[3]) > 0.5)) {
          return { color: 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')', dark: (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128 };
        }
      }
    } catch (e) {}
    return { color: '#202124', dark: true };
  }
  // The scrolling pane that holds the message list; the overlay sits exactly over it.
  function listPane(table) {
    for (var n = table.parentElement; n && n !== document.body; n = n.parentElement) {
      var o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.clientHeight > 0) return n;
    }
    return document.querySelector('div[role=main]');
  }
  function hideCards() { var b = document.getElementById('gm-cards'); if (b) b.classList.remove('gm-show'); }
  function stackOptions() {
    var o = mk('div', 'gm-opts');
    o.appendChild(mk('span', 'gm-lbl', 'Spacing:'));
    var sl = document.createElement('input');
    sl.type = 'range'; sl.min = GAP_MIN; sl.max = GAP_MAX; sl.step = 1; sl.value = GAP;
    sl.title = 'Spacing between card groups';
    sl.addEventListener('input', function () {
      GAP = parseInt(sl.value, 10) || GAP_MIN; set(LS.gap, String(GAP)); applyGap();
    });
    o.appendChild(sl);
    o.appendChild(mk('span', 'gm-sep2'));
    o.appendChild(mk('span', 'gm-lbl', 'Stack:'));
    [['even', 'Even'], ['tilted', 'Tilted']].forEach(function (p) {
      var b = mk('button', p[0] === STACK ? 'gm-active' : '', p[1]);
      b.dataset.stack = p[0];
      b.addEventListener('click', function () { setStack(p[0]); });
      o.appendChild(b);
    });
    return o;
  }
  function renderCards() {
    try {
      var table = listTable();
      // only while the list itself is on screen (not inside an open message, settings, ...)
      if (VIEW !== 'cards' || !table || !table.offsetParent) { hideCards(); return; }
      var tbody = table.tBodies[0] || table.querySelector('tbody');
      var pane = listPane(table);
      if (!tbody || !pane) { hideCards(); return; }
      var pr = pane.getBoundingClientRect();
      if (pr.width < 80 || pr.height < 80) { hideCards(); return; }
      var box = document.getElementById('gm-cards');
      if (!box) {
        box = mk('div'); box.id = 'gm-cards'; document.body.appendChild(box); cardSig = '';
        // safety net: if the pointer is somewhere else, the focused stack lets go
        box.addEventListener('mousemove', function (e) {
          if (focusSt && !focusSt.contains(e.target)) { var f = focusSt; clearTimeout(focusT); focusT = setTimeout(function () { if (focusSt === f) setFocus(null); }, 200); }
        });
        box.addEventListener('mouseleave', function () { clearTimeout(focusT); focusT = setTimeout(function () { setFocus(null); }, 200); });
      }
      var bg = areaBg(pane);
      // start below the list toolbar so the Group / View controls stay reachable
      var top = pr.top, tb = listToolbar();
      if (tb && tb.offsetHeight) { var tr = tb.getBoundingClientRect(); if (tr.bottom > top && tr.bottom < pr.bottom - 80) top = tr.bottom; }
      box.style.left = pr.left + 'px'; box.style.top = top + 'px';
      box.style.width = pr.width + 'px'; box.style.height = (pr.bottom - top) + 'px';
      box.style.background = bg.color;
      box.style.setProperty('--gm-gap', GAP + 'px');
      box.classList.toggle('gm-light', !bg.dark);
      box.classList.add('gm-show');
      var rows = [].slice.call(tbody.querySelectorAll('tr.zA'));
      // Rebuild only when the list itself changed (keeps stack animations and avoids churn).
      var sig = MODE + '|' + rows.map(function (r) { return (r.id || '') + (r.classList.contains('zE') ? 'u' : 'r') + txt(r.querySelector('.bog')); }).join('|');
      if (sig === cardSig) return;
      cardSig = sig;
      var frag = document.createDocumentFragment();
      frag.appendChild(stackOptions());
      if (MODE === 'none') {
        resolveSenders(rows);
        rows.forEach(function (r, i) { frag.appendChild(makeStack('n:' + i, null, [r])); });
      } else {
        buildGroups(rows).forEach(function (g) {
          if (MODE === 'label-sender') {
            var sec = document.createElement('div');
            sec.className = 'gm-sec'; sec.textContent = g.label;
            frag.appendChild(sec);
            g.subOrder.forEach(function (s) { frag.appendChild(makeStack(s.key, s.label, s.rows)); });
          } else {
            frag.appendChild(makeStack(g.key, g.label, g.rows));
          }
        });
      }
      var keepKey = focusSt ? focusSt._key : null;
      clearTimeout(focusT); focusSt = null; box.classList.remove('gm-dim');
      box.textContent = '';
      box.appendChild(frag);
      if (keepKey) {
        var again = [].slice.call(box.querySelectorAll('.gm-stack')).filter(function (x) { return x._key === keepKey; })[0];
        if (again) setFocus(again);
      }
    } catch (e) { /* leave the list usable on error */ }
  }
  function applyView() {
    try {
      document.body.classList.toggle('gm-cards-on', VIEW === 'cards');
      document.body.classList.toggle('gm-stack-tilted', STACK === 'tilted');
    } catch (e) {}
    [].slice.call(document.querySelectorAll('#gm-cards button[data-stack]')).forEach(function (b) {
      b.classList.toggle('gm-active', b.dataset.stack === STACK);
    });
    [].slice.call(document.querySelectorAll('#gm-group-bar button[data-view]')).forEach(function (b) {
      b.classList.toggle('gm-active', b.dataset.view === VIEW);
    });
  }
  function setStack(v) {
    STACK = v; set(LS.stack, v);
    applyView();
    [].slice.call(document.querySelectorAll('#gm-cards .gm-stack')).forEach(layoutStack);
  }
  function setView(v) {
    VIEW = v; set(LS.view, v);
    applyView();
    if (v === 'cards') { cardSig = ''; renderCards(); } else { hideCards(); applyGrouping(); }
  }

  // The pagination cluster ("1–71 of 71" + Older/Newer) lives in the top
  // toolbar; return it so we can drop the group bar into that same row.
  // The main list toolbar ([gh="tm"]) whose first icons are select-all /
  // refresh / overflow(⋮) on the left and pagination on the right.
  function listToolbar() {
    var ref = document.querySelector('div[role=main] [aria-label="Refresh"],'
      + ' div[role=main] [aria-label^="Refresh"], [aria-label="Refresh"]');
    return ref ? (ref.closest('[gh="tm"]') || ref.closest('[role=toolbar]')) : null;
  }
  // Given an element, return its ancestor that is a direct child of the toolbar.
  function toolbarBlock(tb, el) {
    var n = el;
    while (n && n.parentElement && n.parentElement !== tb) n = n.parentElement;
    return (n && n.parentElement === tb) ? n : null;
  }

  function addGroupBar() {
    if (document.getElementById('gm-group-bar')) return;
    var tb = listToolbar();
    if (!tb) return; // toolbar not ready yet
    // The overflow "More" (⋮) is the third of the first three icons. Gmail's
    // toolbar positions its sub-containers (so DOM order != visual order), but
    // order WITHIN the left icon group is left-to-right — so insert the bar
    // right after the ⋮ button inside that group.
    var more = tb.querySelector('[aria-label="More"][role=button], [aria-label="More"],'
      + ' [aria-label^="More email"]')
      || tb.querySelector('[aria-label="Refresh"], [aria-label^="Refresh"]');
    if (!more || !more.parentNode) return;
    var bar = document.createElement('div');
    bar.id = 'gm-group-bar';
    bar.appendChild(mk('span', 'gm-lbl', 'Group:'));
    [['none', 'None'], ['sender', 'Sender'], ['label', 'Label'], ['label-sender', 'Label → Sender']].forEach(function (p) {
      var b = document.createElement('button');
      b.dataset.mode = p[0]; b.textContent = p[1];
      if (p[0] === MODE) b.classList.add('gm-active');
      b.addEventListener('click', function () { setMode(p[0]); });
      bar.appendChild(b);
    });
    var sep = document.createElement('span'); sep.className = 'gm-sep'; bar.appendChild(sep);
    var vl = document.createElement('span'); vl.className = 'gm-lbl'; vl.textContent = 'View:'; bar.appendChild(vl);
    [['list', 'List'], ['cards', 'Cards']].forEach(function (p) {
      var b = document.createElement('button');
      b.dataset.view = p[0]; b.textContent = p[1];
      if (p[0] === VIEW) b.classList.add('gm-active');
      b.addEventListener('click', function () { setView(p[0]); });
      bar.appendChild(b);
    });
    // place it immediately to the RIGHT of the first three icons
    more.parentNode.insertBefore(bar, more.nextSibling);
  }

  /* ---------------------------------------------------- observe & apply --- */
  var t;
  function tick() {
    injectCSS();
    applyChrome();
    addRailToggle();
    addGroupBar();
    applyView();
    if (VIEW === 'cards') renderCards();
    else if (MODE !== 'none') applyGrouping();
  }
  // keep the card overlay glued to the list pane
  window.addEventListener('resize', function () { if (VIEW === 'cards') renderCards(); });
  window.addEventListener('hashchange', function () { if (VIEW === 'cards') { renderCards(); schedule(); } });
  function schedule() { clearTimeout(t); t = setTimeout(tick, 250); }

  injectCSS();
  tick();
  try {
    var mo = new MutationObserver(function (muts) {
      if (applying) return;
      // ignore our own card rendering
      var box = document.getElementById('gm-cards');
      if (box && muts.every(function (m) { return box === m.target || box.contains(m.target); })) return;
      // Gmail redrew the list (delete, archive, new mail): regroup right now, before the
      // next paint, instead of waiting for the debounce.
      try {
        var lt = listTable();
        if (lt && muts.some(function (m) { return lt.contains(m.target); })) {
          if (VIEW === 'cards') renderCards(); else if (MODE !== 'none') applyGrouping();
        }
      } catch (e) {}
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  } catch (e) {}
  // belt-and-suspenders: re-apply chrome hides periodically (header re-renders)
  setInterval(function () { try { injectCSS(); applyChrome(); addRailToggle(); addGroupBar(); if (VIEW === 'cards') renderCards(); } catch (e) {} }, 3000);
})();
