// 거리니 사이트 흉내: 세션 쿠키를 받은 뒤에만 목록 API가 열린다. 크롤러 통합 테스트에서만 쓴다.
import http from 'node:http';

const PRICES = {
  금은화: [[2, 38000], [6, 40000], [1932, 48000]],
  백복령: [[5000, 80000], [2, 88000]],
  만년초: [[132, 128000], [2, 129000]],
  천상초: [[870, 57000], [368, 58000]],
  익모초: [[14, 130000], [50, 139000], [1251, 140000]],
  착금감록초: [[575, 33900], [133, 34000]],
  설삼: [[2, 97000], [8, 98000], [1046, 99998]],
  바람꽃: [[32, 94000], [140, 95000]],
  동자삼: [[3716, 99000], [2404, 100000]],
  화염초: [[99, 47000], [4522, 48000]],
  태양초: [], // 매물 없음: 실패 처리와 전날 값 사용을 확인한다
  설련화: [[33, 191000], [367, 192000]],
  황금연꽃: [[792, 185000], [416, 187000]],
  백련초: [[132, 175000], [30, 190000]],
};

export function startMock() {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/trade') {
      res.setHeader('Set-Cookie', 'sid=abc123; Path=/; HttpOnly');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><title>mock</title><div id=r>loading</div><script>
        const q = new URLSearchParams(location.search).get('q') || '';
        // 화면 기본 정렬은 가격순이 아니다(최신순) - 크롤러가 가격순으로 다시 요청하는지 확인한다.
        fetch('/api/trade/servers/3/items?filter=STOCK&sort=REGISTERED&order=DESC&page=1&size=10&query=' + encodeURIComponent(q), {credentials:'include'})
          .then(r => r.json()).then(j => { document.getElementById('r').textContent = 'ok ' + j.content.length; });
      </script>`);
      return;
    }
    const m = u.pathname.match(/^\/api\/trade\/servers\/3\/items$/);
    if (m) {
      if (!(req.headers.cookie || '').includes('sid=abc123')) {
        res.statusCode = 403;
        res.end('{}');
        return;
      }
      const name = u.searchParams.get('query');
      const size = Number(u.searchParams.get('size') || 10);
      let rows = (PRICES[name] || []).map(([quantity, unitPrice], i) => ({ id: i, itemName: name, quantity, unitPrice, seller: 'x' }));
      rows = u.searchParams.get('sort') === 'UNIT_PRICE' ? rows.sort((a, b) => (u.searchParams.get('order') === 'DESC' ? b.unitPrice - a.unitPrice : a.unitPrice - b.unitPrice)) : rows.reverse();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ content: rows.slice(0, size), totalElements: rows.length, page: 1 }));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}
