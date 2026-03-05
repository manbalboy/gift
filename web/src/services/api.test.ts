import { calculateReconnectDelayMs } from './reconnect';

describe('calculateReconnectDelayMs', () => {
  test('시도 횟수에 따라 지수 백오프가 증가한다', () => {
    const first = calculateReconnectDelayMs(1, 0);
    const second = calculateReconnectDelayMs(2, 0);
    const third = calculateReconnectDelayMs(3, 0);
    const fourth = calculateReconnectDelayMs(4, 0);

    expect(first).toBe(1000);
    expect(second).toBe(2000);
    expect(third).toBe(4000);
    expect(fourth).toBe(8000);
  });

  test('최대 딜레이 상한(8000ms)을 적용한다', () => {
    const nearCapLow = calculateReconnectDelayMs(10, 0);
    const nearCapHigh = calculateReconnectDelayMs(10, 1);

    expect(nearCapLow).toBe(8000);
    expect(nearCapHigh).toBe(8000);
  });

  test('비정상 random 값이어도 안전한 기본 딜레이를 유지한다', () => {
    const low = calculateReconnectDelayMs(1, -100);
    const high = calculateReconnectDelayMs(1, 100);
    const nan = calculateReconnectDelayMs(1, Number.NaN);

    expect(low).toBe(1000);
    expect(high).toBe(1000);
    expect(nan).toBe(1000);
  });
});
