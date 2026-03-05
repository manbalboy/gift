import { fireEvent, render, screen } from '@testing-library/react';
import SafeArtifactViewer from './SafeArtifactViewer';

describe('SafeArtifactViewer', () => {
  test('일반 크기 아티팩트는 마크다운 HTML로 렌더링한다', () => {
    render(<SafeArtifactViewer content={'## 제목\n**본문**'} fallback="fallback" />);
    expect(screen.getByRole('article')).toContainHTML('<h2>제목</h2>');
    expect(screen.getByRole('article')).toContainHTML('<strong>본문</strong>');
  });

  test('대용량 아티팩트는 가상화 모드로 렌더링한다', () => {
    const longLines = Array.from({ length: 30000 }, (_, idx) => `line-${idx}`).join('\n');
    render(<SafeArtifactViewer content={longLines} fallback="fallback" className="safe-artifact-viewer" />);

    expect(screen.getByText(/대용량 아티팩트 감지/)).toBeInTheDocument();
    const scroller = document.querySelector('.artifact-virtualized-scroll') as HTMLElement;
    expect(scroller).toBeTruthy();
    fireEvent.scroll(scroller, { target: { scrollTop: 1200 } });
    expect(screen.getByText(/line-/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 결과' })).toBeInTheDocument();
  });

  test('대용량 검색 결과 이동 시 활성 하이라이트를 유지하고 스크롤 좌표를 갱신한다', () => {
    const content = Array.from({ length: 20000 }, (_, idx) => (idx % 600 === 0 ? `match-here-${idx}` : `line-${idx}`)).join('\n');
    render(<SafeArtifactViewer content={content} fallback="fallback" className="safe-artifact-viewer" />);

    fireEvent.change(screen.getByRole('textbox', { name: '뷰어 내 검색' }), { target: { value: 'match' } });
    const scroller = document.querySelector('.artifact-virtualized-scroll') as HTMLElement;
    expect(scroller).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음 결과' }));

    expect(document.querySelectorAll('mark.artifact-highlight-active').length).toBeGreaterThan(0);
    expect(scroller.scrollTop).toBeGreaterThan(0);
  });

  test('뷰어 내 검색 입력 시 하이라이트와 매치 개수를 표시한다', () => {
    render(<SafeArtifactViewer content={'alpha beta alpha'} fallback="fallback" />);
    fireEvent.change(screen.getByRole('textbox', { name: '뷰어 내 검색' }), { target: { value: 'alpha' } });

    expect(screen.getByText('2 matches')).toBeInTheDocument();
    expect(document.querySelectorAll('mark.artifact-highlight').length).toBeGreaterThan(0);
  });

  test('추가 청크가 있을 때 다음 청크 버튼을 노출하고 클릭 콜백을 호출한다', () => {
    const onLoadMore = jest.fn();
    render(
      <SafeArtifactViewer
        content={'small content'}
        fallback="fallback"
        hasMore
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '다음 청크 로딩' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
