# S7 — Portfolio Engine · 완료 보고서

## 1. 구현한 내용
- **Portfolio Optimizer**(`optimizer.ts`): 목적함수 = **장기 생존**(수익 극대화 아님). ① 프랙셔널 켈리(kellyFraction≪1, 과다베팅·파멸 회피) ② 상관 페널티(분산) ③ 하드 캡(종목별·상관그룹·총 활용) ④ **Risk available 예산으로 클립(절대 우회 없음)**.
- **Position Sizing**(`sizing`=optimizer): 롱온리 켈리 `max(0, p−(1−p)/b)` × 분수 계수.
- **Capital Allocation**(`engine.ts`): weight→notional = weight×budget.total, 합계가 available 초과 시 원자 스케일 다운(INV-R5).
- **Correlation Matrix**(`correlation.ts`): 피어슨, **사이클당 1회 build → 단일 소스로 모든 소비자 공유(INV-A3)**. `CorrelationMatrix.buildCount`로 관측.
- **Rebalancing Engine**(`rebalance.ts`): target vs current → **주문 인텐트(delta)**만 생성. 실행은 반드시 Risk 게이트(S6) 통과 — Portfolio는 실행하지 않음.
- **Portfolio Constraints**: maxWeightPerSymbol·maxCorrelationGroupExposure·maxTotalUtilization·correlationThreshold(그룹 클러스터).
- **Explainability**: 배분별 kelly_raw→after_correlation→after_constraints→final_weight→notional + reason.
- **Event Sourcing**: `Portfolio.planned`(plan+explain) append, 해시체인. 결정론 → Replay=Live 동일.
- **Invariant 체크**(`invariants.ts`): R5·A3·D1 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/portfolio-engine/**` (8개: types·correlation·optimizer·rebalance·engine·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(portfolio 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts` 불변. Portfolio 타입·`Portfolio.planned` 이벤트는 **내부 타입**. Risk 봉투(budget_view)는 **주입 입력**(Portfolio는 Risk를 직접 호출하지 않음, F1/INV-A2). event-engine store 재사용.

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수: **INV-R5**(산출 항상 Risk available 이내·봉투 우회 없음), **INV-A3**(상관행렬 사이클당 1회·단일 소스), **INV-D1**(결정론·Replay=Live 동일). 러너에 3개 체크 등록.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 1파일 7케이스(켈리 롱온리·R5 예산·활용/종목 캡·상관 1회·결정론+이벤트소싱·explainability·rebalance).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 6/6 통과**(결정론·R5 클립·캡·켈리·단일 상관).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO
- 실 전략 edge 입력(winProb/payoff) 산출을 Strategy/Score 파이프라인과 결합(현재 후보는 외부 주입).
- 상관행렬 계산 method_version을 Snapshot에 pin(correlation_method_version) — S8 연결.
- 낙폭(drawdown) 제약을 목적함수에 직접 반영(현재 Risk 측 drawdown과 분리), 켈리 추정 불확실성 축소.
- 리밸런싱 비용/최소 거래단위·슬리피지 모델, 부분 리밸런스 정책.
- budget_view 주입 경로를 Cycle Orchestrator(S8)에서 확정(현재 입력으로 수신).

## 7. 다음 Playbook Stage 권장
- **S8 — Production Engine**: Control/Data plane, **Cycle Orchestrator**(엔진 순서·직접호출 금지·Market Health/상관 1회·budget_view 주입), Snapshot 원자 활성/롤백, Manifest 서명, 콜드스타트 INIT→READY, ControlCommand. 입력 문서: Production Engine 설계, Constitution Part IV, Contracts, INV(V,E,A). 여기서 S1~S7을 오케스트레이션으로 결선하고 Risk 토큰→Execution·Portfolio budget_view 주입을 실제 연결.
