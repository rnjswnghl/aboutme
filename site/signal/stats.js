/* 판정 규칙: 10번 논문(reflex-hub) analysis/run_analysis.py 의 PREREG v3, is_valid(), apply_exclusions(),
 * per_participant(), hodges_lehmann(), confirmatory()를 그대로 옮겼다. 숫자를 바꾸면 논문과 다른 판정이 된다.
 * 브라우저(window.SignalStats)와 Node(require) 양쪽에서 쓴다. 외부 패키지 없음. */
(function (root) {
  'use strict';

  var PREREG = {
    version: 3,
    rtMinMs: 100,            // 이보다 빠르면 자극을 보고 낸 반응으로 보기 어려움
    rtMaxMs: 1500,           // 반응 창
    minValidTotal: 10,       // 모든 판을 합쳐 유효 목표 시행 10회 미만이면 제외
    minValidPerCondition: 5, // 어느 한 조건이라도 5회 미만이면 제외
    alpha: 0.05,
    fastBand: [100, 150]     // 전략 점검: 신호에 시간을 맞춰 누른 반응이 몰리는 구간
  };

  function median(xs) {
    var a = xs.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    if (!n) return null;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  // 유효 시행(사전 등록 §3): 본 블록 목표 시행 & status ok & RT 있음 & 100 ≤ RT ≤ 1500 & 탭·포커스 이탈 없음
  function isValid(t) {
    return t.block === 'main' && !t.is_catch && t.status === 'ok' &&
      typeof t.rt_ms === 'number' && isFinite(t.rt_ms) &&
      t.rt_ms >= PREREG.rtMinMs && t.rt_ms <= PREREG.rtMaxMs && !t.hidden_during_trial;
  }

  // 한 테스터(여러 판 합침)의 조건별 중앙값과 차이. 차이가 음수면 신호가 있을 때 더 빠름.
  function perTester(trials) {
    var main = trials.filter(function (t) { return t.block === 'main'; });
    var cue = [], noc = [];
    main.forEach(function (t) {
      if (!isValid(t)) return;
      (t.condition === 'cue' ? cue : noc).push(t.rt_ms);
    });
    var out = {
      nValidCue: cue.length,
      nValidNocue: noc.length,
      medianCue: median(cue),
      medianNocue: median(noc),
      diff: null,
      excluded: null
    };
    if (cue.length + noc.length < PREREG.minValidTotal) out.excluded = '유효 시행이 10회 미만';
    else if (cue.length < PREREG.minValidPerCondition || noc.length < PREREG.minValidPerCondition)
      out.excluded = '한 조건의 유효 시행이 5회 미만';
    if (cue.length && noc.length) out.diff = out.medianCue - out.medianNocue;
    return out;
  }

  // 귀무가설에서 W+ 의 정확한 분포. P[k] = Pr(W+ = k)
  function signedRankNull(n) {
    var size = n * (n + 1) / 2 + 1;
    var counts = new Float64Array(size);
    counts[0] = 1;
    for (var r = 1; r <= n; r++) {
      for (var k = size - 1; k >= r; k--) counts[k] += counts[k - r];
    }
    var total = Math.pow(2, n);
    var p = new Array(size);
    for (var i = 0; i < size; i++) p[i] = counts[i] / total;
    return p;
  }

  function cumsum(p) {
    var c = new Array(p.length), s = 0;
    for (var i = 0; i < p.length; i++) { s += p[i]; c[i] = s; }
    return c;
  }

  // numpy.searchsorted(cdf, a, side='right')
  function searchRight(cdf, a) {
    var lo = 0, hi = cdf.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cdf[mid] <= a) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // Hodges–Lehmann 추정치(Walsh 평균의 중앙값)와 Wilcoxon 부호순위 검정에 대응하는 정확한 신뢰구간. 0인 차이는 뺀다.
  function hodgesLehmann(d, alpha) {
    d = d.filter(function (x) { return x !== 0; });
    var n = d.length;
    if (n < 1) return null;
    var walsh = [];
    for (var i = 0; i < n; i++) for (var j = i; j < n; j++) walsh.push((d[i] + d[j]) / 2);
    walsh.sort(function (x, y) { return x - y; });
    var M = walsh.length;
    var cdf = cumsum(signedRankNull(n));
    var crit = function (a) { return Math.max(searchRight(cdf, a), 1); };
    var c2 = crit(alpha / 2), c1 = crit(alpha);
    return {
      hl: median(walsh),
      ci95: [walsh[c2 - 1], walsh[M - c2]],
      upper95OneSided: walsh[M - c1],
      nNonzero: n
    };
  }

  function normCdf(z) {
    // Abramowitz–Stegun 7.1.26 (오차 1.5e-7)
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
  }

  // scipy.stats.wilcoxon(d, alternative='less', zero_method='wilcox', method='auto', correction=False)
  // auto(scipy 1.18 기준): 0을 뺀 n ≤ 50이면 정확 분포(동순위가 있어도), 51명 이상이면 정규 근사(동순위 보정).
  function wilcoxonLess(d) {
    d = d.filter(function (x) { return x !== 0; });
    var n = d.length;
    if (n < 1) return null;
    var idx = d.map(function (x, i) { return { a: Math.abs(x), s: x > 0, i: i }; })
      .sort(function (x, y) { return x.a - y.a; });
    var ranks = new Array(n), tieTerm = 0;
    for (var i = 0; i < n;) {
      var j = i;
      while (j + 1 < n && idx[j + 1].a === idx[i].a) j++;
      var r = (i + j + 2) / 2, t = j - i + 1;
      if (t > 1) tieTerm += t * t * t - t;
      for (var k = i; k <= j; k++) ranks[k] = r;
      i = j + 1;
    }
    var wPlus = 0;
    for (var q = 0; q < n; q++) if (idx[q].s) wPlus += ranks[q];
    var p, method;
    if (n <= 50) {
      // 실제 순위(동순위는 평균 순위)로 부호 2^n 가지의 W+ 분포를 정확히 센다. 순위를 2배 해 정수로 다룬다.
      var r2 = ranks.map(function (x) { return Math.round(x * 2); });
      var size = r2.reduce(function (a, b) { return a + b; }, 0) + 1;
      var cnt = new Float64Array(size);
      cnt[0] = 1;
      r2.forEach(function (v) { for (var k = size - 1; k >= v; k--) cnt[k] += cnt[k - v]; });
      var obs = Math.round(wPlus * 2), acc = 0;
      for (var z = 0; z <= obs; z++) acc += cnt[z];
      p = Math.min(1, acc / Math.pow(2, n));
      method = 'exact';
    } else {
      var mean = n * (n + 1) / 4;
      var sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieTerm / 48);
      p = normCdf((wPlus - mean) / sd);
      method = 'approx';
    }
    return { wPlus: wPlus, p: p, method: method, n: n };
  }

  // 논문 판정 규칙(사전 등록 v2~v3): 단측 Wilcoxon p < α 이고 Hodges–Lehmann 추정치 < 0 → 지지
  function verdict(diffs) {
    var d = diffs.filter(function (x) { return typeof x === 'number' && isFinite(x); });
    var n = d.length;
    var out = { n: n, supported: false };
    if (n < 2) { out.reason = 'too_few'; return out; }
    var w = wilcoxonLess(d), hl = hodgesLehmann(d, PREREG.alpha);
    if (!w || !hl) { out.reason = 'all_zero'; return out; }
    out.hl = hl.hl;
    out.ci95 = hl.ci95;
    out.p = w.p;
    out.wPlus = w.wPlus;
    out.method = w.method;
    out.kFaster = d.filter(function (x) { return x < 0; }).length;
    out.kSlower = d.filter(function (x) { return x > 0; }).length;
    out.diffMedian = median(d);
    // 0을 뺀 인원 n에서 정확 단측 p의 최솟값은 1/2^n. 이것이 α 이상이면 결과와 상관없이 규칙을 충족할 수 없다.
    out.canReachAlpha = Math.pow(0.5, w.n) < PREREG.alpha;
    out.supported = out.p < PREREG.alpha && out.hl < 0;
    return out;
  }

  // 전략 점검(논문 한계 3): 신호에 시간을 맞춰 누르면 캐치 오반응·조기 반응·100~150ms 반응이 신호 조건에 몰린다.
  function strategy(trials) {
    var r = { cue: { fa: 0, catches: 0, early: 0, fast: 0, ok: 0 }, nocue: { fa: 0, catches: 0, early: 0, fast: 0, ok: 0 } };
    trials.forEach(function (t) {
      if (t.block !== 'main') return;
      var c = r[t.condition === 'cue' ? 'cue' : 'nocue'];
      if (t.is_catch) { c.catches++; if (t.status === 'catch_fa' || t.status === 'anticipation') c.fa++; return; }
      if (t.status === 'anticipation') c.early++;
      if (isValid(t)) { c.ok++; if (t.rt_ms < PREREG.fastBand[1]) c.fast++; }
    });
    return r;
  }

  var api = {
    PREREG: PREREG, median: median, isValid: isValid, perTester: perTester,
    signedRankNull: signedRankNull, hodgesLehmann: hodgesLehmann, wilcoxonLess: wilcoxonLess,
    verdict: verdict, strategy: strategy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SignalStats = api;
})(this);
