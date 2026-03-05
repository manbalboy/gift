import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorLogModal from './ErrorLogModal';

describe('ErrorLogModal', () => {
  test('TXT/JSON 다운로드 버튼이 Blob 내보내기를 호출한다', async () => {
    const createObjectURL = jest.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    });
    const anchorClick = jest.fn();
    const nativeCreateElement = document.createElement.bind(document);
    const createElementSpy = jest.spyOn(document, 'createElement');
    createElementSpy.mockImplementation(((tagName: string) => {
      if (tagName.toLowerCase() === 'a') {
        return {
          click: anchorClick,
          set href(_value: string) {},
          set download(_value: string) {},
        } as unknown as HTMLAnchorElement;
      }
      return nativeCreateElement(tagName);
    }) as typeof document.createElement);

    render(<ErrorLogModal title="다운로드" summary="요약" detailLines={['a', 'b']} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'TXT 다운로드' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON 다운로드' }));

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(anchorClick).toHaveBeenCalledTimes(2);
    });

    createElementSpy.mockRestore();
  });

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
    const pattern = '한글로그👨‍👩‍👧‍👦🇰🇷1️⃣-라인';
    const largeText = `${pattern}\n`.repeat(5200).trim();
    expect(largeText.length).toBeGreaterThan(100000);

    const { container } = render(
      <ErrorLogModal title="대용량 로그" summary="요약" detailLines={[largeText]} onClose={jest.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

    const logNode = container.querySelector('.error-log-detail') as HTMLElement;
    expect(logNode).toBeTruthy();
    expect(screen.getByText(/전체 .* chars/)).toBeInTheDocument();

    const parts: string[] = [];
    let guard = 0;
    while (guard < 50) {
      parts.push(logNode.textContent ?? '');
      const nextButton = screen.getByRole('button', { name: '다음 페이지' });
      if (nextButton.hasAttribute('disabled')) break;
      fireEvent.click(nextButton);
      guard += 1;
    }
    const merged = parts.join('');

    expect(merged).toBe(largeText);
    expect(merged).toContain('👨‍👩‍👧‍👦');
    expect(merged).toContain('🇰🇷');
    expect(merged).toContain('1️⃣');
  });

  test('Intl.Segmenter 미지원 환경에서도 ZWJ/국기/키캡 조합을 fallback으로 보존한다', () => {
    const originalIntl = global.Intl;
    const fallbackIntl = {
      ...originalIntl,
      Segmenter: undefined,
    } as unknown as typeof Intl;
    Object.defineProperty(global, 'Intl', {
      configurable: true,
      writable: true,
      value: fallbackIntl,
    });

    try {
      const pattern = '오류👩🏽‍💻🇺🇸2️⃣테스트';
      const largeText = `${pattern}\n`.repeat(5200).trim();
      expect(largeText.length).toBeGreaterThan(100000);

      const { container } = render(
        <ErrorLogModal title="세그멘터 없음" summary="요약" detailLines={[largeText]} onClose={jest.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));

      const logNode = container.querySelector('.error-log-detail') as HTMLElement;
      expect(logNode).toBeTruthy();

      const parts: string[] = [];
      let guard = 0;
      while (guard < 60) {
        parts.push(logNode.textContent ?? '');
        const nextButton = screen.getByRole('button', { name: '다음 페이지' });
        if (nextButton.hasAttribute('disabled')) break;
        fireEvent.click(nextButton);
        guard += 1;
      }
      const merged = parts.join('');

      expect(merged).toBe(largeText);
      expect(merged).toContain('👩🏽‍💻');
      expect(merged).toContain('🇺🇸');
      expect(merged).toContain('2️⃣');
    } finally {
      Object.defineProperty(global, 'Intl', {
        configurable: true,
        writable: true,
        value: originalIntl,
      });
    }
  });

  test('빈 로그 입력 시 No logs available 대체 텍스트를 렌더링한다', () => {
    const { container } = render(<ErrorLogModal title="빈 로그" summary="요약" detailLines={[]} onClose={jest.fn()} />);

    expect(screen.getByText('No logs available')).toBeInTheDocument();
    expect(container.querySelector('.error-log-detail')?.textContent).toContain('No logs available');
  });

  test('10만 자 이상 로그를 1초 내에 초기 렌더링한다', () => {
    const source = `LOCK_RACE_CONDITION_${'👨‍👩‍👧‍👦'}_${'A'.repeat(24)}\n`;
    const largeText = source.repeat(4200);
    expect(largeText.length).toBeGreaterThan(100000);

    const startedAt = Date.now();
    render(<ErrorLogModal title="렌더 성능" summary="요약" detailLines={[largeText]} onClose={jest.fn()} />);
    const elapsed = Date.now() - startedAt;

    expect(screen.getByRole('button', { name: '전체 보기' })).toBeInTheDocument();
    expect(elapsed).toBeLessThan(1000);
  });
});
