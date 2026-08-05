# S4 — Replay Engine · 완료 보고서

## 1. 구현한 내용

- **ReplaySession**(`session.ts`) 독립 객체: session_id·snapshot_id·event_range·replay_speed·status·current_seq·current_event·**current_state_hash**(적용 이벤트 해시의 결정론 롤링 폴드)·replay_reason·started_at/finished_at. 컨트롤 **pause/resume/seek**(커서·상태만 변경, 로그·외부 무영향), `toSnapshot()`으로 UI/AI가 소비 가능한 상태 노출.
- **ReplayEngine**(`engine.ts`): Snapshot + Event Log만으로 재구성. **Live와 동일한 `runPipeline`(event-engine) 사용, externalSink 미전달 → 외부 부작용 구조적 불가(INV-E3)**. as-of(event_time) 및 seq range 슬라이스 지원. `decisions()`(DecisionRecord)·`explainability(corr)`(결정 타임라인) 그대로 생성.
- **Replay 자체 Event Sourcing**(`replay-events.ts`): ReplayStarted/Paused/Resumed/Seeked/Finished/Failed 이벤트를 별도 replay 로그에 append(해시체인).
- **Audit**(`audit.ts`): `replayAuditProjection`(replay 이벤트 fold → 메타데이터) + `buildAuditReport`. → **Event(로그)와 Projection 양쪽에서 replay metadata 추적 가능**.
- **재사용 인터페이스**: `createSession/runToEnd/pause/resume/seek/project/decisions/explainability` — AI Layer·UI Replay Mode·Explainability View가 그대로 사용.
- **Invariant 체크**(`invariants.ts`): D2(재현 일치)·E3(부작용 없음) → 러너 연결.

## 2. 변경된 파일

- 신규: `packages/replay-engine/**` (7개: types·replay-events·session·engine·audit·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(replay 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부

- **없음.** `@genesis/contracts`(DecisionRecord 등) 불변. Replay 이벤트·세션 타입은 **내부 타입**. event-engine(S3)도 변경 없이 `runPipeline`/`projectDecision`/store 재사용.

## 4. Invariant 영향 여부

- **위반 없음.** 신규 준수: **INV-D2**(동일 Snapshot+range→동일 state_hash·동일 decisions), **INV-E3**(replay 부작용 없음, 외부 sink 경로 부재). E4(projection 재생성)는 event-engine 것 재사용. 러너에 2개 체크 등록.

## 5. 테스트 결과

- **Test First**: 유닛 테스트 1파일 5케이스(D2 재현·as-of·audit report·동일 파이프라인·seek 결정론).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 4/4 통과**(D2 state hash·decisions, as-of 제외, seek 재실행 동일).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO

- 실제 Snapshot 바인딩: replay 시 해당 시점 활성 Snapshot 버전으로 엔진 파라미터 고정(S8 Production Engine 연동).
- replay_speed 기반 실시간 재생 스케줄러(UI용), 스텝 스트리밍 API.
- 대용량 재생 체크포인트/부분 재생, seek 성능 최적화(현재 O(n) 폴드).
- 완전 재현 회귀 하네스(무작위 결정 decision_id → 재생 동일성 CI 게이트, INV-D1/D2 강화).

## 7. 다음 Playbook Stage 권장

- **S5 — Research Platform**: 격리(실계좌 접근 0)·Hypothesis·WFV 게이트·Paper·Shadow·Champion/Challenger. 입력 문서: Research Engine 설계, Strategy/Research Layer 설계, Contracts, INV(S). 백테스트는 S4 Replay(가상 실행 어댑터)와 event-engine 파이프라인 재사용.
