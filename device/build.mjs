#!/usr/bin/env node
// 계속 새로 쓰는 장치 — 기록을 넣으면 숫자 칸과 능력별 문단 후보를 다시 만든다.
//
//   node device/build.mjs            input/ 를 읽어 out/ 과 site/data/site.json 을 다시 만든다
//   node device/build.mjs --check    결과를 만들고 해시만 출력한다(두 번 돌려 비교할 때)
//
// 같은 입력이면 같은 결과가 나온다: 시각·난수·AI 호출을 쓰지 않고, 정렬 기준을 모두 고정했다.
// 사이트에는 approved.json 에 적힌 후보만 들어간다. 후보를 고르는 일은 사람이 한다.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IN = join(ROOT, 'device', 'input');
const OUT = join(ROOT, 'device', 'out');
const SITE = join(ROOT, 'site', 'data');
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (s, n = 64) => createHash('sha256').update(s).digest('hex').slice(0, n);
const stable = (o) => JSON.stringify(o, null, 2) + '\n';

// ---------- 1. 입력 ----------
const ritual = readJSON(join(IN, 'ritual.json'));
const works = readJSON(join(IN, 'works.json'));
const approvedPath = join(IN, 'approved.json');
const approved = existsSync(approvedPath) ? readJSON(approvedPath) : { approved: [] };
const attendancePath = join(IN, 'attendance.json'); // 선택: 출석 숫자 파일이 있으면 숫자 칸에 더한다
const attendance = existsSync(attendancePath) ? readJSON(attendancePath) : null;

const days = [...ritual.days].sort((a, b) => a.date.localeCompare(b.date));
if (!days.length) throw new Error('리추얼 기록이 비어 있습니다');
const first = days[0].date, last = days.at(-1).date;

const split = (line) => {
  const i = line.indexOf(':');
  return i < 0 ? ['', line.trim()] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
};
const fields = (day) => [...(day.open || []), ...(day.close || [])].map(split);

// 다른 사람에 대한 칸은 쓰지 않는다(내가 남에게 한 말, 동료가 나눈 감사, 감사일기의 상대).
const OWN = ['내 강점', '강점이 드러난 일화', '그 결과·알게 된 점', '오늘 지킬 강점·가치', '오늘의 첫 행동', '강점을 위해 노력하고 생각한 것', '나에게 남기는 말'];
const isPeerAboutMe = (k) => /^동료 \d+가 말해 준 내 장점$/.test(k);

// ---------- 2. 숫자 칸 ----------
const dayIndex = (d) => Math.round((Date.parse(d) - Date.parse(first)) / 86400000);
const weekOf = (d) => Math.floor((dayIndex(d) + new Date(first + 'T00:00:00Z').getUTCDay() - 1) / 7) + 1; // 월요일 시작 주
const weeks = new Set(days.map((d) => weekOf(d.date)));
const totalWeeks = weekOf(last);
let practiced = 0, notPracticed = [], peerLines = 0, breath = 0, closes = 0, opens = 0;
for (const d of days) {
  if (d.open?.length) opens++;
  if (d.close?.length) closes++;
  for (const [k, v] of fields(d)) {
    if (k === '강점 행동') v.startsWith('실천') ? practiced++ : notPracticed.push(d.date);
    if (isPeerAboutMe(k) && v) peerLines++;
    if (k === '호흡') breath += parseFloat(v) || 0;
  }
}
const src = '리추얼 기록';
const numbers = {
  basis: { from: first, to: last },
  items: [
    { id: 'weeks', value: `${weeks.size}/${totalWeeks}`, unit: '주', label: '기록이 있는 주', source: src, how: `${first}이 속한 주부터 ${last}이 속한 주까지, 기록이 하루라도 있는 주를 셌다.` },
    { id: 'days', value: String(days.length), unit: '일', label: '리추얼을 남긴 날', source: src, how: `아침 ${opens}번 · 마무리 ${closes}번` },
    { id: 'practiced', value: `${practiced}/${practiced + notPracticed.length}`, unit: '번', label: '마무리에서 “실천했다”를 고른 날', source: src, how: '마무리 칸의 ‘강점 행동’ 값을 셌다.' },
    { id: 'notPracticed', value: String(notPracticed.length), unit: '일', label: '“못 했다”를 고른 날', source: src, how: `그날: ${notPracticed.join(', ') || '없음'}`, scene: notPracticed[0] || null },
    { id: 'peer', value: String(peerLines), unit: '줄', label: '동료가 말해 준 내 장점', source: src, how: '‘동료 N가 말해 준 내 장점’ 칸 중 비어 있지 않은 줄을 셌다. 이름은 원본에서 이미 가려져 있다.' },
    { id: 'works', value: String(works.works.length), unit: '개', label: '끝낸 과제', source: '과제 목록(works.json)', how: '과제 목록에 적힌 줄 수.' },
    { id: 'breath', value: breath.toFixed(1), unit: '분', label: '아침 호흡을 한 시간 합계', source: src, how: '아침 칸의 ‘호흡’ 분을 더했다.' }
  ]
};
if (attendance) numbers.items.push({ id: 'attendance', value: String(attendance.value), unit: attendance.unit || '일', label: attendance.label || '출석', source: '출석 숫자 파일(attendance.json)', how: attendance.how || '' });

