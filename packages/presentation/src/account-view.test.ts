import { describe, it, expect } from 'vitest';
import { buildSampleRecording } from '@genesis/replay-engine';
import { accountView, riskView } from './frame-view.js';
import type { FrameInput } from './input-dto.js';

// buildSampleRecording yields contract-complete frames (RecordedFrame ⊇ FrameInput, incl. portfolio).
const withPortfolio = buildSampleRecording(1)[0]!;
// Express "no portfolio" as a valid FrameInput (portfolio is optional there); RecordedFrame.portfolio
// is required, so we build the FrameInput explicitly rather than destructuring it away.
const withoutPortfolio: FrameInput = {
  index: withPortfolio.index,
  timestamp_ms: withPortfolio.timestamp_ms,
  snapshot: withPortfolio.snapshot,
  risk: withPortfolio.risk,
  signals: withPortfolio.signals,
  strategy: withPortfolio.strategy,
  decision: withPortfolio.decision,
};

describe('I2-4a: FrameInput.portfolio + AccountView', () => {
  it('existing FrameInput without portfolio is still valid (additive, non-breaking)', () => {
    expect(withoutPortfolio.portfolio).toBeUndefined();
    expect(() => accountView(withoutPortfolio)).not.toThrow();
  });

  it('AccountView maps risk from FrameInput.risk (reuses riskView, no duplication)', () => {
    expect(accountView(withoutPortfolio).risk).toEqual(riskView(withoutPortfolio));
  });

  it('portfolio absent → AccountView.portfolio is null (no fabricated data)', () => {
    expect(accountView(withoutPortfolio).portfolio).toBeNull();
  });

  it('portfolio present → propagated to AccountView (source preserved)', () => {
    expect(accountView(withPortfolio).portfolio).toEqual({
      exposure: withPortfolio.portfolio.exposure,
      max_exposure: withPortfolio.portfolio.max_exposure,
    });
  });

  it('Replay == Live: same FrameInput ⇒ same AccountView (deterministic, no branch)', () => {
    expect(accountView(withPortfolio)).toEqual(accountView(withPortfolio));
  });
});
