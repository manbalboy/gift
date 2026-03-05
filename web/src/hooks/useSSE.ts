import { calculateReconnectDelayMs } from '../services/reconnect';

export type SSEConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export function subscribeSSE<TPayload>({
  buildUrl,
  eventName,
  withCredentials = true,
  parse,
  onEvent,
  onError,
  onStateChange,
  onReconnectSchedule,
}: {
  buildUrl: (lastEventId: string | null) => string;
  eventName: string;
  withCredentials?: boolean;
  parse: (raw: string) => TPayload;
  onEvent: (payload: TPayload) => void;
  onError?: (event: Event) => void;
  onStateChange?: (state: SSEConnectionState) => void;
  onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
}) {
  let closedByClient = false;
  let stream: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let isConnecting = false;
  let lastEventId: string | null = null;

  const closeStream = (target?: EventSource) => {
    if (!stream) return;
    if (target && stream !== target) return;
    stream.close();
    stream = null;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer === null) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = () => {
    if (closedByClient || reconnectTimer !== null) return;
    onStateChange?.('reconnecting');
    reconnectAttempt += 1;
    const delayMs = calculateReconnectDelayMs(reconnectAttempt);
    onReconnectSchedule?.({ attempt: reconnectAttempt, delayMs });
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  };

  const connect = () => {
    if (closedByClient || isConnecting || stream) return;
    isConnecting = true;
    clearReconnectTimer();
    onStateChange?.(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const nextStream = new EventSource(buildUrl(lastEventId), { withCredentials });
    stream = nextStream;
    isConnecting = false;
    nextStream.addEventListener('open', () => {
      if (stream !== nextStream) return;
      reconnectAttempt = 0;
      onStateChange?.('connected');
      onReconnectSchedule?.({ attempt: 0, delayMs: 0 });
    });
    nextStream.addEventListener(eventName, (event) => {
      if (stream !== nextStream) return;
      const message = event as MessageEvent<string>;
      if (typeof message.lastEventId === 'string' && message.lastEventId.trim()) {
        lastEventId = message.lastEventId.trim();
      }
      onEvent(parse(message.data));
    });
    nextStream.onerror = (event) => {
      if (stream !== nextStream) return;
      onError?.(event);
      closeStream(nextStream);
      scheduleReconnect();
    };
  };

  connect();
  return () => {
    closedByClient = true;
    clearReconnectTimer();
    closeStream();
    onStateChange?.('closed');
  };
}
