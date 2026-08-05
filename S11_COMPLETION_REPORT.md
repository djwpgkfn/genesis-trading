# S11 — I3 Operator Console (Replay + Presentation + Dashboard) · 완료 보고서

읽기 전용 AI Decision Viewer. 실거래·주문·Execution·Paper Trading·Portfolio·Risk Budget·Wallet·Auto-Trading는 구현 범위에서 제외. Constitution·I1/I2(Thin Core·Deterministic Runtime·Event Sourcing·Decision SSOT) 계승.

## 1. 구현 범위

**완료 (Rollout Step 1 — Replay Engine):**

- `@genesis/replay-engine` 확장(신규 파일만, 기존 S4 파일 무수정):
  - `replay-state-machine.ts` — `ReplayState`(IDLE→LOADED→PLAYING→PAUSED→STOPPED→COMPLETED) + `REPLAY_TRANSITIONS` + `canReplayTransition`.
  - `console-session.ts` — `OperatorReplaySession`(읽기 전용): cursor·speed(1|2|5|10)·state, play/pause/stop/reset/advance/setSpeed/seek/step/**seekToDecision**, timeline()/currentFrame()/restoreSnapshot/restoreDecision. `advance()`는 마지막 frame으로 이동 시 false + COMPLETED.
  - `restore.ts` — `recomputeDecision`(frozen clock로 TradingCore 재실행)·`verifyDeterminism`(재계산 == 저장 Decision).
  - `fixtures.ts` — `buildSampleRecording`(결정론 recording 생성).
- **Decision History Panel 지원**(Amendment A3): `timeline()` + `seekToDecision(id)`로 시간순 Decision 목록·즉시 이동 backing 제공.
- 결정론 보장: frozen replay clock, `Date.now()`/`Math.random()`/네트워크 없음 → Replay == Live.

**미완료 (다음 롤아웃 단계):**

- Step 2 — Presentation ViewModel 6종(Decision/Signal/Strategy/Explainability/Invariant/Replay, `ReplayViewModel.history[]` 포함).
- Step 3 — `apps/dashboard`(React+Vite+TS+Tailwind, 다크, 7패널 + Decision History, 전면 읽기 전용).
- Step 4 — Presentation-purity(E)·Read-only 경계(A) invariant 등록, CI에 Vite production build 추가(46/46).

## 2. 변경된 파일

- 신규(코드): `packages/replay-engine/src/{replay-state-machine,console-session,restore,fixtures}.ts` + 테스트 `console-session.test.ts`·`restore.test.ts`.
- 신규(문서): `docs/I3_ARCHITECTURE.md`, `docs/adr/ADR-012-replay-reproject-vs-recompute.md`, `docs/rfc/RFC-I3-operator-console.md`, 본 `S11_COMPLETION_REPORT.md`.
- 수정: `packages/invariant-runner/src/registry.ts`(INV-R9/R10/R11 추가), `src/invariant-validate.ts`(replayEngineChecks 결선), `README.md`(I3 섹션), 루트/`src` tsconfig references, `.prettierrc.json`(endOfLine lf)·`.gitattributes`·`.prettierignore`(줄바꿈 정규화).
- 삭제: `packages/replay-engine/src/session-console.ts`(구버전 중복 제거).

## 3. Contracts 변경 여부

- **없음.** `@genesis/contracts` 및 I2 Decision SSOT 소비만, 불변. 신규 타입(`RecordedFrame`·`ReplayState`·`ReplaySpeed` 등)은 replay-engine 내부 타입. 기존 S4/S10 파일 무수정.

## 4. Invariant 영향 여부 (③④)

- **추가·등록됨(R 카테고리, Amendment A1):** **INV-R9**(결정론 재현: frozen clock 재계산 == 저장 Decision) · **INV-R10**(replay/restore 부작용 없음: 외부 I/O·거래 이벤트 0) · **INV-R11**(트랜스포트 직교: speed/seek/step이 frame 내용 불변). registry + validator(`replayEngineChecks`) + CI 전부 결선.
- **결과 카운트:** 40 → **43/43** (0 failing, 0 not-implemented). 즉 설계의 RP1/RP2/RP3는 Amendment A1대로 R9/R10/R11로 등록 완료.
- **미등록(의도적):** PR1/PR2(Presentation purity, E 카테고리)·UI1(읽기 전용 경계, A 카테고리)는 검사 대상인 Presentation ViewModel(Step 2)·Dashboard(Step 3)가 아직 없어, 지금 등록하면 대상 없는 거짓 통과가 됨 → 정직성 원칙상 Step 2/3에서 등록해 **46/46**로 상향 예정.

## 5. 테스트 결과

- `npm test`: **125 passed** (30 files). replay-engine: `console-session`(상태머신·cursor·seek/step/seekToDecision·speed 직교·advance 종료조건) + `restore`(recompute == stored·tampered 감지) + 기존 `engine` 테스트 포함.
- 결정론: 동일 recording에서 `recompute(frame)` == 저장 Decision(INV-R9) 검증.

## 6. CI 결과

- `npm run ci`: **GREEN** — build · lint(0 warning) · format:check(prettier) · contract:validate · invariant:validate(**43/43**, 0 failing, 0 not-implemented) · test(125).
- (예정) Step 3/4에서 `ci`에 `vite build` 추가 → build·lint·test·vite build 모두 green 유지(Amendment A2).

## 7. 남은 작업 (I4로 가기 전)

- I3 잔여: Step 2(Presentation ViewModel) → Step 3(apps/dashboard, Decision History 포함) → Step 4(PR/UI invariant 등록 + CI vite build, 46/46).
- 이후 **I4 Paper Trading**: 가상 체결·Portfolio·Risk Budget 결선(실주문 없음). Decision SSOT를 소비하는 첫 실행 단계.

## 8. 설계 대비 구현률

- **설계(Design Pack 17개 산출물): 100%** 작성·승인(Amendments A1–A3 포함).
- **구현: 약 40%** — Replay Engine(결정론 코어) 완료; Presentation·Dashboard·PR/UI invariant·CI vite build 미완.

## I3 Complete Checklist

- [x] **Build** — `npm run build` GREEN
- [x] **Test** — `npm test` 125/125 GREEN
- [x] **CI** — `npm run ci` GREEN (invariant 43/43)
- [~] **Invariants** — Replay(INV-R9/R10/R11) 등록·통과 ✅ / Presentation·Read-only(PR/UI) → Step 2/3에서 46/46
- [x] **ADR** — `docs/adr/ADR-012-replay-reproject-vs-recompute.md`
- [x] **RFC** — `docs/rfc/RFC-I3-operator-console.md`
- [x] **README** — I3 섹션 추가
- [x] **Completion Report** — 본 문서(S11)

(~ = 부분 완료: Replay invariant 완료, Presentation/Read-only invariant는 Step 2/3 대기)
EOF
