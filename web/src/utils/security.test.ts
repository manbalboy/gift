import { MASKED_TOKEN, sanitizeAlertPath, sanitizeAlertText } from './security';

describe('security utils', () => {
  test('Bearer 토큰과 민감 키-값을 마스킹한다', () => {
    const input = `Bearer abc.def.ghi token=1234 password:abcd`;
    const result = sanitizeAlertText(input);
    expect(result).toContain(`Bearer ${MASKED_TOKEN}`);
    expect(result).toContain(`token=${MASKED_TOKEN}`);
    expect(result).toContain(`password=${MASKED_TOKEN}`);
  });

  test('경로 문자열에 민감 키가 포함되면 전체를 마스킹한다', () => {
    expect(sanitizeAlertPath('/tmp/apiKey/secret.txt')).toBe(MASKED_TOKEN);
    expect(sanitizeAlertPath('/tmp/logs')).toBe('/tmp/logs');
  });

  test('제어 문자를 제거한다', () => {
    const result = sanitizeAlertText('ok\u0000safe\u0008text');
    expect(result).toBe('oksafetext');
  });

  test('XSS 페이로드와 시크릿 키가 혼합된 복합 데이터도 안전하게 마스킹한다', () => {
    const payload =
      '<svg onload=alert(1)> token=abc123\u0000\u0008 password:hunter2 Bearer hello.world+123 api_key=ZZZ';
    const result = sanitizeAlertText(payload);

    expect(result).toContain('<svg onload=alert(1)>');
    expect(result).toContain(`token=${MASKED_TOKEN}`);
    expect(result).toContain(`password=${MASKED_TOKEN}`);
    expect(result).toContain(`api_key=${MASKED_TOKEN}`);
    expect(result).toContain(`Bearer ${MASKED_TOKEN}`);
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('hello.world+123');
  });
});
