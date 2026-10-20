import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, WEIGHTS } from '../site/recommend.js';

const row = (item, o = {}) => ({ item, cost: 1000000, revenue: 4000000, margin: 3000000, price: 100000, depth: 100000, stock: 100, expected: 40, verified: 'Y', ...o });
const hist = (item, p) => [0, 1, 2, 3].map((d) => ({ t: `2026-10-1${d} 12:00`, i: item, p }));

test('배점 합계는 100', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('마진이 높을수록 점수가 높다', () => {
  const r = recommend([row('A', { margin: 5000000, revenue: 6000000 }), row('B', { margin: 1000000, revenue: 2000000 })], []);
  assert.equal(r[0].item, 'A');
  assert.ok(r[0].reasons.some((x) => /마진 1위/.test(x.text)));
});

test('재고가 매우 많으면 감점하고 이유를 보여 준다', () => {
  const r = recommend([row('A', { stock: 100 }), row('B', { stock: 100000 })], []);
  const by = Object.fromEntries(r.map((x) => [x.item, x]));
  assert.ok(by.A.score > by.B.score);
  assert.ok(by.B.reasons.some((x) => x.tone === 'warn' && /재고 많음/.test(x.text)));
});

test('최저가가 소량 매물이면 신뢰도 감점과 경고', () => {
  const r = recommend([row('A'), row('B', { depth: 160000 })], []);
  const by = Object.fromEntries(r.map((x) => [x.item, x]));
  assert.ok(by.A.score > by.B.score);
  assert.ok(by.B.reasons.some((x) => /소량 매물/.test(x.text)));
});

test('시세가 7일 평균보다 높으면 가산, 기록이 적으면 중립', () => {
  const rows = [row('A', { price: 130000 }), row('B', { price: 100000 })];
  const series = [...hist('A', 100000), ...hist('B', 100000)];
  const by = Object.fromEntries(recommend(rows, series).map((x) => [x.item, x]));
  assert.ok(by.A.parts.trend > by.B.parts.trend);
  assert.ok(by.A.reasons.some((x) => /평균보다 30% 높음/.test(x.text)));
  assert.equal(recommend(rows, [])[0].parts.trend, 0.5);
});

test('못 읽은 아이템은 감점', () => {
  const by = Object.fromEntries(recommend([row('A'), row('B', { verified: 'N' })], []).map((x) => [x.item, x]));
  assert.ok(by.A.score > by.B.score);
});
