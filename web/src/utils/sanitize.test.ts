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

  test('중첩 리스트와 코드 블록을 marked로 안정적으로 렌더링한다', () => {
    const html = toSafePreHtml('- a\n  - b\n\n```ts\nconst x = 1;\n```');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1;');
  });

  test('악성 마크다운 링크와 이미지 payload를 제거한다', () => {
    const html = toSafePreHtml('[x](javascript:alert(1))\n<img src=x onerror=alert(1) />');
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('onerror');
    expect(html).toContain('<img');
  });

  test('SVG 기반 위험 속성과 javascript 링크를 Hook으로 제거한다', () => {
    const html = toSafePreHtml(
      '<svg><a xlink:href="javascript:alert(1)" onbegin="alert(2)" style="color:red">x</a></svg>',
    );
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('onbegin');
    expect(html).not.toContain('style=');
  });
});
