import { describe, it, expect } from 'vitest';
import { signUpbitJwt, verifyUpbitJwt, queryHash, toQueryString } from './jwt.js';
import { mapCandle } from './rest.js';
import { UpbitWsTransport } from './ws.js';

describe('Upbit JWT (real crypto)', () => {
  const keys = { accessKey: 'AK', secretKey: 'SK' };
  it('signs a verifiable HS256 token', () => {
    const t = signUpbitJwt(keys);
    expect(t.split('.')).toHaveLength(3);
    expect(verifyUpbitJwt(t, 'SK')).toBe(true);
    expect(verifyUpbitJwt(t, 'WRONG')).toBe(false);
  });
  it('adds SHA512 query_hash for parameterized requests', () => {
    const qs = toQueryString({ market: 'KRW-BTC', side: 'bid', ord_type: 'price', price: 10000 });
    const t = signUpbitJwt(keys, qs);
    const payload = JSON.parse(Buffer.from(t.split('.')[1]!, 'base64').toString());
    expect(payload.query_hash).toBe(queryHash(qs));
    expect(payload.query_hash).toHaveLength(128);
    expect(payload.query_hash_alg).toBe('SHA512');
  });
});

describe('Upbit REST mapping', () => {
  it('maps a candle response to the S1 Candle type', () => {
    const c = mapCandle('KRW-BTC', '1m', {
      candle_date_time_utc: '2026-07-28T00:00:00',
      opening_price: 100,
      high_price: 120,
      low_price: 90,
      trade_price: 110,
      candle_acc_trade_volume: 5,
      candle_acc_trade_price: 550,
    });
    expect(c).toMatchObject({
      symbol: 'KRW-BTC',
      tf: '1m',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      source: 'rest',
    });
  });
});

describe('Upbit WS subscription', () => {
  it('builds a well-formed subscription message', () => {
    const sub = UpbitWsTransport.subscription([{ type: 'trade', codes: ['KRW-BTC'] }]);
    expect(sub[0]).toHaveProperty('ticket');
    expect(sub[1]).toEqual({ type: 'trade', codes: ['KRW-BTC'] });
    expect(sub[sub.length - 1]).toEqual({ format: 'DEFAULT' });
  });
});
