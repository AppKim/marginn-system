import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson } from '../crawler/encrypt.mjs';

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));
// 사이트 페이지가 쓰는 것과 같은 방식(웹 암호화 API)으로 푼다.
async function decrypt(box, password) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(box.salt), iterations: box.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(box.iv) }, key, b64(box.data));
  return new TextDecoder().decode(buf);
}

test('암호화한 마진표는 맞는 비밀번호로만 풀린다', async () => {
  const text = JSON.stringify([{ item: '만년초', margin: 5688000 }]);
  const box = encryptJson(text, '비밀번호1');
  assert.equal(await decrypt(box, '비밀번호1'), text);
  await assert.rejects(decrypt(box, '틀린비번'));
  assert.ok(!JSON.stringify(box).includes('만년초'));
});
