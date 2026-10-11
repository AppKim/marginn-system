// 마진표를 비밀번호로 암호화한다. 배포되는 사이트에는 암호문만 올라간다.
import crypto from 'node:crypto';
import fs from 'node:fs';

const ITER = 200000;

export function encryptJson(text, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final(), c.getAuthTag()]); // 웹 암호화 API 형식: 암호문 뒤에 태그
  return { iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), data: enc.toString('base64') };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [src, dst] = process.argv.slice(2);
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    console.error('SITE_PASSWORD 비밀값이 없습니다. 저장소 Settings → Secrets and variables → Actions에서 추가하세요.');
    process.exit(1);
  }
  fs.writeFileSync(dst, JSON.stringify(encryptJson(fs.readFileSync(src, 'utf8'), password)));
  console.log(`암호화 완료: ${dst}`);
}
