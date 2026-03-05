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
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
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

  test('info/warning/error 타입에 맞는 타이틀을 렌더링한다', () => {
    const info: ToastItem = { id: 'toast-0', level: 'info', message: '안내 메시지' };
    const warning: ToastItem = { id: 'toast-1', level: 'warning', message: '경고 메시지' };
    const error: ToastItem = { id: 'toast-2', level: 'error', message: '오류 메시지' };
    const onClose = jest.fn();

    const { rerender } = render(<Toast item={info} onClose={onClose} />);
    expect(screen.getByText('안내')).toBeInTheDocument();
    expect(screen.getByText('안내 메시지')).toBeInTheDocument();

    rerender(<Toast item={warning} onClose={onClose} />);
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

  test('모바일에서 메시지가 실제로 넘치면 펼치기/접기 버튼으로 확장 제어할 수 있다', () => {
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
    const toggle = screen.getByRole('button', { name: '펼치기' });
    expect(toast).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toast).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(toast).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '펼치기' })).toHaveAttribute('aria-expanded', 'false');

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

  test('멀티 터치 입력은 스와이프 닫힘으로 처리하지 않는다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-multi-touch',
      level: 'warning',
      message: '멀티 터치 무시 테스트',
    };

    render(<Toast item={item} onClose={onClose} />);
    const toast = screen.getByRole('status');

    fireEvent.touchStart(toast, { touches: [{ clientX: 200, clientY: 200 }, { clientX: 210, clientY: 208 }] });
    fireEvent.touchMove(toast, { touches: [{ clientX: 340, clientY: 204 }, { clientX: 352, clientY: 208 }] });
    fireEvent.touchEnd(toast);

    expect(onClose).not.toHaveBeenCalled();
  });

  test('메시지는 React 기본 텍스트 렌더링으로 출력되어 스크립트가 렌더링되지 않는다', () => {
    const item: ToastItem = {
      id: 'toast-xss',
      level: 'error',
      message: '<img src=x onerror=alert(1)>',
    };
    const { container } = render(<Toast item={item} onClose={jest.fn()} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  test('message가 null/undefined면 빈 문자열로 안전하게 처리한다', () => {
    const onClose = jest.fn();
    const { rerender, container } = render(
      <Toast item={{ id: 'toast-null', level: 'warning', message: null }} onClose={onClose} />,
    );

    const getMessage = () => container.querySelector('.toast-message');
    expect(getMessage()).toHaveTextContent('');
    expect(screen.queryByText('null')).not.toBeInTheDocument();

    rerender(<Toast item={{ id: 'toast-undefined', level: 'error', message: undefined }} onClose={onClose} />);
    expect(getMessage()).toHaveTextContent('');
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  test('message가 number 타입이어도 문자열로 안전하게 렌더링한다', () => {
    const onClose = jest.fn();
    render(<Toast item={{ id: 'toast-number', level: 'warning', message: 404 }} onClose={onClose} />);

    expect(screen.getByText('404')).toBeInTheDocument();
  });

  test('message가 객체/배열 타입이면 JSON 문자열로 렌더링한다', () => {
    const onClose = jest.fn();
    const objectMessage = { id: 1, status: 'failed' };
    const arrayMessage = ['node-a', 'node-b'];

    const { rerender } = render(
      <Toast item={{ id: 'toast-object', level: 'error', message: objectMessage }} onClose={onClose} />,
    );
    expect(screen.getByText('{"id":1,"status":"failed"}')).toBeInTheDocument();

    rerender(<Toast item={{ id: 'toast-array', level: 'warning', message: arrayMessage }} onClose={onClose} />);
    expect(screen.getByText('["node-a","node-b"]')).toBeInTheDocument();
  });

  test('durationMs가 0이면 자동 닫힘 없이 영구 노출된다', () => {
    const onClose = jest.fn();
    const item: ToastItem = { id: 'toast-persistent', level: 'error', message: '영구 노출' };
    render(<Toast item={item} durationMs={0} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('영구 노출')).toBeInTheDocument();
  });

  test('durationMs가 음수여도 기본 지속시간으로 정규화되어 즉시 닫히지 않는다', () => {
    const onClose = jest.fn();
    const item: ToastItem = { id: 'toast-negative-duration', level: 'warning', message: 'duration 방어 테스트' };
    render(<Toast item={item} durationMs={-1} onClose={onClose} />);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onClose).toHaveBeenCalledWith('toast-negative-duration');
  });

  test('에러 토스트는 복사 버튼으로 메시지를 클립보드에 복사할 수 있다', async () => {
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-copy',
      level: 'error',
      message: '복사 대상 메시지',
    };
    render(<Toast item={item} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '메시지 복사' }));
    await act(async () => Promise.resolve());

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('복사 대상 메시지');
    expect(screen.getByRole('button', { name: '메시지 복사' })).toHaveTextContent('복사됨');
  });

  test('hover 상태에서는 자동 만료 타이머를 일시 정지하고 해제 시 재개한다', () => {
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-hover-pause',
      level: 'warning',
      message: '호버 일시 정지 테스트',
    };

    render(<Toast item={item} durationMs={1000} onClose={onClose} />);
    const toast = screen.getByRole('status');

    act(() => {
      jest.advanceTimersByTime(500);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledWith('toast-hover-pause');
  });

  test('focus 상태에서는 자동 만료 타이머를 일시 정지하고 blur 시 재개한다', () => {
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-focus-pause',
      level: 'error',
      message: '포커스 일시 정지 테스트',
    };

    render(<Toast item={item} durationMs={1000} onClose={onClose} />);
    const closeButton = screen.getByRole('button', { name: '알림 닫기' });

    act(() => {
      jest.advanceTimersByTime(400);
    });
    act(() => {
      fireEvent.focus(closeButton);
    });
    act(() => {
      jest.advanceTimersByTime(1100);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      fireEvent.blur(closeButton);
    });
    act(() => {
      jest.advanceTimersByTime(599);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledWith('toast-focus-pause');
  });

  test('터치 시작/이동 중에는 자동 만료 타이머를 일시 정지하고 touch end 이후 재개한다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const onClose = jest.fn();
    const item: ToastItem = {
      id: 'toast-touch-pause',
      level: 'warning',
      message: '터치 일시 정지 테스트',
    };

    render(<Toast item={item} durationMs={1000} onClose={onClose} />);
    const toast = screen.getByRole('status');

    act(() => {
      jest.advanceTimersByTime(400);
    });
    fireEvent.touchStart(toast, { touches: [{ clientX: 180, clientY: 220 }] });
    fireEvent.touchMove(toast, { touches: [{ clientX: 186, clientY: 222 }] });
    act(() => {
      jest.advanceTimersByTime(1200);
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.touchEnd(toast);
    act(() => {
      jest.advanceTimersByTime(599);
    });
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onClose).toHaveBeenCalledWith('toast-touch-pause');
  });

  test('모바일 스와이프 중 데스크톱 전환 시 스와이프 오프셋을 초기화한다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const item: ToastItem = {
      id: 'toast-viewport-switch',
      level: 'warning',
      message: '뷰포트 전환 테스트',
    };

    const { rerender } = render(<Toast item={item} onClose={jest.fn()} />);
    const toast = screen.getByRole('status');

    fireEvent.touchStart(toast, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchMove(toast, { touches: [{ clientX: 260, clientY: 204 }], cancelable: true });
    expect(toast).toHaveClass('toast-swipe-active');
    expect(toast.style.transform).toBe('translateX(60px)');

    mockedUseViewport.mockReturnValue({
      width: 1280,
      height: 800,
      isMobile: false,
      isPortrait: false,
      isLandscape: true,
    });
    rerender(<Toast item={item} onClose={jest.fn()} />);

    expect(toast).not.toHaveClass('toast-swipe-active');
    expect(toast.style.transform).toBe('');
  });

  test('모바일 스와이프 취소 시 복귀 transition 클래스를 적용한다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const item: ToastItem = {
      id: 'toast-swipe-rebound',
      level: 'warning',
      message: '스와이프 복귀 애니메이션 테스트',
    };

    render(<Toast item={item} onClose={jest.fn()} />);
    const toast = screen.getByRole('status');

    fireEvent.touchStart(toast, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchMove(toast, { touches: [{ clientX: 240, clientY: 204 }], cancelable: true });
    fireEvent.touchEnd(toast);

    expect(toast).toHaveClass('toast-swipe-rebound');
    expect(toast.style.transform).toBe('');
  });

  test('오버플로우 측정 시 clientWidth가 10 이하면 펼치기 버튼을 노출하지 않는다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const scrollHeightSpy = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(44);
    const clientHeightSpy = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(22);
    const clientWidthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(10);

    render(<Toast item={{ id: 'toast-width-guard', level: 'warning', message: '오버플로우 측정 가드' }} onClose={jest.fn()} />);
    expect(screen.queryByRole('button', { name: '펼치기' })).not.toBeInTheDocument();

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
    clientWidthSpy.mockRestore();
  });

  test('document.fonts 미지원 환경에서도 폴백 타이머로 오버플로우를 재측정한다', () => {
    mockedUseViewport.mockReturnValue({
      width: 390,
      height: 844,
      isMobile: true,
      isPortrait: true,
      isLandscape: false,
    });
    const originalFonts = (document as Document & { fonts?: unknown }).fonts;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: undefined,
    });
    const item: ToastItem = {
      id: 'toast-font-fallback',
      level: 'warning',
      message: '폰트 로딩 폴백 테스트',
    };
    const scrollHeightSpy = jest.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(44);
    const clientHeightSpy = jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(22);
    const clientWidthSpy = jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(220);

    const { rerender } = render(<Toast item={item} onClose={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: '펼치기' })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(520);
    });

    rerender(<Toast item={{ ...item, id: 'toast-font-fallback-2' }} onClose={jest.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-expanded', 'false');

    scrollHeightSpy.mockRestore();
    clientHeightSpy.mockRestore();
    clientWidthSpy.mockRestore();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: originalFonts,
    });
  });

  test('Toast ID 생성기는 연속 호출 시 중복되지 않는다', () => {
    const idA = createToastId();
    const idB = createToastId();

    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^toast-\d+$/);
    expect(idB).toMatch(/^toast-\d+$/);
  });
});
