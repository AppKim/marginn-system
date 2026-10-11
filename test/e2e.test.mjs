// 가짜 사이트로 크롤러를 끝까지 돌린다. 브라우저가 필요해서 E2E=1 일 때만 실행한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startMock } from './mock-server.mjs';

test('크롤러 통합 테스트', { skip: !process.env.E2E }, async () => {
  const { server, port } = await startMock();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'margin-'));
  // 전날 값이 있는 상태에서 시작한다(태양초는 이번에 못 읽는다).
  fs.writeFileSync(
    path.join(dir, 'prices.json'),
    JSON.stringify({ prices: { 태양초: { price: 180000, lowestQty: 100, depthPrice: 180000, at: '2026-10-11 06:00 KST' } } }),
  );
  const env = { ...process.env, GERINEE_BASE: `http://127.0.0.1:${port}`, DATA_DIR: dir, REQUEST_DELAY_MS: '0', NO_PROXY: '127.0.0.1,localhost' };
  // 모의 서버가 같은 프로세스에서 돌아가므로 동기 실행(spawnSync)을 쓰면 서버가 멈춘다.
  const r = await new Promise((resolve) => {
    const p = spawn('node', ['crawler/crawl.mjs'], { env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => p.kill(), 240000);
    p.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  server.close();
  console.log(r.stdout);
  console.log(r.stderr);
  assert.equal(r.status, 0);
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'margin.json'), 'utf8'));
  const by = Object.fromEntries(rows.map((x) => [x.item, x]));
  assert.equal(by['만년초'].price, 128000);
  assert.equal(by['만년초'].margin, 5688000);
  assert.equal(by['금은화'].price, 38000);
  assert.match(by['금은화'].note, /48,000/);
  assert.equal(by['화염초 + 태양초'].verified, 'N');
  assert.equal(by['화염초 + 태양초'].revenue, 7831500);
  const latest = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'));
  assert.equal(latest.errors.length, 1);
  assert.equal(latest.errors[0].item, '태양초');
  assert.ok(fs.existsSync(path.join(dir, 'debug', 'sample.json')));
});
