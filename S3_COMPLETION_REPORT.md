# S3 — Event Engine · 완료 보고서

## 1. 구현한 내용
- **Append-only Event Store** (`event-store.ts`): 해시 체인(prev_hash→hash) 봉인·`verifyChain()` 변조 탐지. **인터페이스에 update/delete 없음(구조적 append-only, INV-E1)**. 결정계열 이벤트 snapshot_id/correlation_id 누락 시 거부(INV-E5).
- **Deterministic Hash/Chain** (`hash.ts`): canonical JSON(키 정렬) + `node:crypto` sha256, `contentHash`/`chainHash`.
- **Event Versioning** (`versioning.ts`): event_type별 schema_version + **읽기 시 upcaster 체인 마이그레이션**. 저장 원본은 절대 불변(수정 없음). 신규 스키마는 upcaster 추가로 흡수.
- **Projection Engine** (`projection.ts`): 순수 fold. `build`/`delete`/`rebuild` — **삭제 후 재생성이 원본과 동일**(INV-E4). Live/Replay **동일 `runPipeline`** 사용, 차이는 소스뿐. `externalSink`는 Live에만 제공 → Replay 부작용 없음(INV-E3).
- **DecisionRecord = Projection** (`decision-projection.ts`): 하나의 correlation_id 이벤트들을 결정론적으로 fold → `DecisionRecord`(source_event_ids 역추적, contracts 타입 사용).
- **State Machine** (`state-machine.ts`): 상태는 오직 `State.transitioned` 이벤트에서 파생(`emitTransition`/`currentState`). 이벤트 없이는 상태 변경 불가(INV-S2).
- **내부 이벤트 taxonomy** (`events.ts`): MarketData(trade/orderbook/ticker)·Decision(stage/outcome)·State.transitioned. **event-engine 내부 타입**(Contracts 불변; contracts 승격은 RFC 절차).
- **Invariant 체크** (`invariants.ts`): E1/E3/E4/E5/S2 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/event-engine/**` (13개: hash·events·event-store·versioning·projection·decision-projection·state-machine·invariants·index + 3 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(event-engine 체크 등록), `tsconfig.json`(참조 추가), `package.json`(devDep `@types/node` for `node:crypto`).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts`(EventEnvelope·DecisionRecord 등) 불변. event-engine은 contracts 타입을 소비하고, 이벤트 taxonomy·EventInput/StoredEvent는 **내부 타입**으로 시작. S1/S2도 변경 없음.

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수: **E1**(append-only·해시체인·변조탐지), **E3**(Replay 부작용 없음), **E4**(projection 결정론·삭제후 재생성·역추적), **E5**(결정계열 snapshot_id/correlation_id 필수), **S2**(상태전이=이벤트). 러너에 5개 체크 등록.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 3파일(event-store·projection·versioning).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node, node:crypto) 12/12 통과**(체인·변조탐지·E5 거부·projection build=rebuild·decision 역추적·replay 부작용無·upcast·원본 불변).
- 사용자 환경: `npm install && npm run ci`로 최종 검증.

## 6. 남은 TODO
- 영속 Event Store 어댑터(append-only DB/로그) 바인딩 + 스냅샷 오프셋.
- Live 소스(Store append 구독) 실제 구현 및 Replay as-of 슬라이스 연결.
- 결정 파이프라인 이벤트(MarketHealthScored/StrategyEvaluated/RiskDecided 등)는 S6~S8에서 발행 → DecisionRecord projection 확장.
- MarketData 이벤트 taxonomy의 `@genesis/contracts` 승격 여부(RFC).
- 프로젝션 카탈로그/버전 관리, 대용량 재생 성능(체크포인트).

## 7. 다음 Playbook Stage 권장
- **S4 — Replay Engine**: Snapshot+as-of 재생으로 결정 재현 일치, 외부 부작용 0(샌드박스). 입력 문서: Constitution Part IV §9(Snapshot), S3(event-engine), Presentation §7(Replay), INV(D2,E3). event-engine의 `runPipeline`(Replay 소스)을 재사용.
