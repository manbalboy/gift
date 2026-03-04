import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast, { type ToastItem } from './Toast';
import { createToastId } from '../utils/toastId';
import { useViewport } from '../hooks/useViewport';

jest.mock('../hooks/useViewport', () => ({
  useViewport: jest.fn(),
}));

const mockedUseViewport = useViewport as jest.MockedFunction<typeof useViewport>;

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedUseViewport.mockReturnValue({
      width: 1200,
      height: 800,
      isMobile: false,
      isPortrait: false,
      isLandscape: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('warning/error 타입에 맞는 타이틀을 렌더링한다', () => {
    const warning: ToastItem = { id: 'toast-1', level: 'warning', message: '경고 메시지' };
    const error: ToastItem = { id: 'toast-2', level: 'error', message: '오류 메시지' };
    const onClose = jest.fn();

    const { rerender } = render(<Toast item={warning} onClose={onClose} />);
    expect(screen.getByText('경고')).toBeInTheDocument();
    expect(screen.getByText('경고 메시지')).toBeInTheDocument();

    rerender(<Toast item={error} onClose={onClose} />);
    expect(screen.getByText('오류')).toBeInTheDocument();
    expect(screen.getByText('오류 메시지')).toBeInTheDocument();
  });

  test('3초 후 자동으로 닫힘 콜백을 호출한다', () => {
    const item: ToastItem = { id: 'toast-99', level: 'error', message: '자동 닫힘 테스트' };
    const onClose = jest.fn();
    render(<Toast item={item} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(onClose).toHaveBeenCalledWith('toast-99');
  });

  test('닫기 버튼 클릭 시 즉시 닫힘 콜백을 호출한다', () => {
    const item: ToastItem = { id: 'toast-5', level: 'warning', message: '수동 닫힘 테스트' };
    const onClose = jest.fn();
    render(<Toast item={item} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));

    expect(onClose).toHaveBeenCalledWith('toast-5');
  });

  test('자동 만료와 수동 닫힘이 겹쳐도 onClose는 한 번만 호출된다', () => {
    const item: ToastItem = { id: 'toast-race', level: 'error', message: '경합 방어 테스트' };
    const onClose = jest.fn();
    render(<Toast item={item} durationMs={1000} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('toast-race');
  });

  test('액션 버튼 클릭 시 콜백 실행 후 알림이 닫힌다', () => {
    const action = jest.fn();
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-action',
      level: 'warning',
      message: '노드 이동 안내',
      action: {
        label: '해당 노드로 이동',
        onClick: action,
      },
    };
    render(<Toast item={item} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '해당 노드로 이동' }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('toast-action');
  });

  test('모바일 뷰포트에서는 액션 버튼을 숨긴다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const item: ToastItem = {
      id: 'toast-mobile-action',
      level: 'warning',
      message: '모바일 액션 숨김 테스트',
      action: {
        label: '해당 노드로 이동',
        onClick: jest.fn(),
      },
    };

    render(<Toast item={item} onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: '해당 노드로 이동' })).not.toBeInTheDocument();
  });

  test('모바일에서 메시지가 실제로 넘치면 탭으로 확장/축소할 수 있다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const scrollHeightSpy = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(44);
    const clientHeightSpy = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(22);
    const clientWidthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(220);

    const item: ToastItem = {
      id: 'toast-expand',
      level: 'error',
      message: '길이가 짧아도 실제 줄바꿈이 발생하는 메시지',
    };

    render(<Toast item={item} onClose={jest.fn()} />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toast);
    expect(toast).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toast);
    expect(toast).toHaveAttribute('aria-expanded', 'false');

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
    clientWidthSpy.mockRestore();
  });

  test('모바일에서 좌우 스와이프 임계값을 넘기면 알림이 닫힌다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-swipe',
      level: 'warning',
      message: '스와이프 제스처 테스트',
    };

    render(<Toast item={item} onClose={onClose} />);
    const toast = screen.getByRole('status');

    fireEvent.touchStart(toast, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchMove(toast, {
      touches: [{ clientX: 320, clientY: 204 }],
      cancelable: true,
    });
    fireEvent.touchEnd(toast);

    expect(onClose).toHaveBeenCalledWith('toast-swipe');
  });

  test('Toast ID 생성기는 연속 호출 시 중복되지 않는다', () => {
    const idA = createToastId();
    const idB = createToastId();

    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^toast-\d+$/);
    expect(idB).toMatch(/^toast-\d+$/);
  });
});
