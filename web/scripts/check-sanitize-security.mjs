#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const sanitizePath = path.join(root, 'src', 'utils', 'sanitize.ts');
const widgetPath = path.join(root, 'src', 'components', 'SystemAlertWidget.tsx');

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

function assertPattern(source, pattern, message, failures) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

const failures = [];
const sanitizeCode = read(sanitizePath);
const widgetCode = read(widgetPath);

assertPattern(
  sanitizeCode,
  /DOMPurify\.addHook\(['\"]uponSanitizeAttribute['\"]/, 
  'sanitize.ts: DOMPurify attribute hook 누락',
  failures,
);
assertPattern(
  sanitizeCode,
  /BLOCKED_PROTOCOL_PATTERN\s*=\s*\/\^\\s\*javascript:/,
  'sanitize.ts: javascript: 프로토콜 차단 정규식 누락',
  failures,
);
assertPattern(
  sanitizeCode,
  /FORBID_TAGS:\s*\[[^\]]*script[^\]]*iframe[^\]]*\]/s,
  'sanitize.ts: 고위험 태그 차단 설정 누락',
  failures,
);
assertPattern(
  sanitizeCode,
  /FORBID_ATTR:\s*\[[^\]]*onerror[^\]]*onload[^\]]*onclick[^\]]*\]/s,
  'sanitize.ts: 이벤트 핸들러 속성 차단 설정 누락',
  failures,
);
assertPattern(
  widgetCode,
  /sanitizeAlertText\(/,
  'SystemAlertWidget.tsx: sanitizeAlertText 적용 누락',
  failures,
);
assertPattern(
  widgetCode,
  /sanitizeAlertPath\(/,
  'SystemAlertWidget.tsx: sanitizeAlertPath 적용 누락',
  failures,
);

if (failures.length > 0) {
  console.error('[security:scan] sanitize 정적 점검 실패');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[security:scan] sanitize 정적 점검 통과');
