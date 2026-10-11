import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findListings, summarize, expectedCount, buildRows, kstStamp, itemLink } from '../crawler/lib.mjs';

const config = JSON.parse(fs.readFileSync(new URL('../config/items.json', import.meta.url), 'utf8'));

test('획득기대값은 총 배율을 적용하고 소수 둘째 자리까지 본다', () => {
  assert.equal(expectedCount(40, 15), 46);
  assert.equal(expectedCount(30, 15), 34.5);
  assert.equal(expectedCount(50, 15), 57.5);
  assert.equal(expectedCount(20, 15), 23);
});

test('findListings: 여러 응답 모양에서 가격 낮은 순으로 돌려준다', () => {
  const spring = { content: [{ unitPrice: 130000, quantity: 5 }, { unitPrice: 128000, quantity: 132 }], totalElements: 2 };
  const nested = { data: { items: [{ price: '99,000', qty: 3 }, { price: '95,000', qty: 1 }] } };
  assert.deepEqual(findListings(spring).map((l) => l.unitPrice), [128000, 130000]);
  assert.deepEqual(findListings(nested).map((l) => l.unitPrice), [95000, 99000]);
  assert.equal(findListings(nested)[0].quantity, 1);
});

test('findListings: 빈 목록은 빈 배열, 모르는 형식은 오류', () => {
  assert.deepEqual(findListings({ content: [], totalElements: 0 }), []);
  assert.throws(() => findListings({ hello: 'world' }));
  assert.throws(() => findListings({ content: [{ name: 'x' }] }));
});

test('summarize: 최저가와 물량 기준 가격', () => {
  const l = [
    { unitPrice: 38000, quantity: 2 },
    { unitPrice: 40000, quantity: 6 },
    { unitPrice: 48000, quantity: 1932 },
  ];
  assert.deepEqual(summarize(l, 46), { price: 38000, lowestQty: 2, depthPrice: 48000 });
  assert.equal(summarize([{ unitPrice: 1, quantity: 5 }], 46).depthPrice, null);
  assert.equal(summarize([], 46), null);
});

const price = (p, q = 1000, d = p) => ({ price: p, lowestQty: q, depthPrice: d, at: '2026-10-09 07:36 KST' });
const all = {
  금은화: price(38000, 2, 48000),
  백복령: price(80000),
  만년초: price(128000),
  천상초: price(57000),
  익모초: price(130000, 14, 139000),
  착금감록초: price(33900),
  설삼: price(97000),
  바람꽃: price(94000),
  동자삼: price(99000),
  화염초: price(47000),
  태양초: price(180000),
  설련화: price(191000),
  황금연꽃: price(185000),
  백련초: price(175000),
};
const freshAll = new Set(Object.keys(all));
const stamp = kstStamp(new Date('2026-10-11T21:00:00Z'));

test('kstStamp는 한국 시간으로 적는다', () => {
  assert.equal(stamp, '2026-10-12 06:00 KST');
});

test('buildRows: 시트에서 확인한 마진과 같다', () => {
  const rows = buildRows(config, all, freshAll, stamp);
  const by = Object.fromEntries(rows.map((r) => [r.item, r]));
  assert.equal(rows.length, 13);
  assert.equal(by['만년초'].margin, 5688000);
  assert.equal(by['금은화'].margin, 1648000);
  assert.equal(by['익모초'].margin, 3985000);
  assert.equal(by['설련화'].margin, 4589500);
  assert.equal(by['착금감록초'].margin, 1449250);
  assert.equal(by['황금연꽃'].margin, 2255000);
  const g = by['화염초 + 태양초'];
  assert.equal(g.cost, 2000000);
  assert.equal(g.revenue, 7831500);
  assert.equal(g.margin, 5831500);
  assert.equal(g.verified, 'Y');
  assert.equal(by['금은화'].verified, 'Y');
  assert.match(by['금은화'].note, /2개 매물/);
  assert.match(by['금은화'].note, /48,000/);
  assert.equal(by['만년초'].note, '');
  assert.match(by['만년초'].usage, /^금색가루 재료/);
  assert.match(g.usage, /^붉은색가루 재료/);
  assert.match(by['백련초'].usage, /^오색가루 재료/);
  assert.equal(by['만년초'].link, itemLink('만년초', 3));
});

test('buildRows: 이번에 못 읽은 아이템은 전날 값으로 계산하고 미확인으로 표시', () => {
  const fresh = new Set(freshAll);
  fresh.delete('태양초');
  const rows = buildRows(config, all, fresh, stamp);
  const g = rows.find((r) => r.item === '화염초 + 태양초');
  assert.equal(g.verified, 'N');
  assert.match(g.note, /태양초은 이번에 읽지 못해/);
});

test('buildRows: 시세를 한 번도 못 읽은 아이템은 표에서 뺀다', () => {
  const partial = { ...all };
  delete partial['백련초'];
  const rows = buildRows(config, partial, new Set(Object.keys(partial)), stamp);
  assert.equal(rows.some((r) => r.item === '백련초'), false);
  assert.equal(rows.length, 12);
});
