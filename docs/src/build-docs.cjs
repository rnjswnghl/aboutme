// 이력서·자기소개서·경력기술서 DOCX를 만든다. 과제 목록은 device/input/works.json 을 그대로 쓴다.
// node docs/src/build-docs.cjs  →  site/files/권주회_*.docx
const fs = require('fs'); const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } = require('docx');
const ROOT = path.resolve(__dirname, '..', '..');
const works = JSON.parse(fs.readFileSync(path.join(ROOT, 'device/input/works.json'), 'utf8')).works;
const OUT = path.join(ROOT, 'site/files'); fs.mkdirSync(OUT, { recursive: true });
const FONT = '맑은 고딕';
const W = 9026; // A4 본문 폭(여백 1인치)
const t = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 21, bold: o.bold, color: o.color });
const p = (text, o = {}) => new Paragraph({ children: Array.isArray(text) ? text : [t(text, o)], spacing: { after: o.after ?? 120, line: o.line || 320 }, alignment: o.align });
const h = (text) => new Paragraph({ children: [t(text, { size: 24, bold: true, color: '4D587A' })], spacing: { before: 280, after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CDD0C8', space: 4 } } });
const title = (text, sub) => [p([t(text, { size: 36, bold: true })], { after: 60 }), p([t(sub, { size: 20, color: '555A63' })], { after: 240 })];
const cell = (text, w, o = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: o.head ? { type: ShadingType.CLEAR, fill: 'E7E9E3', color: 'auto' } : undefined, margins: { top: 80, bottom: 80, left: 110, right: 110 }, children: (Array.isArray(text) ? text : [text]).map((x) => p([t(x, { bold: o.head || o.bold, size: 19 })], { after: 40, line: 280 })) });
const table = (widths, head, rows) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ tableHeader: true, children: head.map((x, i) => cell(x, widths[i], { head: true })) }), ...rows.map((r) => new TableRow({ children: r.map((x, i) => cell(x, widths[i], { bold: i === 0 })) }))] });
const doc = (children) => new Document({ styles: { default: { document: { run: { font: FONT } } } }, sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } }, children }] });
const save = async (name, d) => fs.writeFileSync(path.join(OUT, name), await Packer.toBuffer(d));

const bootcamp = [
  ['한페이지', '2025.05.22 – 05.28', '2인 · 팀장 · Full-stack', '알라딘 API 도서 데이터 수집·전처리, Django 백엔드 초기 구조, 추천·목록·상세·마이페이지·지도'],
  ['FocusMate', '2025.07.27 – 08.18', '5인 · Frontend', '스터디 생성·검색·상세, 권한별 화면. 팀장 역할이 비었을 때 진행 상황 공유와 기능 우선순위 조정을 맡고, 미완성 화면을 추가 구현하고 발표 중 연결 오류를 복구 (Vue, TypeScript, Pinia)'],
  ['On-Wear', '2025.08.25 – 09.29', '6인 · Frontend', '검색·검색 기록·목록·상세·찜, Top 버튼과 화면 구조 통일. 팀이 SSAFY 부울경 지역 1위 (React, TypeScript, Zustand)'],
  ['DALTOORI', '2025.10.30 – 11.24', '5인 · Backend·AI', '9가지 음성 평가 기준 설계, 분석 API, 순차 처리를 비동기·병렬로 개선 (FastAPI, Whisper, MeloTTS)']
];

