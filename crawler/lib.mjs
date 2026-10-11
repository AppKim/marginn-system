// 시세 파싱과 마진 계산. 네트워크를 쓰지 않는 순수 함수만 둔다.

const PRICE_KEYS = ['unitPrice', 'unit_price', 'pricePerUnit', 'perPrice', 'price'];
const QTY_KEYS = ['quantity', 'qty', 'stock', 'amount', 'count'];

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/,/g, '')))) return Number(v.replace(/,/g, ''));
  }
  return null;
};

/** 응답 JSON 안에서 "개당 가격이 들어 있는 객체 배열"을 찾아 가격 오름차순으로 돌려준다. */
export function findListings(json) {
  const arrays = [];
  const walk = (v, depth) => {
    if (depth > 5 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if (v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) arrays.push(v);
      v.slice(0, 1).forEach((x) => walk(x, depth + 1));
      return;
    }
    Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(json, 0);

  for (const arr of arrays) {
    if (pick(arr[0], PRICE_KEYS) === null) continue;
    const listings = arr
      .map((o) => ({ unitPrice: pick(o, PRICE_KEYS), quantity: pick(o, QTY_KEYS) ?? 1 }))
      .filter((l) => l.unitPrice !== null && l.unitPrice > 0)
      .sort((a, b) => a.unitPrice - b.unitPrice);
    return listings;
  }
  // 매물이 하나도 없는 정상 응답(빈 배열)은 빈 목록으로 본다.
  if (arrays.length === 0 && hasEmptyArray(json)) return [];
  throw new Error('매물 목록 형식을 알 수 없습니다');
}

const hasEmptyArray = (v, depth = 0) => {
  if (depth > 4 || v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.length === 0;
  return Object.values(v).some((x) => hasEmptyArray(x, depth + 1));
};

/** 최저가, 최저가 매물 수량, 필요한 수량을 채우는 데 드는 가격(물량 기준)을 구한다. */
export function summarize(listings, expected) {
  if (!listings.length) return null;
  const lowest = listings[0];
  let sum = 0;
  let depthPrice = null;
  for (const l of listings) {
    sum += l.quantity;
    if (sum >= expected) {
      depthPrice = l.unitPrice;
      break;
    }
  }
  return { price: lowest.unitPrice, lowestQty: lowest.quantity, depthPrice };
}

export const round2 = (n) => Math.round(n * 100) / 100;
export const expectedCount = (count, pct) => round2(count * (1 + pct / 100));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const itemLink = (name, server) =>
  `https://gerinee.com/trade?server=${server}&q=${encodeURIComponent(name)}&sort=UNIT_PRICE`;

export function kstStamp(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}

export const kstDate = (date = new Date()) => kstStamp(date).slice(0, 10);

/**
 * prices: { 이름: { price, lowestQty, depthPrice, at } }  (at: 가져온 시각 문자열)
 * freshNames: 이번 실행에서 새로 읽은 아이템 이름 집합
 */
export function buildRows(config, prices, freshNames, stamp) {
  const { items, multiplierPercent: pct, server } = config;
  const units = [];
  const seen = new Set();
  for (const it of items) {
    if (it.group) {
      if (seen.has(it.group)) continue;
      seen.add(it.group);
      units.push(items.filter((x) => x.group === it.group));
    } else {
      units.push([it]);
    }
  }

  const rows = [];
  for (const members of units) {
    const known = members.filter((m) => prices[m.name]);
    if (known.length === 0) continue; // 시세를 한 번도 못 읽은 아이템은 표에 넣지 않는다

    const first = members[0];
    const cost = members.reduce((s, m) => s + m.cost, 0);
    const expectedFirst = expectedCount(first.count, pct);
    let revenue = 0;
    const notes = [];
    let verified = known.length === members.length;

    for (const m of members) {
      const p = prices[m.name];
      const exp = expectedCount(m.count, pct);
      if (!p) {
        verified = false;
        notes.push(`${m.name} 시세를 읽지 못해 계산에서 뺐어요`);
        continue;
      }
      revenue += Math.round(p.price * exp);
      if (!freshNames.has(m.name)) {
        verified = false;
        notes.push(`${m.name}은 이번에 읽지 못해 ${p.at} 값을 썼어요`);
      } else if (p.depthPrice && p.lowestQty < exp && p.depthPrice > p.price) {
        notes.push(`${members.length > 1 ? m.name + ' ' : ''}최저가는 ${fmt(p.lowestQty)}개 매물이에요. 물량 기준은 ${fmt(p.depthPrice)}`);
      }
    }
    if (members.length > 1) {
      const detail = members.map((m) => (prices[m.name] ? `${m.name} ${fmt(prices[m.name].price)}` : `${m.name} 없음`)).join(', ');
      notes.unshift(`개당 최저가: ${detail}`);
    }

    rows.push({
      item: members.map((m) => m.name).join(' + '),
      place: first.place,
      cost,
      expected: expectedFirst,
      price: prices[first.name]?.price ?? 0,
      revenue,
      margin: revenue - cost,
      verified: verified ? 'Y' : 'N',
      note: notes.join('. '),
      usage: first.usage ?? '',
      link: itemLink(first.name, server),
      fetched_at: stamp,
    });
  }
  return rows;
}
