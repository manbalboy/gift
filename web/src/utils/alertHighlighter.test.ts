import { parseAlertTextParts } from './alertHighlighter';

describe('parseAlertTextParts', () => {
  test('url과 티켓을 분리 파싱한다', () => {
    const parts = parseAlertTextParts('가이드 https://docs.example.com/runbook, 티켓 OPS-412 확인');
    expect(parts).toEqual([
      { kind: 'text', value: '가이드 ' },
      { kind: 'url', value: 'https://docs.example.com/runbook', href: 'https://docs.example.com/runbook' },
      { kind: 'text', value: ',' },
      { kind: 'text', value: ' 티켓 ' },
      { kind: 'ticket', value: 'OPS-412', href: 'https://github.com/search?type=issues&q=OPS-412' },
      { kind: 'text', value: ' 확인' },
    ]);
  });

  test('http/https 외 프로토콜은 링크 처리하지 않는다', () => {
    const parts = parseAlertTextParts('bad javascript:alert(1)');
    expect(parts).toEqual([{ kind: 'text', value: 'bad javascript:alert(1)' }]);
  });

  test('URL 후행의 다중 구두점과 괄호를 분리해 파싱한다', () => {
    const parts = parseAlertTextParts('(참고: http://test.com/api?v=1.0.), 다음 단계 확인');
    expect(parts).toEqual([
      { kind: 'text', value: '(참고: ' },
      { kind: 'url', value: 'http://test.com/api?v=1.0', href: 'http://test.com/api?v=1.0' },
      { kind: 'text', value: '.),' },
      { kind: 'text', value: ' 다음 단계 확인' },
    ]);
  });
});