// ---------- 3. 능력별 문단 후보 ----------
const ABILITIES = {
  자기조절력: ['에너지', '분배', '페이스', '속도', '침착', '차분', '회복', '흐트러', '다시 돌아', '조절', '무리', '템포', '체력'],
  대인관계력: ['경청', '들어', '공감', '소통', '대화', '알려', '도움', '물어', '공유', '배려', '다정', '괜찮냐', '설명', '고맙'],
  자기동기력: ['한 걸음', '꾸준', '미루지', '끝까지', '마지막까지', '학구열', '실천으로', '이유', '남을', '잘한 건', '날짜 전에', '성실', '대비']
};
const md = (d) => { const [, m, dd] = d.split('-'); return `${+m}월 ${+dd}일`; };
// 한 줄은 키워드가 가장 많이 맞는 능력 하나에만 들어간다(같으면 위에 적힌 능력).
const bestAbility = (v) => {
  let best = null, n = 0;
  for (const [a, ws] of Object.entries(ABILITIES)) { const c = ws.filter((w) => v.includes(w)).length; if (c > n) { best = a; n = c; } }
  return best;
};
const candidates = {};
for (const [ability, words] of Object.entries(ABILITIES)) {
  const list = [];
  for (const d of days) {
    for (const [k, v] of fields(d)) {
      const peer = isPeerAboutMe(k);
      if (!(OWN.includes(k) || peer) || !v || v.includes('(이름 가림)')) continue;
      if (bestAbility(v) !== ability) continue;
      const hit = words.filter((w) => v.includes(w));
      const quote = v.length > 90 ? v.slice(0, 89) + '…' : v;
      const sentence = peer
        ? `${md(d.date)}, 동료는 “${quote}”라고 말해 주었다.`
        : `${md(d.date)}, 나는 ‘${k}’ 칸에 “${quote}”라고 적었다.`;
      list.push({ id: sha(`${d.date}|${k}|${v}`, 8), ability, date: d.date, field: k, by: peer ? '동료' : '나', keywords: hit, score: hit.length + (peer ? 1 : 0), sentence });
    }
  }
  // 점수 높은 순 → 날짜 → id. 같은 입력이면 순서가 같다.
  list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  candidates[ability] = list.slice(0, 8);
}

// ---------- 4. 승인된 것만 사이트로 ----------
const byId = new Map(Object.values(candidates).flat().map((c) => [c.id, c]));
const unknown = (approved.approved || []).filter((id) => !byId.has(id));
const paragraphs = {};
for (const ability of Object.keys(ABILITIES)) {
  paragraphs[ability] = (approved.approved || [])
    .map((id) => byId.get(id)).filter((c) => c && c.ability === ability)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ id, date, by, sentence }) => ({ id, date, by, sentence }));
}

// 기록 격자: 하루 한 칸. 마무리에서 '못 했다'를 고른 날은 miss.
const ledger = days.map((d) => {
  const sel = fields(d).find(([k]) => k === '강점 행동');
  return { date: d.date, week: weekOf(d.date), dow: new Date(d.date + 'T00:00:00Z').getUTCDay(), mark: !sel ? 'open' : sel[1].startsWith('실천') ? 'done' : 'miss' };
});
const site = { basis: numbers.basis, weeks: totalWeeks, ledger, numbers: numbers.items, paragraphs, works: works.works, featured: works.featured };

// ---------- 5. 쓰기 ----------
const outputs = {
  [join(OUT, 'numbers.json')]: stable(numbers),
  [join(OUT, 'candidates.json')]: stable(candidates),
  [join(OUT, 'candidates.md')]: ['# 능력별 문단 후보', '', `기준: 리추얼 ${first} ~ ${last}. 사이트에 넣을 id를 device/input/approved.json 에 적으세요.`, '',
    ...Object.entries(candidates).flatMap(([a, l]) => [`## ${a}`, '', ...l.map((c) => `- \`${c.id}\` ${(approved.approved || []).includes(c.id) ? '✅' : '☐'} (${c.by}, 점수 ${c.score}) ${c.sentence}`), ''])].join('\n'),
  [join(SITE, 'site.json')]: stable(site)
};
mkdirSync(OUT, { recursive: true }); mkdirSync(SITE, { recursive: true });
for (const [p, s] of Object.entries(outputs)) writeFileSync(p, s);

const digest = sha(Object.values(outputs).join('\u0000'));
console.log(`기록 ${first} ~ ${last} · ${days.length}일 · 과제 ${works.works.length}개`);
console.log(`후보 ${Object.values(candidates).flat().length}개 · 승인 ${Object.values(paragraphs).flat().length}개${unknown.length ? ` · 후보에 없는 id ${unknown.join(',')}` : ''}`);
console.log(`결과 해시 ${digest}`);
