# marginn-system

거상 현무 서버 육의전 시세를 매일 읽어 채집 마진표를 만드는 저장소입니다.

## 동작

1. 매일 06시, 12시, 20시 20분 무렵(한국 시간)에 GitHub Actions가 `crawler/crawl.mjs`를 실행합니다.
2. 브라우저(Playwright)로 [거리니 육의전](https://gerinee.com/trade?server=3)을 열어 세션을 받은 뒤, 페이지가 쓰는 것과 같은 요청으로 아이템별 매물을 가격 낮은 순으로 읽습니다.
3. 개당 최저가에 획득기대값을 곱하고 채집비용을 빼서 마진을 계산합니다.
4. 결과를 `data/`에 저장하고 커밋합니다.

## 웹페이지

매일 시세를 저장한 뒤 `site/index.html`과 `data/margin.json`을 비밀번호로 암호화한 `margin.enc.json`을 GitHub Pages에 올립니다. 비밀번호는 저장소 Settings → Secrets and variables → Actions의 `SITE_PASSWORD`에 넣어 둔 값입니다. 저장소가 공개라서 `data/` 폴더의 원본은 누구나 볼 수 있다는 점은 그대로입니다.
주소는 https://appkim.github.io/marginn-system/ 이며, 저장소 설정의 Pages에서 Source를 `GitHub Actions`로 바꿔 두어야 합니다.

## 파일

| 경로 | 내용 |
|---|---|
| `config/items.json` | 아이템별 수집처, 채집비용, 획득수, 총 배율. 값이 바뀌면 여기를 고칩니다. |
| `data/series.json` | 갱신할 때마다 한 줄씩 쌓는 시세 기록 (그래프용). 2026-10-12 이후 기록 |
| `data/margin.json` | 최신 마진표 행 목록 (웹페이지가 읽는 파일) |
| `data/latest.json` | 마진표와 읽기 실패 목록 |
| `data/prices.json` | 아이템별 마지막으로 읽은 시세. 읽기에 실패한 날 전날 값을 쓰기 위해 보관합니다. |
| `data/history/날짜.json` | 날짜별 마진표 기록 |
| `data/debug/sample.json` | 매물 목록 응답의 앞부분 (형식이 바뀌었을 때 확인용) |
| `site/index.html` | 마진표 웹페이지 |

## 계산 방식

- 획득기대값 = 획득수 × (1 + 총 배율)
- 예상 판매가 = 획득기대값 × 개당 최저가
- 마진 = 예상 판매가 − 채집비용 (육의전 수수료와 세금은 빼지 않습니다)
- 화염초와 태양초는 같은 수집처에서 함께 나오므로 채집비용 한 번에 두 아이템 판매가를 더합니다.
- 최저가 매물 수량이 획득기대값보다 적으면 비고에 "물량 기준" 가격을 함께 적습니다.
- 이번에 읽지 못한 아이템은 전날 값으로 계산하고 `verified: "N"`으로 표시합니다.

## 직접 실행

```bash
npm install
npx playwright install chromium
npm test            # 계산 테스트
node crawler/crawl.mjs
```

통합 테스트(가짜 사이트로 크롤러 전체를 돌림)는 `E2E=1 npm test`로 실행합니다.

## 자주 생기는 문제

- **Actions가 실패함**: Actions 탭에서 실행 기록을 열어 오류를 확인합니다. 사이트의 응답 형식이 바뀌면 `data/debug/sample.json`을 보고 `crawler/lib.mjs`의 `findListings`를 고칩니다.
- **자동 실행이 멈춤**: 저장소에 60일 동안 활동이 없으면 GitHub이 예약 실행을 끌 수 있습니다. Actions 탭에서 다시 켜면 됩니다.
