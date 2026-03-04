import { act, fireEvent, render, screen } from '@testing-library/react';
import Toast, { type ToastItem } from './Toast';

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
});
