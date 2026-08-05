import type { SessionView } from '@genesis/presentation';

// Placeholder recording for the read-only viewer. Real SessionView is produced by the
// runtime/application layer (T3/T4) and injected; the dashboard only consumes the DTO.
const mkFrame = (i: number, action: string, color: string, price: number): SessionView['frames'][number] => ({
  index: i,
  market: { symbol: 'KRW-BTC', timeframe: '1m', price, candle_time: new Date(i * 60000).toISOString() },
  signals: [
    { name: 'TREND_UP', direction: 'BUY', confidence_pct: '80%', strength_pct: '70%', source: ['slope'], timestamp_ms: i * 60000 },
    { name: 'MACD_BULLISH', direction: 'BUY', confidence_pct: '72%', strength_pct: '55%', source: ['macd'], timestamp_ms: i * 60000 },
  ],
  strategy: { active: 'momentum', selected: ['momentum', 'trend-following'], scores: [
    { name: 'momentum', score: '1.42', confidence_pct: '47%', reason: ['TREND_UP', 'MACD_BULLISH'] },
    { name: 'trend-following', score: '1.10', confidence_pct: '37%', reason: ['TREND_UP'] },
  ] },
  decision: {
    action, action_color: color, confidence_pct: '72%', expected_risk_pct: '40%', expected_reward_pct: '80%',
    rr_ratio: '2.00', position_size_display: '— (requires Risk/Portfolio, I4)', reason: `${action} via momentum`,
  },
  explainability: { action, confidence_pct: '72%', chain: [
    { stage: 'decision', detail: action, refs: [`${action} via momentum`] },
    { stage: 'strategy', detail: 'momentum (score 1.42)', refs: ['TREND_UP', 'MACD_BULLISH'] },
    { stage: 'signals', detail: '2 signals', refs: ['TREND_UP@'] },
    { stage: 'features', detail: '2 basis features', refs: ['slope', 'macd'] },
    { stage: 'confidence', detail: '72%', refs: ['net=1.62'] },
  ] },
});

export const SESSION: SessionView = {
  frames: [mkFrame(0, 'BUY', 'green', 91_500_000), mkFrame(1, 'HOLD', 'amber', 91_540_000), mkFrame(2, 'BUY', 'green', 91_620_000)],
  history: [
    { decision_id: 'decision-0', frame_index: 0, timestamp_ms: 0, action: 'BUY', confidence_pct: '72%' },
    { decision_id: 'decision-1', frame_index: 1, timestamp_ms: 60000, action: 'HOLD', confidence_pct: '61%' },
    { decision_id: 'decision-2', frame_index: 2, timestamp_ms: 120000, action: 'BUY', confidence_pct: '72%' },
  ],
};
