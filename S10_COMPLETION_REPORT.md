# S10 — Presentation (UI) Layer · 완료 보고서 (로드맵 최종 단계)

## 1. 구현한 내용

- **UIDataSource**(`data-source.ts`): `LiveDataSource`(Event Store)·`ReplayDataSource`(S4 ReplaySession.appliedEvents)가 **동일 인터페이스**. 뷰는 소스에만 의존 → **Live/Replay 동일 UI, 소스만 교체**.
- **읽기 전용 Views**(`views.ts`): Dashboard·Market·Portfolio·Strategy·AI·Market Diary — **순수 projection**(판단 없음). Event/DecisionRecord만 읽어 뷰모델 생성. DecisionRecord는 `projectDecision` 재사용.
- **Explainability View**(`explainability.ts`): 한 correlation_id의 **Market Health → Feature → Strategy → Portfolio → Risk → Execution → DecisionRecord → AI Explanation** 전체 타임라인을 순서대로 드릴다운.
- **ControlPanel**(`control.ts`): **유일한 쓰기 표면** — run/stop/**emergency_exit**만. ControlCommand 이벤트로 기록. **긴급청산은 직접 주문이 아니라 `RiskControlPort.forceExit`(Risk FORCE_EXIT 경로) 호출**. placeOrder/주문 메서드 없음.
- **Event Sourcing 렌더링**: 모든 화면이 이벤트에서 렌더 → Replay에서 동일 동작.
- **Invariant 체크**(`invariants.ts`): E2(설명가능성)·E4(읽기전용 결정론·Live=Replay)·E5(쓰기표면=ControlCommand·긴급청산=Risk 경로) → 러너 연결.
- **S1~S9 무수정**: Presentation은 event-engine(S3)·replay-engine(S4) 및 이벤트 스키마만 소비해 조립.

## 2. 변경된 파일

- 신규: `packages/presentation/**` (7개: data-source·views·explainability·control·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(presentation 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부

- **없음.** `@genesis/contracts`(DecisionRecord 등) 소비만, 불변. 뷰모델·ControlCommand 페이로드는 내부 타입. S1~S9 엔진 무수정.

## 4. Invariant 영향 여부

- **위반 없음.** 준수: **INV-E2**(모든 결정이 Explainability의 DecisionRecord로 설명됨)·**INV-E4**(읽기전용 projection·동일 이벤트→동일 렌더·Live=Replay)·**INV-E5**(쓰기=ControlCommand뿐, 긴급청산=Risk FORCE_EXIT, UI 직접 주문 경로 0). 러너에 3개 체크 등록.

## 5. 테스트 결과

- **Test First**: 유닛 테스트 1파일(뷰·Explainability·**Live==Replay 동일 렌더**·Control Panel 긴급청산 라우팅).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 8/8 통과**(대시보드·체인 순서·Live=Replay·긴급청산→Risk·ControlCommand 전용).
- 사용자 환경: `npm install && npm run ci`로 최종 검증. **전체 로드맵 S0~S10 = 12개 워크스페이스 패키지**(contracts + invariant-runner + data-layer·feature-store·event-engine·replay-engine·research-platform·risk-engine·portfolio-engine·production-engine·ai-layer·presentation)가 통합 CI로 결선됨.

## 6. 남은 TODO

- 실제 프런트엔드 렌더(React/차트) 바인딩 — 본 단계는 **뷰모델·데이터소스·컨트롤 계층**까지(업비트 스타일 차트 우선).
- 실시간 스트리밍(Live append 구독)·Replay 스크러버(seek/speed) UI 연결(S4 세션 재사용).
- Market Diary 매일 9시 자동 생성·블로그 내보내기, Explainability→AI Report 사실 일치 표시.
- ControlCommand 오퍼레이터 인증·권한, 긴급청산 확인 절차.

## 7. 구현 이후 실제 실행 화면과 사용자 흐름

아래는 이 계층이 제공하는 화면과 전형적 사용자 흐름이다. 모든 화면은 **이벤트에서 렌더**되므로 Live와 Replay가 동일하게 동작한다.

**(1) Dashboard** — 첫 화면. 운용 상태(INIT/READY/RUN/SAFE_MODE/HALT/RECOVERY/FROZEN), 현재 Market Health 모드, 예산 활용률, 금일 전송 주문 수, HALT 여부를 한눈에. 상단에 **[실행][정지][긴급청산]** 버튼(=ControlPanel, 유일한 쓰기).

**(2) Market View** — Market Health 점수·모드와 시세를 표시. 업비트 스타일 차트가 캔들(마감 확정)을 렌더.

**(3) Portfolio View** — 현재 계획된 배분(종목별 비중·notional)과 활용률. 모두 Portfolio.planned 이벤트 출처.

**(4) Strategy View** — 사이클별 전략 평가(활성 전략·적합 모드).

**(5) AI View** — AI 제안 목록(Draft→…→Approved)과 frozen artifact. AI는 **자문만**임이 화면에 드러남(실행 버튼 없음).

**(6) Market Diary** — 날짜별 일지: 결정 수, HALT 여부. 무거래일도 기록.

**(7) Explainability View** — 특정 결정을 클릭하면 **Market Health → Feature → Strategy → Portfolio → Risk → Execution → DecisionRecord → AI 설명**까지 타임라인으로 펼쳐, "왜 이 주문이 나갔나"를 원인까지 드릴다운.

**(8) Replay Mode** — 우측 상단 토글로 Live↔Replay 전환. 데이터 소스만 S4 ReplaySession으로 바뀌고 **같은 화면**이 과거를 재생. 버그 재현·연구·블로그 캡처에 사용.

**전형적 흐름**: ① Dashboard에서 상태·건전성 확인 → ② 이상 신호 시 Explainability로 원인 추적 → ③ 필요 시 [정지] 또는 [긴급청산](→ Risk FORCE_EXIT, 직접 주문 아님) → ④ 사후 Replay Mode로 동일 화면에서 그 시점을 재생·검증. 사용자는 **관찰과 통제**만 하며, 실제 매매 판단·실행은 결정론 엔진과 Risk 게이트가 수행한다.

> **로드맵 완료**: Implementation Playbook S0~S10 전 단계 구현 완료. 다음은 실 인프라 결선(업비트 WS/REST·저장 어댑터·React 렌더·Exchange Adapter)과 RFC-001/002/D 정식 채택(→ Constitution v1.1)이 자연스러운 후속 작업이다.
