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

## I2-2 — Recording Sink ✅ (구현·오프라인 검증 완료, 사용자 CI 대기)

**변경 파일**

- 신규 `packages/runtime/src/ring-buffer.ts` — 경계 FIFO `RingBuffer<T>`(결정론).
- 수정 `packages/runtime/src/live-runtime.ts` — recording sink 결선(additive): `recordingCapacity` 옵션, tick마다 decision 있을 때 `RecordedFrame` 기록, `frames()` 접근자. **반환/시그니처 불변**.
- 수정 `packages/runtime/src/index.ts` — ring-buffer export.
- 신규 `packages/runtime/src/ring-buffer.test.ts`(3), `packages/runtime/src/recording.test.ts`(4).
- 신규 `docs/adr/ADR-I2B-live-recording-sink.md`.

**이유**: Replay 재현·장애 분석·판단 검증을 위해 운영 상태를 경계 버퍼에 기록. **신규 도메인 이벤트 없이** 기존 RecordedFrame(Replay) 스키마 재사용 → Live 기록을 그대로 `presentSession`에 공급(Replay == Live 동일 파이프라인).

**검증**: 오프라인 4/4(+ring 로직). invariant 48 유지. 기존 live-runtime 테스트 무변경(recording은 추가 상태만). 사용자 `npm run ci` 필요(기대 tests +7).

**다음 단계**: I2-3 Realtime Presentation Transport — Runtime frames → presentSession(Full Snapshot) + Incremental patch → 기존 BrowserAdapter 결선. ADR-I2C 동반.

## I2-3 — Realtime Presentation Transport ✅ (구현·오프라인 검증 완료, 사용자 CI 대기)

**변경 파일**

- 신규 `packages/presentation/src/patch-codec.ts` — `PresentationPatch` + 순수 `applyPatch`/`applyPatches`(immutable). index export.
- 신규 `packages/runtime/src/realtime-publisher.ts` — `RealtimePublisher`(push-driven, `PushSink` 구조적) + index export.
- 수정 `packages/runtime/src/invariants.ts` — INV-E11(Snapshot+Patch Consistency, 실검증) presentationChecks 추가.
- 수정 `packages/invariant-runner/src/registry.ts` — INV-E11 등록(48→49).
- 신규 `packages/presentation/src/patch-codec.test.ts`(3), `packages/runtime/src/realtime-publisher.test.ts`(3).
- 신규 `docs/adr/ADR-I2C-snapshot-incremental-ui.md`.

**이유**: Runtime frames → Snapshot(pushSnapshot) + Incremental Patch(pushUpdate) → BrowserAdapter. polling/fixture/mock 없음(push-driven). Replay와 동일 `presentSession`/`dashboardView` 경로.

**검증**: 오프라인 4/4(Snapshot+Σpatch==Full, immutable, reset). invariant **49**. presentation Domain 참조 0, RealtimePublisher는 Browser 직접 미참조(PushSink 구조적). 기존 테스트 무변경.

**다음 단계**: I2-4 Trading UI Runtime View Model(Market/Account/AI) + Market-only patch op.