(async () => {
  // ---------- 이력서 ----------
  await save('권주회_이력서.docx', doc([
    ...title('이력서', '권주회 · 프론트엔드 개발자'),
    h('기본 정보'),
    table([2200, 6826], ['항목', '내용'], [['이름', '권주회'], ['지원 분야', '프론트엔드 개발'], ['연락', 'GitHub github.com/rnjswnghl'], ['학력', '부산외국어대학교 러시아학 · 빅데이터학(복수전공), 2019.03 – 2025.02 졸업'],
      ['교육', 'SSAFY 13기 1년 과정 수료(2025) · ALEPH 13주 과정(2026.08 – 11)'],
      ['기타 경험', '미국 오페어 1년 — 네 아이를 돌보며 계약 기간을 마침'], ['주요 기술', 'React, Vue.js, TypeScript · 필요 시 Django, FastAPI']]),
    h('SSAFY 팀 프로젝트 (2025)'),
    table([1700, 1900, 1900, 3526], ['프로젝트', '기간', '인원·역할', '맡은 일'], bootcamp),
    h('ALEPH 13주 과정 (2026.08.11 – 11.03)'),
    p('13주 모두 아침·마무리 리추얼을 기록했습니다(55일). 끝낸 과제는 아래와 같습니다.', { after: 100 }),
    table([700, 3200, 5126], ['번호', '과제', '결과'], works.map((w) => [String(w.no), w.name, w.result]))
  ]));

  // ---------- 자기소개서 ----------
  const sop = [
    '저는 언제나 꾸준히 제자리에서 맡은 역할을 끝까지 해내는 사람입니다. 13주 동안 동료들은 여러 날에 걸쳐 제가 가장 먼저 와서 하루를 준비한다고 적어 주었습니다. 다만 그 꾸준함이 처음부터 단단했던 것은 아닙니다.',
    '2025년 5월, 두 명이 일주일 동안 만드는 도서 추천 웹 서비스 ‘한페이지’에서 저는 팀장을 맡아 알라딘 API 데이터 수집과 전처리, Django 백엔드 초기 구조, 추천·목록·상세·마이페이지·지도를 맡았습니다. 기능을 붙일 때마다 예상하지 못한 버그가 났고, 밤을 새워 고쳐도 다음 기능에서 또 다른 버그가 나왔습니다. 로그인 토큰이 추천 요청에 실리지 않아 추천이 막혔고, 병합 충돌 뒤에는 마이페이지와 도서 상세가 끊겼습니다.',
    '그 주에 저는 버그를 제 영역 안에서만 붙잡지 않고 팀원과 서로 파트를 바꿔 가며 보기 시작했습니다. 토큰 오류를 고치고 끊긴 두 화면을 다시 이었습니다. 목표 기능은 대부분 동작했지만 화면은 다 다듬지 못했고 배포도 못 했습니다. 이 경험 뒤로는 공통 화면 구조와 우선순위를 먼저 정하고 검수 시간을 따로 확보합니다.',
    '2026년 8월, 13주 과정을 시작하며 매일 아침과 저녁에 짧은 기록을 남겼습니다. 나흘째인 8월 14일 금요일, 처음으로 ‘못 했다’를 골랐습니다. 사람들 사이에서 기운을 다 써 버린 날이었습니다. 8월 18일의 첫 행동 칸에는 ‘에너지 분배 필수’라고 적었고, 그 뒤 54번의 마무리 기록에서 ‘못 했다’는 다시 나오지 않았습니다. 자기조절력은 흔들리지 않는 힘이 아니라, 흔들린 다음 날의 규칙을 먼저 세우는 힘이라고 배웠습니다.',
    '9월 8일에는 수업 중 컴퓨터를 완전히 포맷해야 했습니다. 이번에는 혼자 붙잡지 않고 팀원들의 도움을 받아 그날 진도까지 따라갔습니다. 다음 날 동료 두 명이 따로 ‘침착했다’고 적어 주었고, 저는 막히면 한 번은 주변에 묻는다는 첫 행동을 정했습니다. 한 동료는 제가 물어본 것보다 더 구체적으로 알려 주려 한다고 적었습니다. 도움을 받는 법과 주는 법이 같은 대인관계력이라는 것을 이때 알았습니다.',
    '13주 동안 과제 12개를 끝냈습니다. Burn IT는 배포 v14까지, CUT&NOTE는 v13까지 다시 고쳐 올렸고, 작업이 끊긴 인수인계 실험은 문서만으로 이어받아 고정 검사 10개를 통과했습니다. 첫 논문에서는 가설과 분석을 데이터 수집 전에 사전 등록했습니다. 같은 일이라도 이 일이 나에게 무엇을 남길지 알 때 끝까지 간다는 것이 제 자기동기력입니다.',
    '입사 후에도 사용자가 마주하는 흐름을 끝까지 확인하고, 막히는 날의 다음 행동을 먼저 정해 두는 개발자로 일하겠습니다.'
  ];
  await save('권주회_자기소개서.docx', doc([...title('자기소개서', '권주회 · 프론트엔드 개발자'), ...sop.map((s) => p(s, { line: 380, after: 200 }))]));

  // ---------- 경력기술서 ----------
  const rows = [
    ['2025 한페이지', '대인관계력', '2인 팀의 팀장으로 데이터·백엔드·추천·마이페이지를 맡았는데, 기능마다 버그가 났고 병합 충돌 뒤 마이페이지·도서 상세가 끊겼다.', '팀원과 파트를 바꿔 가며 버그를 보고, 인증 토큰 오류를 고쳐 두 화면을 다시 연결했다.', '목표 기능 대부분 동작. UI 미완성·미배포는 회고에 남겼다.'],
    ['2025 FocusMate', '대인관계력', '팀장 역할이 비면서 일부 기능 개발이 늦어져 발표에 필요한 흐름이 완성되기 어려웠다.', '직함 없이 진행 상황을 공유하고 핵심·부가 기능을 나눴다. 담당 화면을 마친 뒤 미완성 화면을 추가로 구현하고, 발표 중 연결 오류는 병합 상태와 기능 흐름을 점검해 복구했다.', '발표에 필요한 주요 흐름을 완성했다.'],
    ...works.filter((w) => w.situation).map((w) => [`${w.no}번 ${w.name}`, w.ability, w.situation, w.action, w.outcome])
  ];
  await save('권주회_경력기술서.docx', doc([
    ...title('경력기술서', '권주회 · 과제 하나당 한 줄 · 능력 · 상황 · 행동 · 결과'),
    p('능력은 자기조절력·대인관계력·자기동기력 가운데 그 과제에서 가장 크게 쓴 것 하나입니다.', { after: 160 }),
    table([1750, 1150, 2042, 2042, 2042], ['과제', '능력', '상황', '행동', '결과'], rows)
  ]));
  console.log('문서 3개 생성');
})();
