import { calculateReconnectDelayMs } from './reconnect';

describe('calculateReconnectDelayMs', () => {
  test('시도 횟수에 따라 지수 백오프가 증가한다', () => {
    const first = calculateReconnectDelayMs(1, 0);
    const second = calculateReconnectDelayMs(2, 0);
    const third = calculateReconnectDelayMs(3, 0);

    expect(first).toBe(375);
    expect(second).toBe(750);
    expect(third).toBe(1500);
  });

  test('최대 딜레이 상한(8000ms)과 jitter 범위를 적용한다', () => {
    const nearCapLow = calculateReconnectDelayMs(10, 0);
    const nearCapHigh = calculateReconnectDelayMs(10, 1);

    expect(nearCapLow).toBe(6000);
    expect(nearCapHigh).toBe(8000);
  });

  test('비정상 random 값은 안전하게 보정한다', () => {
    const low = calculateReconnectDelayMs(1, -100);
    const high = calculateReconnectDelayMs(1, 100);
    const nan = calculateReconnectDelayMs(1, Number.NaN);

    expect(low).toBe(375);
    expect(high).toBe(625);
    expect(nan).toBe(500);
  });
});
