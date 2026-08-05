export type OperatingMode = 'aggressive' | 'normal' | 'conservative' | 'observe';
export interface MarketHealth {
  score: number;
  mode: OperatingMode;
}

export class MarketHealthCalculator {
  static computeCount = 0; // single-source observability (INV-A3)

  /** Deterministic health score from cycle features → operating mode. */
  static compute(features: {
    liquidity: number;
    volatility: number;
    trend: number;
    volume: number;
  }): MarketHealth {
    MarketHealthCalculator.computeCount++;
    const score =
      0.3 * features.liquidity +
      0.25 * features.trend +
      0.25 * features.volume -
      0.2 * features.volatility;
    const mode: OperatingMode =
      score > 0.7
        ? 'aggressive'
        : score > 0.4
          ? 'normal'
          : score > 0.15
            ? 'conservative'
            : 'observe';
    return { score, mode };
  }
}
