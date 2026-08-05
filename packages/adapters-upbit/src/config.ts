/** Secrets come from the environment ONLY (never committed). */
export interface UpbitConfig {
  accessKey: string;
  secretKey: string;
  restBase: string;
  wsUrl: string;
}
export function loadUpbitConfig(env: NodeJS.ProcessEnv = process.env): UpbitConfig {
  return {
    accessKey: env['UPBIT_ACCESS_KEY'] ?? '',
    secretKey: env['UPBIT_SECRET_KEY'] ?? '',
    restBase: env['UPBIT_REST_BASE'] ?? 'https://api.upbit.com',
    wsUrl: env['UPBIT_WS_URL'] ?? 'wss://api.upbit.com/websocket/v1',
  };
}
