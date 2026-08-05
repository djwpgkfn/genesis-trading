export type RiskState = 'INIT' | 'READY' | 'RUN' | 'SAFE_MODE' | 'HALT' | 'RECOVERY' | 'FROZEN';

export interface TradeRequest {
  request_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  notional: number; // absolute exposure requested
}

export interface RiskDecision {
  request_id: string;
  approved: boolean;
  reason: string;
  token_id?: string;
  reservation_id?: string;
}

export interface Position { symbol: string; qty: number; notional: number }

export interface Limits {
  maxTotalExposure: number;
  maxSymbolExposure: number;
  maxDrawdownPct: number; // 0..1
  trailingPct: number;    // 0..1
}
