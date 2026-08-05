/** Transport abstraction so the collector is testable with a fake and bindable to Upbit. */
export interface WsMessage { data: unknown; received_ms: number }

export interface WsTransport {
  connect(): Promise<void>;
  subscribe(payload: unknown): Promise<void>;
  onMessage(cb: (m: WsMessage) => void): void;
  onClose(cb: () => void): void;
  close(): Promise<void>;
}
