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

    expect(result).not.toContain('<svg onload=alert(1)>');
    expect(result).toContain(`token=${MASKED_TOKEN}`);
    expect(result).toContain(`password=${MASKED_TOKEN}`);
    expect(result).toContain(`api_key=${MASKED_TOKEN}`);
    expect(result).toContain(`Bearer ${MASKED_TOKEN}`);
    expect(result).not.toContain('abc123');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('hello.world+123');
  });

  test('제네릭 표기(<T>, <any>)는 보존하면서 악성 태그는 제거한다', () => {
    const payload = 'result=<T> payload=<User> fallback=<any> <script>alert(1)</script>';
    const result = sanitizeAlertText(payload);

    expect(result).toContain('<T>');
    expect(result).toContain('<User>');
    expect(result).toContain('<any>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
  });

  test('비정형 중첩 스크립트 페이로드(<scr<script>ipt>)를 무해화한다', () => {
    const payload = 'before <scr<script>ipt>alert(1)</scr<script>ipt> after';
    const result = sanitizeAlertText(payload);

    expect(result).toContain('before');
    expect(result).toContain('after');
    expect(result.toLowerCase()).not.toContain('<script>');
    expect(result.toLowerCase()).not.toContain('</script>');
    expect(result).toContain('alert(1)');
  });

  test('다중 인코딩 형태의 svg/script 페이로드를 문자열 수준으로 정리한다', () => {
    const payload = '&lt;svg&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/svg&gt; token=abc123';
    const result = sanitizeAlertText(payload);

    expect(result).not.toContain('<svg>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;svg&gt;');
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).toContain(`token=${MASKED_TOKEN}`);
  });
});
