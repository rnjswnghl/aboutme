/* 예고 신호 점검기 — 화면·저장·판정 표시. 측정은 runner.js, 판정 계산은 stats.js. */
(function () {
  'use strict';
  var S = window.SignalStats, R = window.SignalRunner;
  var KEY = 'signal-check-v1';
  var PAPER = { leadMs: 500, flashMs: 100, borderPx: 10 };
  var LIMITS = { leadMs: [150, 1500], flashMs: [30, 300], borderPx: [2, 40] };
  var MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  var STATUSES = ['ok', 'anticipation', 'timeout', 'catch_ok', 'catch_fa'];

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var fmt = function (x, nd) { return x == null || !isFinite(x) ? '—' : (Math.round(x * Math.pow(10, nd || 0)) / Math.pow(10, nd || 0)).toFixed(nd || 0); };
  var signed = function (x) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + fmt(x, 1); };
  var fmtP = function (p) { return p == null ? '—' : p < 0.001 ? '< .001' : '= ' + p.toFixed(3).replace(/^0/, ''); };

  // ---------- 저장 (브라우저 저장소가 막혀 있어도 이번 방문 동안은 동작) ----------
  var memory = null;
  function emptyDb() { return { settings: {}, rounds: [] }; }
  function load() {
    if (memory) return memory;
    try { var raw = localStorage.getItem(KEY); memory = raw ? sanitizeDb(JSON.parse(raw)).db : emptyDb(); }
    catch (e) { memory = emptyDb(); }
    return memory;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (e) { /* 이번 방문 동안만 유지 */ } }

  // ---------- 신호 설정 ----------
  function specId(s) { return 'L' + s.leadMs + '-F' + s.flashMs + '-B' + s.borderPx; }
  function isPaper(s) { return s.leadMs === PAPER.leadMs && s.flashMs === PAPER.flashMs && s.borderPx === PAPER.borderPx; }
  function labelOf(s) { return isPaper(s) ? '논문 설정' : '간격 ' + s.leadMs + ' · 점등 ' + s.flashMs + ' · 두께 ' + s.borderPx; }
  function specText(s) { return '예고 ' + s.leadMs + 'ms · 점등 ' + s.flashMs + 'ms · 테두리 ' + s.borderPx + 'px'; }

  function readForm() {
    var f = $('setting-form'), errs = [], out = {};
    Object.keys(LIMITS).forEach(function (k) {
      var input = f.elements[k], raw = String(input.value).trim(), lim = LIMITS[k];
      var ok = /^\d{1,4}$/.test(raw) && +raw >= lim[0] && +raw <= lim[1];
      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok) errs.push(input.closest('label').dataset.name + ({ leadMs: '은 ', flashMs: '은 ', borderPx: '는 ' })[k] + lim[0] + '~' + lim[1] + ' 사이의 정수로 적어 주세요.');
      else out[k] = +raw;
    });
    if (!errs.length && out.flashMs >= out.leadMs) {
      f.elements.flashMs.setAttribute('aria-invalid', 'true');
      errs.push('점등 시간은 예고 간격보다 짧아야 합니다. 테두리가 원이 나온 뒤까지 켜져 있으면 예고가 아니게 됩니다.');
    }
    var name = String(f.elements.tester.value).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
    out.tester = name;
    return { setting: out, errors: errs };
  }
  function fillForm(s) {
    var f = $('setting-form');
    Object.keys(LIMITS).forEach(function (k) { f.elements[k].value = s[k]; f.elements[k].setAttribute('aria-invalid', 'false'); });
    $('form-err').hidden = true;
    renderPresets();
  }
  function nextTesterName() {
    var names = {};
    load().rounds.forEach(function (r) { names[r.tester] = 1; });
    for (var i = 1; ; i++) if (!names['테스터 ' + i]) return '테스터 ' + i;
  }

  // ---------- 집계 ----------
  function groups() {
    var db = load(), by = {};
    db.rounds.forEach(function (r) {
      var g = by[r.settingId] || (by[r.settingId] = { setting: db.settings[r.settingId], testers: {}, rounds: 0, sample: false });
      var t = g.testers[r.tester] || (g.testers[r.tester] = { name: r.tester, rounds: 0, trials: [], sample: !!r.sample });
      t.rounds++; g.rounds++; t.trials = t.trials.concat(r.trials);
      if (r.sample) g.sample = true;
    });
    Object.keys(by).forEach(function (id) {
      var g = by[id];
      g.rows = Object.keys(g.testers).map(function (n) {
        var t = g.testers[n], pt = S.perTester(t.trials);
        pt.name = n; pt.rounds = t.rounds; pt.sample = t.sample;
        return pt;
      });
      g.analyzed = g.rows.filter(function (r) { return !r.excluded && r.diff != null; });
      g.v = S.verdict(g.analyzed.map(function (r) { return r.diff; }));
      g.strat = S.strategy([].concat.apply([], Object.keys(g.testers).map(function (n) { return g.testers[n].trials; })));
    });
    return by;
  }
  function orderedIds(by) {
    return Object.keys(by).sort(function (a, b) {
      var pa = isPaper(by[a].setting), pb = isPaper(by[b].setting);
      if (pa !== pb) return pa ? -1 : 1;
      return by[a].setting.leadMs - by[b].setting.leadMs || a.localeCompare(b);
    });
  }

  // ---------- 화면: 저장된 신호 ----------
  var selected = null;
  function renderPresets() {
    var box = $('presets'); box.textContent = '';
    var db = load(), cur = readFormSilently();
    var list = [PAPER].concat(Object.keys(db.settings).map(function (k) { return db.settings[k]; }).filter(function (s) { return !isPaper(s); }));
    list.forEach(function (s) {
      var b = el('button', 'chip', labelOf(s)); b.type = 'button';
      b.setAttribute('aria-pressed', cur && specId(cur) === specId(s) ? 'true' : 'false');
      b.addEventListener('click', function () { fillForm(s); });
      box.append(b);
    });
  }
  function readFormSilently() {
    var f = $('setting-form'), o = {};
    for (var k in LIMITS) { var v = String(f.elements[k].value).trim(); if (!/^\d{1,4}$/.test(v)) return null; o[k] = +v; }
    return o;
  }

  // ---------- 화면: 판정 ----------
  function renderVerdict(by) {
    var ids = orderedIds(by), tabs = $('verdict-tabs'), body = $('verdict-body');
    tabs.textContent = ''; body.textContent = '';
    if (!ids.length) {
      body.append(el('p', 'empty', '아직 기록이 없습니다. 1번에서 한 판을 하거나, 아래 ‘예시 데이터 불러오기’로 판정 화면을 먼저 볼 수 있습니다.'));
      return;
    }
    if (!selected || !by[selected]) selected = ids[0];
    ids.forEach(function (id) {
      var b = el('button', 'chip', labelOf(by[id].setting)); b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-pressed', id === selected ? 'true' : 'false');
      b.setAttribute('aria-selected', id === selected ? 'true' : 'false');
      b.addEventListener('click', function () { selected = id; render(); });
      tabs.append(b);
    });
    var g = by[selected], v = g.v;
    var box = el('div', 'verdict' + (v.n >= 2 && v.reason == null ? (v.supported ? ' yes' : ' no') : ''));
    box.append(el('p', 'label', specText(g.setting) + ' · 판정 대상 ' + g.analyzed.length + '명 / 기록 ' + g.rows.length + '명' + (g.sample ? ' · 예시(가상) 데이터 포함' : '')));
    var big, expl;
    if (v.n < 2 || v.reason) {
      big = '판정하려면 테스터가 더 필요합니다';
      expl = v.n === 1 ? '지금 1명입니다. 한 사람의 차이는 판정이 아니라 참고값입니다. 다른 사람에게도 같은 신호로 한 판씩 부탁하세요. 판정이 나오려면 5명 이상이어야 합니다.'
        : '규칙을 충족한 테스터가 아직 없습니다. 한 사람이 조건별 유효 반응 5회, 합쳐서 10회 이상이어야 판정에 들어갑니다.';
    } else if (v.supported) {
      big = '빨라졌다';
      expl = '이 신호가 있을 때 테스터들의 반응이 짧아졌습니다. 논문이 미리 정한 규칙(HL 추정치 < 0, 단측 p < .05)을 충족합니다. 효과의 크기는 HL 추정치와 그 신뢰구간으로 읽으세요.';
    } else {
      big = '차이를 확인하지 못했다';
      expl = !v.canReachAlpha
        ? '지금 인원(' + v.n + '명)으로는 모두가 빨라져도 p가 .05 아래로 내려갈 수 없습니다. 5명 이상 모은 뒤 다시 보세요. ‘효과가 없다’는 뜻이 아닙니다.'
        : '이 인원과 이 기기들에서는 규칙을 충족하는 차이가 나오지 않았습니다. ‘효과가 없다’는 뜻이 아닙니다. 효과가 작거나, 신호가 눈에 덜 띄었거나, 인원이 부족할 수 있습니다.';
    }
    box.append(el('p', 'big', big), el('p', '', expl));
    if (v.n >= 2 && !v.reason) {
      var st = el('div', 'stats');
      [['HL 추정치', signed(v.hl) + ' ms'], ['95% 신뢰구간', '[' + fmt(v.ci95[0], 1) + ', ' + fmt(v.ci95[1], 1) + ']'],
        ['단측 Wilcoxon', 'p ' + fmtP(v.p)], ['신호 때 빨랐던 사람', v.kFaster + ' / ' + (v.kFaster + v.kSlower) + '명']]
        .forEach(function (a) { var s = el('div', 'stat'); s.append(el('span', '', a[0]), el('strong', '', a[1])); st.append(s); });
      box.append(st);
    }
    body.append(box);

    var sw = strategyWarning(g.strat);
    if (sw) body.append(el('p', 'warnbox', sw));
    if (g.analyzed.length) body.append(chart(g));
    body.append(table(g));
  }

  function strategyWarning(s) {
    var faC = s.cue.catches ? s.cue.fa / s.cue.catches : 0, faN = s.nocue.catches ? s.nocue.fa / s.nocue.catches : 0;
    var fC = s.cue.ok ? s.cue.fast / s.cue.ok : 0, fN = s.nocue.ok ? s.nocue.fast / s.nocue.ok : 0;
    var msgs = [];
    if (s.cue.catches >= 4 && faC - faN >= 0.2) msgs.push('함정(원이 안 나오는 회차)에서 누른 비율이 신호 있음 ' + Math.round(faC * 100) + '%, 없음 ' + Math.round(faN * 100) + '%입니다.');
    if (s.cue.ok >= 20 && fC - fN >= 0.05) msgs.push('100~150ms 반응이 신호 있음 ' + Math.round(fC * 100) + '%, 없음 ' + Math.round(fN * 100) + '%입니다.');
    if (!msgs.length) return '';
    return '신호에 박자를 맞춰 누른 흔적: ' + msgs.join(' ') + ' 차이의 일부는 원을 보고 반응한 것이 아니라 신호에 맞춰 미리 누른 결과일 수 있습니다(논문 한계 3).';
  }

  function chart(g) {
    var d = g.analyzed.map(function (r) { return r.diff; }), v = g.v;
    var lo = Math.min.apply(null, d.concat([0, v.ci95 ? v.ci95[0] : 0])), hi = Math.max.apply(null, d.concat([0, v.ci95 ? v.ci95[1] : 0]));
    var pad = Math.max(10, (hi - lo) * 0.1); lo -= pad; hi += pad;
    var W = 640, H = 120, L = 20, Rr = 20, x = function (val) { return L + (val - lo) / (hi - lo) * (W - L - Rr); };
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '테스터별 차이 ' + d.length + '개. 0보다 왼쪽이면 신호가 있을 때 빨랐음');
    function add(tag, attrs, text) { var n = document.createElementNS(ns, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); if (text) n.textContent = text; svg.append(n); return n; }
    if (v.ci95) add('rect', { x: x(v.ci95[0]), y: 22, width: Math.max(1, x(v.ci95[1]) - x(v.ci95[0])), height: 60, fill: '#A9B1C6', opacity: '.35' });
    add('line', { x1: x(0), x2: x(0), y1: 14, y2: 90, stroke: '#23262C', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
    add('text', { x: x(0), y: 106, 'text-anchor': 'middle', 'font-size': 12, fill: '#555A63' }, '0');
    var sorted = d.slice().sort(function (a, b) { return a - b; }), seen = {};
    sorted.forEach(function (val) {
      var key = Math.round(x(val) / 8); seen[key] = (seen[key] || 0) + 1;
      add('circle', { cx: x(val), cy: 52 + (seen[key] - 1) * 9 * (seen[key] % 2 ? 1 : -1) / 2, r: 5, fill: val < 0 ? '#3F6B55' : '#9A5B2E', opacity: '.85' });
    });
    if (v.hl != null) {
      add('line', { x1: x(v.hl), x2: x(v.hl), y1: 18, y2: 86, stroke: '#4D587A', 'stroke-width': 2.5 });
      add('text', { x: x(v.hl), y: 13, 'text-anchor': 'middle', 'font-size': 12, fill: '#4D587A', 'font-weight': 600 }, 'HL ' + signed(v.hl));
    }
    add('text', { x: L, y: 106, 'font-size': 11, fill: '#555A63' }, '← 신호 때 빠름');
    add('text', { x: W - Rr, y: 106, 'text-anchor': 'end', 'font-size': 11, fill: '#555A63' }, '신호 때 느림 →');
    var fig = el('figure', 'chart'); fig.append(svg, el('figcaption', '', '점 하나가 테스터 한 명의 차이(신호 있음 중앙값 − 없음 중앙값, ms)입니다. 세로선은 HL 추정치, 음영은 95% 신뢰구간입니다.'));
    return fig;
  }

  function table(g) {
    var wrap = el('div', 'table-wrap'), t = el('table'), thead = el('thead'), hr = el('tr');
    ['테스터', '판', '유효(있음/없음)', '있음 중앙값', '없음 중앙값', '차이'].forEach(function (h) { hr.append(el('th', '', h)); });
    thead.append(hr); t.append(thead);
    var tb = el('tbody');
    g.rows.slice().sort(function (a, b) { return (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || (a.diff == null ? 1 : b.diff == null ? -1 : a.diff - b.diff); })
      .forEach(function (r) {
        var tr = el('tr', r.excluded ? 'out' : '');
        var c0 = el('td', '', r.name);
        if (r.excluded) { c0.append(document.createTextNode(' ')); c0.append(el('span', 'tag', '제외: ' + r.excluded)); }
        tr.append(c0, el('td', 'mono', String(r.rounds)), el('td', 'mono', r.nValidCue + ' / ' + r.nValidNocue),
          el('td', 'mono', fmt(r.medianCue, 1)), el('td', 'mono', fmt(r.medianNocue, 1)), el('td', 'mono', signed(r.diff)));
        tb.append(tr);
      });
    t.append(tb); wrap.append(t);
    return wrap;
  }

  // ---------- 화면: 비교 ----------
  function renderCompare(by) {
    var box = $('compare-body'), ids = orderedIds(by);
    box.textContent = '';
    if (ids.length < 2) {
      box.append(el('p', 'empty', ids.length ? '지금은 신호가 하나뿐입니다. 1번에서 예고 간격이나 두께를 바꿔 한 판을 하면 여기에 나란히 놓입니다. 예: 간격 200ms, 두께 4px.' : '기록이 쌓이면 신호별 판정이 여기에 나란히 놓입니다.'));
    }
    ids.forEach(function (id) {
      var g = by[id], v = g.v, ok = v.n >= 2 && !v.reason;
      var c = el('article', 'cmp' + (ok ? (v.supported ? ' yes' : ' no') : ''));
      c.append(el('h3', '', labelOf(g.setting)), el('p', 'spec', specText(g.setting)),
        el('p', 'res', !ok ? '판정 전 (' + v.n + '명)' : v.supported ? '빨라졌다' : '차이를 확인하지 못했다'));
      var dl = el('dl');
      [['판정 대상', g.analyzed.length + '명'], ['HL 추정치', ok ? signed(v.hl) + ' ms' : '—'], ['95% CI', ok ? '[' + fmt(v.ci95[0], 1) + ', ' + fmt(v.ci95[1], 1) + ']' : '—'], ['단측 p', ok ? fmtP(v.p) : '—']]
        .forEach(function (a) { dl.append(el('dt', '', a[0]), el('dd', '', a[1])); });
      c.append(dl);
      var b = el('button', '', '이 신호로 한 판 더'); b.type = 'button';
      b.addEventListener('click', function () { fillForm(g.setting); $('measure').scrollIntoView({ behavior: 'smooth' }); $('start').focus({ preventScroll: true }); });
      c.append(b);
      box.append(c);
    });
  }

  function render() { var by = groups(); renderPresets(); renderVerdict(by); renderCompare(by); }

  // ---------- 측정 ----------
  var running = null;
  $('setting-form').addEventListener('input', function () { renderPresets(); });
  $('setting-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (running) return;
    var r = readForm(), err = $('form-err');
    if (r.errors.length) { err.textContent = r.errors.join(' '); err.hidden = false; return; }
    err.hidden = true;
    var s = { leadMs: r.setting.leadMs, flashMs: r.setting.flashMs, borderPx: r.setting.borderPx };
    var tester = r.setting.tester || nextTesterName();
    var id = specId(s), db = load();
    var withPractice = !db.rounds.some(function (x) { return x.tester === tester && !x.sample; });
    startRound(id, s, tester, withPractice);
  });

  function startRound(id, s, tester, withPractice) {
    var stage = $('stage'), prog = $('progress');
    stage.hidden = false; document.body.style.overflow = 'hidden';
    var els = { stage: stage, frame: $('frame'), target: $('target'), fix: $('fix'), feedback: $('feedback') };
    running = R.runRound(els, s, withPractice, function (i, n, block) {
      var nPractice = withPractice ? 4 : 0;
      prog.textContent = block === 'practice' ? '연습 ' + (i + 1) + ' / ' + nPractice + ' · 기록에 넣지 않음' : (i - nPractice + 1) + ' / ' + (n - nPractice);
    });
    stage.setAttribute('tabindex', '-1'); stage.focus();
    running.run().then(function (res) {
      stage.hidden = true; document.body.style.overflow = ''; running = null;
      var last = $('last');
      if (res.aborted) {
        last.hidden = false; last.textContent = '';
        last.append(el('p', 'note', '그만둔 판은 저장하지 않았습니다. 판정에는 끝까지 한 판만 들어갑니다.'));
        $('start').focus();
        return;
      }
      var db = load();
      db.settings[id] = s;
      var round = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), settingId: id, tester: tester, finishedAt: new Date().toISOString(), trials: res.trials.filter(function (t) { return t.block === 'main'; }) };
      db.rounds.push(round); save();
      showLast(round, s);
      selected = id; render();
    }).catch(function () {
      stage.hidden = true; document.body.style.overflow = ''; running = null;
      showMsg('측정 중 문제가 생겨 이 판은 저장하지 않았습니다. 다시 시도해 주세요.', 'warn');
    });
  }
  $('exit').addEventListener('click', function () { if (running) running.abort(); });

  function showLast(round, s) {
    var pt = S.perTester(round.trials), box = $('last');
    box.hidden = false; box.textContent = '';
    box.append(el('h3', '', round.tester + ' · ' + labelOf(s) + ' 한 판 결과'));
    var nums = el('div', 'nums');
    [['신호 있음 중앙값', fmt(pt.medianCue, 0) + ' ms'], ['신호 없음 중앙값', fmt(pt.medianNocue, 0) + ' ms'], ['차이', signed(pt.diff) + ' ms', pt.diff < 0], ['유효 반응', (pt.nValidCue + pt.nValidNocue) + ' / 12']]
      .forEach(function (a) { var n = el('div', 'num'); var st = el('strong', a[2] ? 'neg' : '', a[1]); n.append(el('span', '', a[0]), st); nums.append(n); });
    box.append(nums);
    var note;
    if (pt.nValidCue + pt.nValidNocue === 0) note = '유효한 반응이 없었습니다. 노란 원이 뜬 뒤 1.5초 안에 누르면 기록됩니다.';
    else if (pt.excluded) note = '이 판만으로는 판정에 들어가지 않습니다(' + pt.excluded + '). 같은 별명으로 한 판 더 하면 합쳐서 셉니다.';
    else note = '한 사람의 한 판은 판정이 아니라 참고값입니다. 아래 2번 판정은 테스터 여러 명의 차이를 모아 냅니다.';
    box.append(el('p', 'note', note));
  }

  // ---------- 예시 데이터 (가상, 고정 난수) ----------
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sampleRounds() {
    var rnd = mulberry32(20261103);
    var gauss = function () { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    var specs = [{ s: PAPER, n: 12, eff: -22, tag: 'A' }, { s: { leadMs: 200, flashMs: 100, borderPx: 4 }, n: 9, eff: -3, tag: 'B' }];
    var out = { settings: {}, rounds: [] };
    specs.forEach(function (sp) {
      var id = specId(sp.s); out.settings[id] = sp.s;
      for (var i = 1; i <= sp.n; i++) {
        var base = 300 + gauss() * 40, eff = sp.eff + gauss() * 14, nRounds = rnd() < 0.4 ? 2 : 1;
        for (var k = 0; k < nRounds; k++) {
          var trials = [];
          ['cue', 'nocue'].forEach(function (c) {
            for (var j = 0; j < 7; j++) {
              var isCatch = j === 6, u = rnd(), row = { block: 'main', condition: c, is_catch: isCatch, status: 'ok', rt_ms: null, hidden_during_trial: false };
              if (isCatch) row.status = rnd() < (c === 'cue' ? 0.12 : 0.08) ? 'catch_fa' : 'catch_ok';
              else if (u < 0.04) row.status = 'anticipation';
              else if (u < 0.06) row.status = 'timeout';
              else row.rt_ms = Math.round((base + (c === 'cue' ? eff : 0) + Math.abs(gauss()) * 45 - 20) * 100) / 100;
              trials.push(row);
            }
          });
          out.rounds.push({ id: 'sample-' + sp.tag + i + '-' + k, settingId: id, tester: '예시 ' + sp.tag + i, finishedAt: '2026-11-03T00:00:00.000Z', sample: true, trials: trials });
        }
      }
    });
    return out;
  }

  // ---------- 불러오기 검증 ----------
  function num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
  function sanitizeSetting(s) {
    if (!s || typeof s !== 'object') return null;
    var o = {};
    for (var k in LIMITS) { var v = s[k]; if (!Number.isInteger(v) || v < LIMITS[k][0] || v > LIMITS[k][1]) return null; o[k] = v; }
    return o.flashMs < o.leadMs ? o : null;
  }
  function sanitizeTrial(t) {
    if (!t || typeof t !== 'object') return null;
    if (t.condition !== 'cue' && t.condition !== 'nocue') return null;
    if (STATUSES.indexOf(t.status) < 0) return null;
    var rt = num(t.rt_ms);
    if (t.status === 'ok' && (rt == null || rt < 0 || rt > 10000)) return null;
    return { block: 'main', condition: t.condition, is_catch: t.is_catch === true, status: t.status, rt_ms: t.status === 'ok' ? rt : null, hidden_during_trial: t.hidden_during_trial === true };
  }
  function sanitizeDb(obj) {
    var db = emptyDb(), skipped = 0;
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.rounds) || typeof obj.settings !== 'object' || obj.settings === null) throw new Error('shape');
    Object.keys(obj.settings).forEach(function (k) { var s = sanitizeSetting(obj.settings[k]); if (s) db.settings[specId(s)] = s; });
    obj.rounds.slice(0, 5000).forEach(function (r) {
      var s = r && obj.settings[r.settingId] && sanitizeSetting(obj.settings[r.settingId]);
      var tester = r && typeof r.tester === 'string' ? r.tester.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) : '';
      var trials = r && Array.isArray(r.trials) ? r.trials.slice(0, 40).map(sanitizeTrial).filter(Boolean) : [];
      if (!s || !tester || !trials.length || typeof r.id !== 'string') { skipped++; return; }
      db.rounds.push({ id: r.id.slice(0, 60), settingId: specId(s), tester: tester, finishedAt: typeof r.finishedAt === 'string' ? r.finishedAt.slice(0, 30) : '', sample: r.sample === true, trials: trials });
    });
    return { db: db, skipped: skipped };
  }
  function merge(incoming) {
    var db = load(), have = {}, added = 0;
    db.rounds.forEach(function (r) { have[r.id] = 1; });
    Object.keys(incoming.settings).forEach(function (k) { db.settings[k] = incoming.settings[k]; });
    incoming.rounds.forEach(function (r) { if (!have[r.id]) { db.rounds.push(r); have[r.id] = 1; added++; } });
    save();
    return added;
  }

  function showMsg(t, tone) { var m = $('data-msg'); m.textContent = t; m.dataset.tone = tone || ''; }

  $('sample').addEventListener('click', function () {
    var added = merge(sampleRounds());
    selected = specId(PAPER); render();
    showMsg(added ? '예시(가상) 기록 ' + added + '판을 불러왔습니다. 테스터 이름이 ‘예시’로 시작합니다. 2번과 3번을 보세요.' : '예시 데이터는 이미 들어 있습니다.', 'ok');
  });
  $('export').addEventListener('click', function () {
    var db = load();
    if (!db.rounds.length) { showMsg('내보낼 기록이 없습니다.', 'warn'); return; }
    var blob = new Blob([JSON.stringify({ app: 'signal-check', version: 1, exportedAt: new Date().toISOString(), settings: db.settings, rounds: db.rounds }, null, 1)], { type: 'application/json' });
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'signal-check-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    showMsg('기록 ' + db.rounds.length + '판을 내보냈습니다. 다른 기기에서 ‘기록 불러오기’로 합칠 수 있습니다.', 'ok');
  });
  $('import').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { showMsg('파일이 너무 큽니다(2MB까지). 이 앱에서 내보낸 JSON 파일인지 확인해 주세요.', 'warn'); return; }
    f.text().then(function (txt) {
      var parsed;
      try { parsed = JSON.parse(txt); } catch (err) { showMsg('JSON 형식이 아닙니다. 이 앱의 ‘기록 내보내기’로 만든 파일을 골라 주세요.', 'warn'); return; }
      var res;
      try { res = sanitizeDb(parsed); } catch (err) { showMsg('이 앱의 기록 파일이 아닙니다(settings·rounds 항목이 없음). 아무것도 바꾸지 않았습니다.', 'warn'); return; }
      if (!res.db.rounds.length) { showMsg('읽을 수 있는 판이 없습니다' + (res.skipped ? '(형식이 맞지 않는 판 ' + res.skipped + '개)' : '') + '. 아무것도 바꾸지 않았습니다.', 'warn'); return; }
      var added = merge(res.db); render();
      showMsg('새 기록 ' + added + '판을 합쳤습니다' + (res.db.rounds.length - added ? ', 이미 있던 ' + (res.db.rounds.length - added) + '판은 건너뛰었습니다' : '') + (res.skipped ? ', 형식이 맞지 않는 ' + res.skipped + '판은 뺐습니다' : '') + '.', 'ok');
    }).catch(function () { showMsg('파일을 읽지 못했습니다.', 'warn'); });
  });
  var clearArmed = null;
  $('clear').addEventListener('click', function () {
    var b = $('clear');
    if (!clearArmed) {
      b.textContent = '한 번 더 누르면 모두 지웁니다';
      clearArmed = setTimeout(function () { clearArmed = null; b.textContent = '모든 기록 지우기'; }, 4000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = null; b.textContent = '모든 기록 지우기';
    memory = emptyDb(); save(); selected = null; $('last').hidden = true; render();
    showMsg('이 브라우저의 기록을 모두 지웠습니다.', 'ok');
  });

  render();
})();
