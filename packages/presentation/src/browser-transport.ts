// Transport abstraction for the browser edge. No DOM/node import — a real WebSocket is bridged
// structurally, so this stays browser-safe, dependency-free, and testable with a mock.
export interface BrowserTransport {
  send(data: string): void;
  onMessage(handler: (data: string) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}

/** Minimal structural shape of a browser WebSocket (no `lib.dom` dependency). */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

/** WebSocket Event Bridge: adapt any WebSocket-like object to a BrowserTransport. */
export function createWebSocketTransport(ws: WebSocketLike): BrowserTransport {
  return {
    send: (data) => ws.send(data),
    onMessage: (handler) => {
      ws.onmessage = (ev) => handler(ev.data);
    },
    onClose: (handler) => {
      ws.onclose = () => handler();
    },
    close: () => ws.close(),
  };
}
