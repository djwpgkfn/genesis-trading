# S5 — Research Platform · 완료 보고서

## 1. 구현한 내용

- **Experiment = 최상위 실행 객체**(`types.ts`): experiment_id·hypothesis_id·snapshot_id·strategy_version·feature_set_version·dataset·period(start/end)·mode·status·result·provenance. Strategy보다 상위에서 실행을 지휘.
- **단일 실행 모델**(`experiment.ts`): `ExperimentRunner`가 **Backtest·Paper·Shadow를 동일한 `run()`**(replay 1-pass)으로, **WFV를 `runWFV()`**(롤링 폴드, 게이트=전 폴드 통과)로 처리. 모든 실행은 **Replay Engine(S4)** 사용 → Snapshot+Event Log로 완전 재현.
- **구조적 격리**(`isolation.ts`): 실행 능력은 `VirtualExecution`(mode:'virtual')뿐. **실브로커/계좌 포트가 패키지에 존재하지 않음 → 실계좌 접근 구조적 불가(INV-S3)**.
- **Research Event Sourcing**(`platform.ts`,`research-events.ts`): Proposal/Hypothesis/Experiment/Result를 모두 이벤트로 append(해시체인). `ResearchPlatform`가 createProposal/registerHypothesis/runExperiment 제공, 상태는 이벤트에서 재구성.
- **Champion/Challenger(Research 내부 한정)**(`champion-challenger.ts`): WFV 검증 통과 + 챔피언 초과 시에만 **`promoted-in-research`**. **Production 연결 없음**(Manifest 승격은 이후 단계).
- **Replay Bookmark / Diff**(`replay-ext.ts`): 확장 가능한 인터페이스(`createBookmark`, `diffSessions`) — 향후 Research 활용, Contracts 불변.
- **Invariant 체크**(`invariants.ts`): S3(격리)·S5(WFV 게이트)·E1(이벤트 소싱)·D2(재현) → 러너 연결.

## 2. 변경된 파일

- 신규: `packages/research-platform/**` (10개: types·isolation·research-events·experiment·champion-challenger·replay-ext·platform·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(research 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부

- **없음.** `@genesis/contracts` 불변. Experiment/Hypothesis/Proposal·Research 이벤트·Bookmark/Diff는 **내부 타입**. event-engine(S3)·replay-engine(S4)는 변경 없이 그대로 재사용.

## 4. Invariant 영향 여부

- **위반 없음.** 신규 준수: **INV-S3**(Research 격리·실계좌 접근 불가), **INV-S5**(WFV 미통과 시 승격 불가), **INV-E1**(Research 아티팩트 이벤트 소싱·체인), **INV-D2**(실험 재현 일치). 러너에 4개 체크 등록.

## 5. 테스트 결과

- **Test First**: 유닛 테스트 1파일 4케이스(재현+이벤트소싱, 전 모드 단일모델, virtual-only, champion=Research 내부·WFV 필수).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 6/6 통과**(재현 metrics, WFV 3폴드, no-WFV 거부, WFV 승격=research only).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO

- 실 전략 실행 executor 연결(현재 defaultExecutor는 decision 기반 단순 지표) — Strategy Plugin 인터페이스 완성 시 결합.
- Paper/Shadow의 실시간(live 가상) 소스 바인딩(현재 replay 소스 공통 모델), Shadow는 Production 병렬 소스 연결(S8 이후).
- WFV 기준 정교화(표본 외 성과·낙폭·유의성), 앵커드/롤링 옵션.
- Replay Bookmark/Diff의 per-decision 상세 비교 구현.
- Production 승격 경로(서명 Manifest)는 **의도적으로 미연결** — S8 이후.

## 7. 다음 Playbook Stage 권장

- **S6 — Risk Engine**: 최종 승인자·토큰 게이트·Budget 회계(예약→소비→반환)·상태기계(INIT→…→FROZEN)·정합성 HALT·멱등·트레일링. 입력 문서: Risk Engine v2, Contracts, INV(R,S). event-engine 상태전이 이벤트(State.transitioned) 재사용.
