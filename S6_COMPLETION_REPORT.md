# S6 — Risk Engine · 완료 보고서

## 1. 구현한 내용
- **최종 승인자 게이트**(`engine.ts`): `preTradeCheck` → 승인 시에만 **단일 사용 Approval Token** 발급. `authorizeExecution(token)`가 실행 게이트 — **유효·미사용 토큰 없이는 실행 불가(INV-R1)**. Risk 단독 완결(Production 미연결).
- **Approval Token**(`token.ts`): 단일 사용(재사용 거부), **HALT 시 전량 즉시 무효화(INV-R2)**.
- **Risk Budget 회계**(`budget.ts`): Reservation → Consumption → Release. **reserved+consumed ≤ total 불변 유지(INV-R4)**, 초과 예약 거부(INV-R5).
- **상태기계**(`state-machine.ts`): `INIT→READY→RUN→SAFE_MODE→HALT→RECOVERY→FROZEN`. **HALT 래칭**(RUN 직접 복귀 불가), **RUN 직접 콜드스타트 금지(INV-R8)**. event-engine **State.transitioned 재사용**, 상태는 이벤트에서 파생.
- **Emergency Halt / Recovery / SAFE_MODE / FROZEN**: `emergencyHalt`(토큰 무효+HALT), `startRecovery`(자동 점검만 → 통과 시 READY, **RUN 복귀는 명시적 `start()` 후에만**), N회 실패 → FROZEN(수동 개입).
- **Limits**(`limits.ts`): Exposure Limit(총/종목), Drawdown(피크 대비, 초과 시 HALT), **Trailing Stop**(highWater×(1−pct)).
- **멱등성**(INV-R7): 동일 request_id 재요청 시 동일 결정 반환(중복 토큰·중복 예약 없음).
- **정합성 HALT**(`reconcile`): 시스템≠거래소 포지션 → 즉시 HALT(INV-R6).
- **Event Sourcing**: Risk.decided/budgetReserved/Consumed/Released/halted/recovered/frozen + State.transitioned 모두 append.
- **Invariant 체크**(`invariants.ts`): R1~R8·S1 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/risk-engine/**` (9개: types·budget·token·limits·state-machine·engine·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(risk 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts` 불변. RiskState/Token/Budget/Decision·Risk 이벤트는 **내부 타입**. event-engine(S3)의 `emitTransition`/`currentState`/store 그대로 재사용.

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수: **R1**(토큰 없이 실행 불가)·**R2**(단일 사용·HALT 무효)·**R3**(HALT 래칭·명시 승인)·**R4/R5**(Budget 불변·초과 거부)·**R6**(정합성 HALT)·**R7**(멱등)·**R8**(콜드스타트 금지)·**S1**(전이 검증·이벤트 소싱). 러너에 8개 체크 등록.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 1파일 8케이스(콜드스타트·토큰 단일사용·Budget 회계·HALT 무효/래칭/복구·FROZEN·멱등·정합성 HALT·트레일링).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 17/17 통과**(상태기계·Budget·토큰·멱등).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO
- Market Health 연동 동적 Budget 스케일링(현재 setTotal 훅만) — S9/Score 연결 시.
- 부분 체결 시 부분 소비/부분 반환 세분화(현재 예약 단위 consume/release).
- 트레일링의 변동성 기반 동적 폭(ATR 등) — Feature Store 연동.
- Risk Explainability 레코드(승인/거부 근거·적용 Rule) 상세화 → DecisionRecord 결합(S8).
- SAFE_MODE 운용 제약(축소 승인) 정책 구체화.
- Production 연결(토큰→Execution, Snapshot 바인딩)은 **의도적으로 미연결** — S8.

## 7. 다음 Playbook Stage 권장
- **S7 — Portfolio Engine**: Risk 봉투(budget_view) 안에서만 최적화, 목적함수=장기 생존(프랙셔널 켈리+상관 페널티+낙폭 제약), 상관 단일 소스, 결정론. 입력 문서: Portfolio Engine 설계, S6(Risk 봉투), Strategy, INV(R5,A3).
