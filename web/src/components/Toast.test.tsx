import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast, { type ToastItem } from './Toast';
import { createToastId } from '../utils/toastId';

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  test('Toast ID 생성기는 연속 호출 시 중복되지 않는다', () => {
    const idA = createToastId();
    const idB = createToastId();

    expect(idA).not.toBe(idB);
    expect(idA).toMatch(/^toast-\d+$/);
    expect(idB).toMatch(/^toast-\d+$/);
  });
});
