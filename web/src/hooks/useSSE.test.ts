import { subscribeSSE } from './useSSE';

type Listener = (event: Event) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: ((event: Event) => void) | null = null;

  private listeners = new Map<string, Listener[]>();

  constructor(_url: string, _init?: EventSourceInit) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn: Listener =
      typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
    const current = this.listeners.get(type) ?? [];
    current.push(fn);
    this.listeners.set(type, current);
  }

  emit(type: string, event: Event) {
    const current = this.listeners.get(type) ?? [];
    for (const listener of current) {
      listener(event);
    }
  }

  close() {
    // noop
  }
}

describe('subscribeSSE', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    Object.defineProperty(window, 'EventSource', {
      writable: true,
      value: MockEventSource,
    });
  });

  test('중복/역순 event id를 무시하고 증가하는 id만 처리한다', () => {
    const received: number[] = [];
    const unsubscribe = subscribeSSE<{ value: number }>({
      buildUrl: () => '/sse',
      eventName: 'run_status',
      parse: (raw) => JSON.parse(raw) as { value: number },
      onEvent: (payload) => {
        received.push(payload.value);
      },
    });

    const stream = MockEventSource.instances[0];
    stream.emit('open', new Event('open'));

    const e1 = new MessageEvent('run_status', { data: JSON.stringify({ value: 1 }), lastEventId: '1' });
    const e2dup = new MessageEvent('run_status', { data: JSON.stringify({ value: 2 }), lastEventId: '1' });
    const e3 = new MessageEvent('run_status', { data: JSON.stringify({ value: 3 }), lastEventId: '3' });
    const e2late = new MessageEvent('run_status', { data: JSON.stringify({ value: 4 }), lastEventId: '2' });

    stream.emit('run_status', e1);
    stream.emit('run_status', e2dup);
    stream.emit('run_status', e3);
    stream.emit('run_status', e2late);

    expect(received).toEqual([1, 3]);
    unsubscribe();
  });
});
