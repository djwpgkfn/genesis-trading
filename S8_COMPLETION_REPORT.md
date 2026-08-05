# S8 — Production Engine · 완료 보고서

## 1. 구현한 내용
- **Cycle Orchestrator**(`orchestrator.ts`): **유일한 호출자**. 엔진은 주입된 포트로만 접근 → **엔진 간 직접 호출 금지(INV-A1/A2)**. 순서 Feature→(Market Health)→Strategy→Portfolio→Risk→Execution. **Market Health·Correlation 각각 사이클당 1회 계산·공유(INV-A3)**. **budget_view는 Risk에서 조회해 Portfolio에 주입**(Portfolio는 Risk 직접 호출 안 함, F1). 각 단계 이벤트에 동일 correlation_id+snapshot_id.
- **Production Runtime**(`runtime.ts`): `INIT→READY→RUN→SAFE_MODE→HALT→RECOVERY→FROZEN`, 콜드스타트 RUN 금지. 상태 전이는 **event-engine State.transitioned만** 사용.
- **Control Plane**(`control-plane.ts`): Deployment→Manifest 검증→**원자적 Snapshot 활성화**, Champion 교체(=서명 경로 활성화), **원자적 Rollback**.
- **Data Plane / Snapshot Runtime**(`snapshot-runtime.ts`): 활성 Snapshot 읽기 전용. **실행 중 변경 불가**(Control Plane만 스왑). **Pin 검증(INV-V5)**·Snapshot hash·원자 스왑(INV-V2)·rollback(INV-V4).
- **Execution Gateway**(`execution-gateway.ts`): **Risk Approval Token 검증, 토큰 없는 주문 거부(INV-R1)**, ExchangeAdapter 인터페이스, **멱등성(client_order_id, INV-R7)**, **외부 주문 경로 단일화**(외부 효과는 여기서만 → Replay 부작용 없음).
- **Manifest**(`manifest.ts`): Signature·target·hash·**WFV Gate 증빙**·pin 검증(INV-V3).
- **Explainability**: 오케스트레이터가 사이클 이벤트를 모아 `projectDecision`으로 **DecisionRecord 완성**(Execution까지 체인). Replay와 동일 결과.
- **Event Sourcing**: 모든 Production 이벤트 append-only(해시체인), projection 재생성, Replay 동일성.
- **Market Health**(`market-health.ts`): GAP 문서 추출 — 결정론 점수→운용모드(공격/일반/보수/관망), 사이클당 1회.
- **Invariant 체크**(`invariants.ts`): A1·A2·A3·E1·E3·V3·V5·R1 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/production-engine/**` (11개: runtime·snapshot-runtime·manifest·control-plane·execution-gateway·market-health·orchestrator·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(production 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts`(ProductionSnapshot·DeploymentManifest·DecisionRecord) **소비만** 하고 불변. 포트·이벤트 타입은 내부. S1~S7 엔진은 변경 없이 결선(Portfolio는 순수 optimize 재사용, Risk는 토큰/budget 포트로).

## 4. Invariant 영향 여부
- **위반 없음.** 신규/통합 준수: **A1**(DAG·오케스트레이터 단독 호출)·**A2**(Risk 단방향)·**A3**(MH·상관 1회)·**E1**(append-only 체인)·**E3**(Replay 부작용 없음)·**V3**(서명 Manifest 없이 배포 불가)·**V5**(Snapshot 전 요소 pin)·**R1**(토큰 없는 주문 거부). 러너에 8개 체크 등록.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 1파일(runtime·snapshot/control·gateway·orchestrator, 다수 케이스).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 12/12 통과**(상태기계·pin V5·manifest V3·gateway R1/R7·MH+corr 1회 A3).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO
- 실 엔진 어댑터 결선 심화: Feature Store(S2)·Strategy·Risk(S6) 실제 인스턴스를 포트로 바인딩(현재 통합 포트 + 순수 optimizer 결선).
- 업비트 Exchange Adapter 실 구현(placeOrder/체결 수신)·부분 체결→Risk 부분 소비/반환 연결.
- SAFE_MODE/HALT 시 오케스트레이터 사이클 축소·중단 로직, RECOVERY 자동점검 항목.
- Snapshot 실제 로딩(Research 승격 아티팩트→활성 Snapshot), Manifest 서명 검증 실 암호화.
- Risk Explainability·Portfolio explain을 DecisionRecord에 통합 필드로 확장.

## 7. 다음 Playbook Stage 권장 (S9 AI Layer)
- **S9 — AI Layer**: 자문 계층(분석·전략추천·파라미터 제안), Proposal Lifecycle, frozen artifact 서명, AI Memory, **구조적 차단**(자격증명 부재·인터페이스 0·Data Plane LLM 호출 0). 입력 문서: AI Layer v2, RFC Register, Contracts, INV(D3,S3,V). AI 출력은 검증→frozen artifact→Research(S5) 파이프라인→Manifest→Snapshot 경로로만 Production(S8)에 반영.
