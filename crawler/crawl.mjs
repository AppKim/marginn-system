// 거리니(gerinee) 육의전에서 아이템별 최저가를 읽어 마진표 데이터를 만든다.
// 브라우저로 페이지를 실제로 열어 세션을 받은 뒤, 페이지가 쓰는 것과 같은 요청을 보낸다.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { findListings, summarize, expectedCount, buildRows, kstStamp, kstDate } from './lib.mjs';

const BASE = (process.env.GERINEE_BASE || 'https://gerinee.com').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || 'data';
const DELAY_MS = Number(process.env.REQUEST_DELAY_MS ?? 1500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const config = JSON.parse(await fs.readFile('config/items.json', 'utf8'));
const { server, multiplierPercent } = config;

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = async (p, data) => {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
};

const now = new Date();
const stamp = kstStamp(now);
const prices = (await readJson(path.join(DATA_DIR, 'prices.json'), { prices: {} })).prices;
const fresh = new Set();
const errors = [];
let savedSample = false;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: process.env.PW_NO_SANDBOX ? ['--no-sandbox'] : [],
});
const context = await browser.newContext({ locale: 'ko-KR' });
const page = await context.newPage();

async function fetchListings(name) {
  const uiUrl = `${BASE}/trade?server=${server}&q=${encodeURIComponent(name)}&sort=UNIT_PRICE`;
  const waiting = page.waitForResponse(
    (r) => r.url().includes(`/api/trade/servers/${server}/items?`) && r.url().includes(`query=${encodeURIComponent(name)}`) && r.status() === 200,
    { timeout: 30000 },
  );
  waiting.catch(() => {}); // goto가 먼저 실패해도 처리되지 않은 오류로 프로세스가 죽지 않게 한다
  await page.goto(uiUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const seen = await waiting;
  let json = await seen.json();

  // 화면 기본 정렬이 가격순이 아닐 수 있어서, 가격 낮은 순 30건을 페이지 안에서 다시 요청한다.
  const apiUrl = new URL(seen.url());
  apiUrl.searchParams.set('sort', 'UNIT_PRICE');
  apiUrl.searchParams.set('order', 'ASC');
  apiUrl.searchParams.set('page', '1');
  apiUrl.searchParams.set('size', '30');
  const direct = await page
    .evaluate(async (u) => {
      const r = await fetch(u, { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }, apiUrl.toString())
    .catch(() => null);
  if (direct) json = direct;

  if (!savedSample) {
    savedSample = true;
    await writeJson(path.join(DATA_DIR, 'debug', 'sample.json'), { item: name, url: apiUrl.toString(), body: JSON.stringify(json).slice(0, 3000) });
  }
  return findListings(json);
}

for (const it of config.items) {
  const expected = expectedCount(it.count, multiplierPercent);
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const listings = await fetchListings(it.name);
      const s = summarize(listings, expected);
      if (!s) throw new Error('매물이 없습니다');
      prices[it.name] = { ...s, at: stamp };
      fresh.add(it.name);
      console.log(`${it.name}: 최저가 ${s.price} (${s.lowestQty}개), 물량 기준 ${s.depthPrice ?? '-'}`);
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      console.warn(`${it.name}: 시도 ${attempt} 실패 - ${e.message}`);
      await sleep(3000 * attempt);
    }
  }
  if (lastError) errors.push({ item: it.name, message: lastError.message });
  await sleep(DELAY_MS);
}

await browser.close();

if (fresh.size === 0) {
  console.error('읽은 아이템이 하나도 없어서 데이터를 바꾸지 않았습니다.');
  process.exit(1);
}

const rows = buildRows(config, prices, fresh, stamp);
await writeJson(path.join(DATA_DIR, 'prices.json'), { fetchedAt: now.toISOString(), prices });
await writeJson(path.join(DATA_DIR, 'latest.json'), { fetchedAt: now.toISOString(), fetchedAtKst: stamp, server, rows, errors });
await writeJson(path.join(DATA_DIR, 'margin.json'), rows);
await writeJson(path.join(DATA_DIR, 'history', `${kstDate(now)}.json`), rows);
console.log(`완료: ${fresh.size}개 읽음, ${errors.length}개 실패`);
