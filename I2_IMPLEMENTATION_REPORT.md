# I2 — Implementation Report (누적)

기준 커밋 `51d8b35` 이후. 각 단계 additive, 기존 Contract/ADR/Invariant 무변경, Green Gate 후 진행.

## I2-1 — Risk/Portfolio Provider Adapter ✅ (구현·오프라인 검증 완료, 사용자 CI 대기)

**변경 파일**
- 신규 `packages/runtime/src/providers.ts` — `createRiskProvider`/`createPortfolioProvider` + `RiskSource`/`PositionsProvider`.
- 신규 `packages/runtime/src/providers.test.ts` — 매핑·halt·exposure·결정론·Point-in-Time(5).
- 수정 `packages/runtime/{package.json,tsconfig.json}` — `@genesis/risk-engine` dep/ref 추가(additive).
- 수정 `packages/runtime/src/index.ts` — providers export.
- 신규 `docs/adr/ADR-I2A-risk-portfolio-providers.md`.

**이유**: LiveRuntime의 기존 RiskProvider/PortfolioProvider 주입점에 실제 risk-engine 상태를 연결(엔진·계약 무변경). Portfolio는 Risk envelope 내 현재 exposure로 표현.

**검증**: 오프라인 5/5. invariant 48 유지, cycle 없음(risk-engine→runtime 없음). 사용자 `npm run ci` 필요.

**다음 단계**: I2-2 Recording Sink(경계 버퍼) — tick마다 RecordedFrame 축적, Replay 스키마 재사용.
