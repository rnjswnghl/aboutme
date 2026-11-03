# aboutme · 나를 소개하는 사이트와 계속 새로 쓰는 장치

ALEPH 마지막 과제 A. 처음 온 사람이 3분 안에 읽고 함께 일하고 싶어지는 공개 사이트와, 새 기록을 넣으면 사이트의 숫자와 문단 후보를 다시 만드는 장치입니다.

- 공개 사이트: https://aboutme-rnjswnghl.vercel.app (로그인 없음)
- 사이트 원본: `site/` (정적 HTML·CSS·JS, Vercel outputDirectory)
- 장치: `device/build.mjs` (Node 18 이상, 설치할 패키지 없음, AI 호출 없음)
- 문서: `site/files/` 의 이력서·자기소개서·경력기술서 DOCX (`docs/src/build-docs.cjs` 로 생성)

## 장치 돌리는 방법 (세 단계)

1. **입력 넣기** — `device/input/` 에 새 파일을 덮어씁니다.
   - `ritual.json` 리추얼 기록 내보내기 파일
   - `works.json` 과제 목록(과제를 끝내면 한 줄 추가)
   - `attendance.json` (선택) 출석 숫자 `{ "value": 60, "unit": "일", "label": "출석", "how": "…" }`
2. **돌리기** — 저장소 맨 위에서 `node device/build.mjs` 를 실행합니다.
   숫자 칸(`device/out/numbers.json`)과 능력별 문단 후보(`device/out/candidates.md`)가 다시 만들어집니다. 후보마다 날짜·근거 칸·누가 쓴 말인지가 붙습니다.
3. **승인하고 다시 돌리기** — `candidates.md` 에서 사이트에 넣을 후보의 id를 `device/input/approved.json` 의 `approved` 에 적고 `node device/build.mjs` 를 한 번 더 실행합니다. 승인한 문장만 `site/data/site.json` 으로 들어가고, 사이트가 그 파일을 읽습니다. push하면 Vercel이 다시 배포합니다.

마지막 줄의 `결과 해시`가 같으면 결과도 같습니다. 같은 입력을 두 번 돌리면 같은 해시가 나옵니다(시각·난수·AI를 쓰지 않음).

## 확인

```bash
node device/build.mjs            # 결과 해시 확인
node device/build.mjs            # 같은 해시가 다시 나와야 통과
```

`device/out/run-1.txt`, `run-2.txt` 는 새 임시 폴더에서 README대로 두 번 돌린 출력입니다.

## 개인정보

- 리추얼 원본은 동료 이름이 이미 `(이름 가림)` 처리된 내보내기 파일입니다. 장치는 ‘동료 N가 말해 준 내 장점’과 내 칸만 읽고, `(이름 가림)`이 들어간 줄은 후보에서 뺍니다.
- 연락 수단은 GitHub 하나만 공개합니다. 비밀번호·토큰·API 키는 없습니다.
