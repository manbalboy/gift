import { escapeHtml, sanitizeArtifactText, toSafePreHtml } from './sanitize';

describe('sanitize utils', () => {
  test('HTML 특수 문자를 이스케이프한다', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('제어 문자를 제거한다', () => {
    expect(sanitizeArtifactText(`safe\u0000text\u0008`)).toBe('safetext');
  });

  test('pre 렌더링용 HTML을 안전하게 생성한다', () => {
    const html = toSafePreHtml('## 제목\n<script>alert(1)</script>\n**strong**');
    expect(html).toContain('<h2>제목</h2>');
    expect(html).toContain('<strong>strong</strong>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });
});
