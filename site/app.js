// site/data/site.json(장치가 만든 파일)을 읽어 숫자·문단·과제를 채운다.
(async () => {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let data;
  try {
    const res = await fetch('data/site.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch (e) {
    document.getElementById('figures').replaceWith(el('p', 'sub', '숫자 파일을 읽지 못했습니다. 새로고침하면 다시 시도합니다.'));
    return;
  }
  const ymd = (d) => { const [y, m, dd] = d.split('-'); return `${y}년 ${+m}월 ${+dd}일`; };
  const md = (d) => { const [, m, dd] = d.split('-'); return `${+m}월 ${+dd}일`; };

  // 기록 격자: 주(열) × 월~금(행)
  const grid = document.getElementById('ledger');
  grid.style.setProperty('--weeks', data.weeks);
  const byKey = new Map(data.ledger.map((x) => [`${x.week}-${x.dow}`, x]));
  let i = 0;
  for (let w = 1; w <= data.weeks; w++) for (let dow = 1; dow <= 5; dow++) {
    const x = byKey.get(`${w}-${dow}`);
    const c = el('span', 'cell' + (x ? ' ' + x.mark : ''));
    c.style.animationDelay = `${(i++) * 12}ms`;
    c.title = x ? `${x.date} · ${x.mark === 'miss' ? '못 했다' : x.mark === 'done' ? '실천했다' : '아침만 기록'}` : '기록 없음';
    grid.append(c);
  }
  const axis = el('div', 'ledger-axis');
  axis.append(el('span', '', `1주 · ${md(data.basis.from)}`), el('span', '', `${data.weeks}주 · ${md(data.basis.to)}`));
  grid.after(axis);

  // 숫자 칸
  const dl = document.getElementById('figures');
  for (const n of data.numbers) {
    const box = el('div', 'fig' + (n.id === 'notPracticed' ? ' key' : ''));
    const v = el('dd', 'v', n.value); v.append(el('small', '', n.unit));
    box.append(el('dt', '', n.label), v, el('dd', 'how', `출처: ${n.source}. ${n.how}`));
    dl.append(box);
  }
  document.getElementById('numbers-basis').textContent = `리추얼 기록(${ymd(data.basis.from)} ~ ${ymd(data.basis.to)})과 과제 목록에서 장치가 센 숫자입니다.`;
  const miss = data.numbers.find((n) => n.id === 'notPracticed');
  const total = data.numbers.find((n) => n.id === 'practiced');
  if (miss?.scene) {
    const p = document.getElementById('pair');
    p.append(`마무리 기록 ${total.value.split('/')[1]}번 가운데 ‘못 했다’는 ${miss.value}번, ${ymd(miss.scene)} 하루입니다. 그날이 본편의 `);
    const a = el('a', '', '기가 빨린 금요일'); a.href = '#story'; p.append(a, '입니다.');
  }

  // 능력별 문단(승인된 것만)
  for (const sec of document.querySelectorAll('.ability')) {
    const ul = sec.querySelector('.lines');
    for (const p of data.paragraphs[sec.dataset.ability] || []) {
      const li = el('li');
      const d = el('span', 'd', ymd(p.date)); d.append(el('span', 'by', p.by === '동료' ? '동료의 말' : '내 기록'));
      li.append(d, p.sentence.replace(/^\d+월 \d+일, /, ''));
      ul.append(li);
    }
  }

  // 대표작
  const feat = document.getElementById('featured-list');
  for (const f of data.featured) {
    const box = el('article', 'feat' + (f.url ? '' : ' empty'));
    box.append(el('p', 'slot', f.slot), el('h3', '', f.title));
    if (f.who) box.append(el('p', 'who', f.who));
    box.append(el('p', 'status', f.status));
    const acts = el('div', 'acts');
    if (f.url) { const a = el('a', '', f.linkText || '열기'); a.href = f.url; acts.append(a); }
    if (f.repo) { const a = el('a', '', '저장소 보기'); a.href = f.repo; acts.append(a); }
    if (!f.url) acts.append(el('span', '', '완성되면 이 자리에 올립니다.'));
    box.append(acts); feat.append(box);
  }

  // 과제 목록
  const ol = document.getElementById('works-list');
  for (const w of data.works) {
    const li = el('li');
    const nm = el('span', 'nm');
    if (w.url) { const a = el('a', '', w.name); a.href = w.url; nm.append(a); } else nm.textContent = w.name;
    li.append(el('span', 'no', String(w.no)), nm, el('span', 'rs', w.result));
    ol.append(li);
  }
  document.getElementById('foot-basis').textContent = `숫자와 문단은 ${ymd(data.basis.to)}까지의 기록으로 만들었습니다.`;
})();
