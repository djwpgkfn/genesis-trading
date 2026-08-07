import type { RiskProvider, PortfolioProvider } from './live-runtime.js';
import { totalExposure, type Position } from '@genesis/risk-engine';

// Risk states that mean trading is halted (from risk-engine RiskState).
const HALT_STATES = new Set<string>(['HALT', 'FROZEN']);

/** Structural risk source — RiskEngine satisfies this; keeps runtime decoupled and testable. */
export interface RiskSource {
  budgetSnapshot(): { available: number };
  state(): string;
}

/**
 * Runtime adapter: RiskEngine state → RiskSnapshot. Reads engine state only (no compute, no clock,
 * no rng) → deterministic and Point-in-Time. Injected into LiveRuntime's RiskProvider slot.
 */
export function createRiskProvider(source: RiskSource): RiskProvider {
  return () => ({
    budget_available: source.budgetSnapshot().available,
    halted: HALT_STATES.has(source.state()),
  });
}

/** As-of positions source (paper/simulation account state). Never reads future positions. */
export type PositionsProvider = (asOfMs: number) => readonly Position[];

/**
 * Runtime adapter: current positions + Risk envelope → PortfolioSnapshot. Portfolio operates ONLY
 * within the Risk budget, so max_exposure = risk available. Deterministic and Point-in-Time.
 */
export function createPortfolioProvider(source: RiskSource, positions: PositionsProvider): PortfolioProvider {
  return (asOfMs) => ({
    exposure: totalExposure(positions(asOfMs)),
    max_exposure: source.budgetSnapshot().available,
  });
}
