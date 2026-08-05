# S2 — Feature Store · 완료 보고서

## 1. 구현한 내용
- **Feature Definition Registry** (`registry.ts`): `id@version` 불변 등록(재등록 거부, INV-V1). provenance(method_version) 포함.
- **Feature Dependency DAG** (`dag.ts`): 의존 폐포의 위상정렬(`topoOrder`) + 순환 검출(`isDag`). 의존 순서 결정론 보장.
- **Feature Version Resolver** (`resolver.ts`): `FeatureSet@version` → 전이 의존 포함 **완전 핀 고정** topo 계획(`ResolvedPlan.plan_key`, Snapshot pin/캐시 키에 사용, INV-V5/D1).
- **Materialized Feature Cache** (`cache.ts`): 키에 **버전 포함**(버전 변경=새 키), miss 시 L1에서 재계산(캐시는 최적화일 뿐, INV-T4). `InMemoryFeatureCache` 참조 구현.
- **Compute Engine** (`compute.ts`): 계획을 topo 순서로 계산. **offline(과거 asOf)=online(현재) 동일 transform → skew 0**. as-of 읽기(T1)·마감캔들만(T2, data-layer 재구성)·L1 재계산(T4)·결정론(D1).
- **RawRecord Data Quality** (`quality.ts`): 상태 `Complete/GapDetected/RestFilled/OutOfOrder/Duplicated` 분류(`assessQuality`, `filledSeqs`로 RestFilled) + `normalizeInput`(중복 제거·결정론 정렬). transform이 quality를 보고 저품질 시 `null` 반환(예: GapDetected→close null).
- **Sample Features** (`features.samples.ts`): `close_1m`·`range_1m` → `range_pct_1m`(의존 DAG 시연).
- **Feature Validation/Invariant** (`invariants.ts`): D1(DAG 비순환)·T2(마감캔들만)·T4(캐시=재계산)·V1(버전 불변) 체크 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/feature-store/**` (16개: types·registry·dag·resolver·cache·quality·compute·features.samples·invariants·index + 5 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(feature-store 체크 등록), `tsconfig.json`(feature-store 프로젝트 참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts` 불변. feature-store는 contracts(Version)·data-layer(RawRecord 등) 타입을 소비하고 자체 Feature 타입만 정의. data-layer(S1)도 변경 없음(입력으로만 사용).

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수: **INV-V1**(버전 불변)·**INV-D1**(DAG 비순환·결정론)·**INV-T2**(마감캔들만)·**INV-T4**(캐시=L1 재계산). offline=online 파리티로 재현성 강화. 러너에 4개 체크 등록(T2/T4는 data-layer와 공유, 마지막 등록 우선).

## 5. 테스트 결과
- **Test First**: 유닛 테스트 5파일(dag·registry·quality·compute + 기존). 
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 11/11 통과**(topo 순서, 순환검출, close/range/range_pct 계산, no-repaint, 캐시=재계산, quality 플래그, Complete).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(build→lint→format→contract:validate→invariant:validate→test).

## 6. 남은 TODO
- 실제 지표 피처 확장(MTF SMA/ATR/변동성 등, 시간축별) 및 orderbook/ticker 기반 피처.
- Materialized 캐시의 영속 어댑터(핫 스토어) 바인딩 + 캐시 무효화 정책.
- ResolvedPlan.plan_key를 Snapshot(feature_set_version)과 연결(S8에서 확정).
- 저품질 처리 정책 세분화(피처별 gap 허용/보간 금지 규칙), RestFilled 전파 경로.

## 7. 다음 Playbook Stage 권장
- **S3 — Event Engine**: 공통 Event envelope·append-only 해시체인·Live/Replay 어댑터·DecisionRecord projection. 입력 문서: Contracts(Event 표준·상태기계·Event→Decision), INV(E,S). 이 단계에서 MarketData 이벤트 taxonomy 확정(S1 TODO) 및 feature ref의 이벤트화 검토.
