// 채집 추천 점수. 예측이 아니라 지금 가진 데이터를 점수로 정리하는 규칙 기반 계산이다.
// 배점: 마진 40 · 마진율 15 · 시세 흐름 15 · 재고 15 · 신뢰도(최저가와 물량 기준 가격의 차이) 15
export const WEIGHTS = { margin: 40, rate: 15, trend: 15, stock: 15, trust: 15 };

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const DAY = 86400000;

/** rows: margin.json 행, series: [{t:'YYYY-MM-DD HH:MM', i, p}] */
export function recommend(rows, series) {
  const toMs = (t) => new Date(t.replace(' ', 'T') + ':00+09:00').getTime();
  const byItem = {};
  for (const e of series) (byItem[e.i] = byItem[e.i] || []).push({ t: toMs(e.t), p: e.p });

  const list = rows.map((r) => ({ r, rate: r.revenue > 0 ? r.margin / r.revenue : 0 }));
  const norm = (vals) => { const lo = Math.min(...vals), hi = Math.max(...vals); return (v) => (hi === lo ? 0.5 : (v - lo) / (hi - lo)); };
  const nm = norm(list.map((x) => x.r.margin)), nr = norm(list.map((x) => x.rate));
  const rankOf = list.map((x) => x.r.margin).sort((a, b) => b - a);

  const out = list.map(({ r, rate }) => {
    const reasons = [];
    const parts = {};

    parts.margin = nm(r.margin);
    const rank = rankOf.indexOf(r.margin) + 1;
    if (rank <= 3) reasons.push({ tone: 'good', text: `마진 ${rank}위` });
    parts.rate = nr(rate);
    if (rate >= 0.8) reasons.push({ tone: 'good', text: `마진율 ${(rate * 100).toFixed(0)}%` });

    // 시세 흐름: 최근 7일 평균보다 지금 시세가 높을수록 지금 팔기 좋다고 본다.
    const pts = (byItem[r.item] || []).sort((a, b) => a.t - b.t);
    const recent = pts.length ? pts.filter((e) => e.t >= pts[pts.length - 1].t - 7 * DAY) : [];
    if (recent.length >= 3) {
      const dev = r.price / avg(recent.map((e) => e.p)) - 1;
      parts.trend = clamp(0.5 + dev * 2.5);
      if (dev >= 0.05) reasons.push({ tone: 'good', text: `시세가 7일 평균보다 ${(dev * 100).toFixed(0)}% 높음` });
      else if (dev <= -0.05) reasons.push({ tone: 'warn', text: `시세가 7일 평균보다 ${(-dev * 100).toFixed(0)}% 낮음` });
    } else {
      parts.trend = 0.5;
      reasons.push({ tone: 'warn', text: '기록이 적어 시세 흐름은 보지 못함' });
    }

    // 재고: 읽어 온 싼 매물 수량 ÷ 한 번 채집 수량. 클수록 경쟁이 많다고 본다.
    if (r.stock != null && r.expected > 0) {
      const ratio = r.stock / r.expected;
      parts.stock = 1 - clamp(Math.log10(Math.max(ratio, 1)) / 3);
      if (ratio >= 100) reasons.push({ tone: 'warn', text: `재고 많음 (채집 ${Math.round(ratio)}회분)` });
      else if (ratio < 10) reasons.push({ tone: 'good', text: '재고 적음' });
    } else {
      parts.stock = 0.5;
    }

    // 신뢰도: 필요한 개수를 채우려면 최저가보다 얼마나 더 줘야 하는가
    const gap = r.price > 0 && r.depth > 0 ? r.depth / r.price - 1 : 0;
    parts.trust = 1 - clamp(gap / 0.5);
    if (gap > 0.15) reasons.push({ tone: 'warn', text: `최저가는 소량 매물, 물량 기준은 ${(gap * 100).toFixed(0)}% 비쌈` });

    let score = Object.entries(WEIGHTS).reduce((t, [k, w]) => t + parts[k] * w, 0);
    if (r.verified !== 'Y') { score *= 0.8; reasons.push({ tone: 'warn', text: '이번에 못 읽어 전날 값 사용' }); }
    return { item: r.item, score: Math.round(score), parts, reasons, margin: r.margin, rate };
  });
  return out.sort((a, b) => b.score - a.score);
}
