// 앱의 판정 코드(site/signal/stats.js)가 논문 분석 코드·scipy와 같은 값을 내는지 대조한다.
const S = require('../site/signal/stats.js');
const cases = require('./stats-cases.json');
let fail = 0;
const close = (a, b, tol) => Math.abs(a - b) <= tol;
for (const c of cases) {
  const w = S.wilcoxonLess(c.d), h = S.hodgesLehmann(c.d, 0.05);
  const ok = close(w.p, c.p, 2e-6) && w.wPlus === c.w && close(h.hl, c.hl, 1e-9) && close(h.ci95[0], c.ci[0], 1e-9) && close(h.ci95[1], c.ci[1], 1e-9);
  if (!ok) { fail++; console.log('불일치', c.d.length, w, h, c); }
}
// 유효 시행·제외 규칙
const T = (condition, rt, extra = {}) => ({ block: 'main', condition, is_catch: false, status: 'ok', rt_ms: rt, hidden_during_trial: false, ...extra });
const pt = S.perTester([T('cue', 99), T('cue', 100), T('cue', 1500), T('cue', 1501), T('cue', 300, { hidden_during_trial: true }), T('nocue', 300, { block: 'practice' })]);
if (pt.nValidCue !== 2 || pt.nValidNocue !== 0 || pt.excluded !== '유효 시행이 10회 미만') { fail++; console.log('유효 시행 정의 불일치', pt); }
const six = [...Array(6)].map((_, i) => T('cue', 300 + i)).concat([...Array(4)].map(() => T('nocue', 320)));
if (S.perTester(six).excluded !== '한 조건의 유효 시행이 5회 미만') { fail++; console.log('조건별 제외 불일치'); }
// 4명은 모두 빨라져도 정확 단측 p = 1/16 ≥ .05 → 규칙 충족 불가
const v4 = S.verdict([-20, -30, -25, -40]);
if (v4.supported || v4.canReachAlpha) { fail++; console.log('4명 판정 불일치', v4); }
const v5 = S.verdict([-20, -30, -25, -40, -10]);
if (!v5.supported || !close(v5.p, 1 / 32, 1e-12)) { fail++; console.log('5명 판정 불일치', v5); }
console.log(fail ? `실패 ${fail}건` : `통과: scipy·논문 코드 대조 ${cases.length}건, 규칙 점검 4건`);
process.exit(fail ? 1 : 0);
