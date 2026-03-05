import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorLogModal from './ErrorLogModal';

describe('ErrorLogModal', () => {
  test('로그 복사 버튼으로 상세 로그를 클립보드에 복사한다', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(
      <ErrorLogModal
        title="큐 오버플로우 상세"
        summary="요약"
        detailLines={['instruction_id: instr-001', 'reason: queue_overflow']}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '로그 복사' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('instruction_id: instr-001\nreason: queue_overflow');
    });
    await waitFor(() => {
      expect(screen.getByText('클립보드에 복사되었습니다.')).toBeInTheDocument();
    });
  });

  test('클립보드 복사 실패 시 실패 피드백을 노출한다', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText,
      },
    });

    render(
      <ErrorLogModal
        title="큐 오버플로우 상세"
        summary="요약"
        detailLines={['instruction_id: instr-001', 'reason: queue_overflow']}
        onClose={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '로그 복사' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText('복사에 실패했습니다.')).toBeInTheDocument();
    });
  });

  test('긴 로그는 기본적으로 잘라서 보여주고 전체 보기로 확장할 수 있다', () => {
    const longLine = 'A'.repeat(25000);
    render(<ErrorLogModal title="긴 로그" summary="요약" detailLines={[longLine]} onClose={jest.fn()} />);

    expect(screen.getByText(/표시 5,000 \/ 전체 25,000 chars/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 보기' })).toBeInTheDocument();
    expect(screen.getByText(/\.\.\. \(생략됨\)$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
    expect(screen.getByText('페이지 1/3 · 표시 12,000 chars · 전체 25,000 chars')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 페이지' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByText('페이지 2/3 · 표시 12,000 chars · 전체 25,000 chars')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '접기' })).toBeInTheDocument();
  });

  test('10만 자 이상 한글/ZWJ 이모지 로그를 페이지네이션해도 글자 경계가 깨지지 않는다', () => {
    const pattern = '한글로그👨‍👩‍👧‍👦-라인';
    const largeText = `${pattern}\n`.repeat(8000).trim();
    expect(largeText.length).toBeGreaterThan(100000);

    const { container } = render(
      <ErrorLogModal title="대용량 로그" summary="요약" detailLines={[largeText]} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

    const logNode = container.querySelector('.error-log-detail') as HTMLElement;
    expect(logNode).toBeTruthy();
    expect(screen.getByText(/전체 .* chars/)).toBeInTheDocument();

    let merged = '';
    let guard = 0;
    while (guard < 50) {
      merged += logNode.textContent ?? '';
      const nextButton = screen.getByRole('button', { name: '다음 페이지' });
      if (nextButton.hasAttribute('disabled')) break;
      fireEvent.click(nextButton);
      guard += 1;
    }

    expect(merged).toBe(largeText);
    expect(merged).toContain('👨‍👩‍👧‍👦');
  });

  test('빈 로그 입력 시 No logs available 대체 텍스트를 렌더링한다', () => {
    render(<ErrorLogModal title="빈 로그" summary="요약" detailLines={[]} onClose={jest.fn()} />);

    expect(screen.getByText('No logs available')).toBeInTheDocument();
    expect(screen.getByText('No logs available')).toHaveClass('error-log-detail');
  });
});
