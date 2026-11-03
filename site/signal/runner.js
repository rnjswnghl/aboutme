/* 한 판 측정 엔진. 10번 논문 실험 앱(reflex-hub web/src/games/reaction, 앱 2.0.0)의 시행 구조를 그대로 옮겼다.
 * - 한 판: 조건별 목표 6회 + 캐치 1회 = 14회, 첫 판에는 연습 4회(분석 제외)
 * - 시행 시작 → (가상)경고 시점: 800~2000ms 균등분포, 두 조건에 같은 대기시간 집합을 짝지어 배정
 * - 경고 시점 → 목표: 두 조건 모두 같은 간격(기본 500ms). 신호 있음 조건에서만 테두리가 켜진다.
 * - 반응 시각은 입력 이벤트의 timeStamp, 자극 시각은 화면을 바꾼 프레임의 performance.now()
 * 다른 점: 예고 간격·점등 시간·테두리 두께를 사용자가 바꿀 수 있다(논문 값이 기본). */
(function (root) {
  'use strict';

  var BASE = {
    targetPerCondition: 6, catchPerCondition: 1,
    practiceTargetPerCondition: 1, practiceCatchPerCondition: 1,
    preCueMinMs: 800, preCueMaxMs: 2000,
    responseWindowMs: 1500, feedbackMs: 450, itiMs: 350
  };
  var HALF_FRAME_MS = 8;

  function rand() {
    var b = new Uint32Array(1);
    (root.crypto || globalThis.crypto).getRandomValues(b);
    return b[0] / 4294967296;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function makeBlock(block, nTarget, nCatch) {
    var out = [];
    [false, true].forEach(function (isCatch) {
      var n = isCatch ? nCatch : nTarget, pre = [];
      for (var i = 0; i < n; i++) pre.push(Math.round(BASE.preCueMinMs + rand() * (BASE.preCueMaxMs - BASE.preCueMinMs)));
      ['cue', 'nocue'].forEach(function (condition) {
        pre.forEach(function (p) { out.push({ block: block, condition: condition, isCatch: isCatch, preCueMs: p }); });
      });
    });
    return shuffle(out);
  }
  function buildRound(withPractice) {
    var practice = withPractice ? makeBlock('practice', BASE.practiceTargetPerCondition, BASE.practiceCatchPerCondition) : [];
    return practice.concat(makeBlock('main', BASE.targetPerCondition, BASE.catchPerCondition));
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var r2 = function (x) { return Math.round(x * 100) / 100; };

  function eventTime(e) {
    var t = e && e.timeStamp, now = performance.now();
    if (typeof t === 'number' && t > 0 && t <= now + 5) return t;
    return now;
  }

  // els: {stage, frame, target, fix, feedback, progress}, setting: {leadMs, flashMs, borderPx}
  function runRound(els, setting, withPractice, onProgress) {
    var state = { phase: 'idle', response: null, onResponse: null, interrupted: false, aborted: false };
    var plan = buildRound(withPractice);

    function handle(input, e) {
      if (state.phase === 'idle' || state.response) return;
      state.response = { t: eventTime(e), input: input, phase: state.phase };
      if (state.onResponse) state.onResponse();
    }
    function onPointer(e) { if (e.target.closest('[data-exit]')) return; e.preventDefault(); handle(e.pointerType || 'pointer', e); }
    function onKey(e) {
      if (e.repeat) return;
      if (e.code === 'Escape') { state.aborted = true; if (state.onResponse) state.onResponse(); return; }
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); handle('keyboard', e); }
    }
    function onInterrupt() { if (state.phase !== 'idle') state.interrupted = true; }
    function onVis() { if (document.visibilityState === 'hidden') onInterrupt(); }
    els.stage.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onInterrupt);

    function at(tAbs, apply, abortable) {
      if (abortable === undefined) abortable = true;
      return new Promise(function (resolve) {
        var done = false;
        var finish = function (v) { if (!done) { done = true; resolve(v); } };
        if (abortable) state.onResponse = function () { finish({ early: true }); };
        var loop = function () {
          if (done) return;
          if (abortable && (state.response || state.aborted)) return finish({ early: true });
          if (performance.now() + HALF_FRAME_MS >= tAbs) { apply(); return finish({ early: false, t: performance.now() }); }
          requestAnimationFrame(loop);
        };
        setTimeout(function () { requestAnimationFrame(loop); }, Math.max(0, tAbs - performance.now() - 40));
      });
    }
    function cue(on) { els.frame.dataset.on = on ? 'true' : 'false'; }
    function fb(text, tone) { els.feedback.textContent = text; els.feedback.dataset.tone = tone || ''; }

    async function trial(tr) {
      state.response = null; state.onResponse = null;
      state.interrupted = document.visibilityState === 'hidden';
      els.target.dataset.on = 'false'; cue(false); fb(''); els.fix.dataset.on = 'true';
      var row = { block: tr.block, condition: tr.condition, is_catch: tr.isCatch, precue_ms: tr.preCueMs,
        lead_actual_ms: null, flash_actual_ms: null, status: null, rt_ms: null, input: null, hidden_during_trial: false };
      state.phase = 'wait';
      var isCue = tr.condition === 'cue';
      var c = await at(performance.now() + tr.preCueMs, function () { if (isCue) cue(true); });
      var onset = null, off = null;
      if (!c.early) {
        if (isCue) off = at(c.t + setting.flashMs, function () { cue(false); }, false);
        var tg = await at(c.t + setting.leadMs, function () {
          if (!tr.isCatch) { els.fix.dataset.on = 'false'; els.target.dataset.on = 'true'; }
        });
        if (!tg.early) {
          onset = tg.t; row.lead_actual_ms = r2(tg.t - c.t); state.phase = 'target';
          await Promise.race([new Promise(function (r) { state.onResponse = r; }), sleep(BASE.responseWindowMs)]);
          state.onResponse = null;
        }
        if (off) { var o = await off; row.flash_actual_ms = r2(o.t - c.t); }
      }
      state.phase = 'idle';
      els.target.dataset.on = 'false'; cue(false); els.fix.dataset.on = 'false';
      row.hidden_during_trial = state.interrupted;
      if (state.aborted) return row;
      var r = state.response;
      if (r) row.input = r.input;
      var early = r && (onset === null || r.phase === 'wait' || r.t < onset);
      if (tr.isCatch) {
        if (r) { row.status = early ? 'anticipation' : 'catch_fa'; fb('함정! 원이 안 나올 때도 있어요', 'warn'); }
        else row.status = 'catch_ok';
      } else if (early) { row.status = 'anticipation'; fb('너무 빨라요. 노란 원이 뜨면 누르세요', 'warn'); }
      else if (r) { row.status = 'ok'; row.rt_ms = r2(r.t - onset); fb(Math.round(row.rt_ms) + ' ms', 'ok'); }
      else { row.status = 'timeout'; fb('놓쳤어요', 'warn'); }
      var warn = row.status === 'anticipation' || row.status === 'catch_fa';
      await sleep(warn ? BASE.feedbackMs + 400 : BASE.feedbackMs);
      fb(''); await sleep(BASE.itiMs);
      return row;
    }

    async function run() {
      els.frame.style.setProperty('--border', setting.borderPx + 'px');
      var rows = [];
      try {
        await sleep(600);
        for (var i = 0; i < plan.length; i++) {
          if (state.aborted) break;
          if (onProgress) onProgress(i, plan.length, plan[i].block);
          var row = await trial(plan[i]);
          if (state.aborted) break;
          rows.push(row);
        }
      } finally {
        els.stage.removeEventListener('pointerdown', onPointer);
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur', onInterrupt);
      }
      return { aborted: state.aborted, trials: rows };
    }
    return { run: run, abort: function () { state.aborted = true; if (state.onResponse) state.onResponse(); } };
  }

  root.SignalRunner = { BASE: BASE, runRound: runRound, buildRound: buildRound };
})(this);
