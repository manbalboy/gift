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
});
