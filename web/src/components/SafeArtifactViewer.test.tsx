import { render, screen } from '@testing-library/react';

import SafeArtifactViewer from './SafeArtifactViewer';

describe('SafeArtifactViewer', () => {
  test('마크다운은 렌더링하고 스크립트 실행 요소는 제거한다', () => {
    const payload = '## 리뷰\n**완료**\n<script>alert(1)</script>';
    const { container } = render(
      <SafeArtifactViewer content={payload} fallback="empty" className="safe-artifact-viewer" />,
    );

    expect(screen.getByRole('heading', { name: '리뷰' })).toBeInTheDocument();
    expect(screen.getByText('완료')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('alert(1)');
  });
});
