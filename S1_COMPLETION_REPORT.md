# S1 — Data Layer · 완료 보고서

## 1. 구현한 내용
- **도메인 타입** (`data-layer/types.ts`): Trade·OrderbookSnapshot·Ticker·Candle·RawRecord(bitemporal), Timeframe(1m~1d).
- **Raw Landing** (`landing/raw-store.ts`): append-only·bitemporal `RawStore` 인터페이스 + `InMemoryRawStore` 참조 구현. `asOf(event,ingest)` 시점정합 읽기.
- **WS Collector** (`collector/`): 주입형 `WsTransport` + `WsCollector`(재연결 백오프·하트비트 stale 감지·**무손실**: 수신 즉시 store append) + `UpbitWsTransport` 바인딩(오프라인 환경이라 미실행).
- **REST Backfill** (`backfill/`): `RestClient` + `RateLimiter`(토큰버킷, 업비트 10req/s·600/min) + `backfillCandles`(`to` 역페이지네이션) + `UpbitRestClient` 바인딩.
- **캔들 재구성** (`candles/reconstruct.ts`): 결정론적 틱→캔들, **마감 확정 창만**(no repaint). `crosscheck.ts`: 재구성 vs REST 대조.
- **갭 검출** (`gaps/detect.ts`): 시퀀스 갭·캔들 창 갭.
- **as-of 질의** (`query/as-of.ts`): 미래 정보 누출 없는 시점정합 조회.
- **Invariant 체크** (`invariants.ts`): T1/T2/T4/E1 구현 → 러너 연결(`src/invariant-validate.ts`).
- **저장기술 확정**: `docs/STORAGE_DECISION.md` — 요구사항 매트릭스 + 하이브리드 권고(원시=ClickHouse/Parquet, 캔들·결정·메타=PostgreSQL+TimescaleDB). 코드는 인터페이스에만 의존.

## 2. 변경된 파일
- 신규: `packages/data-layer/**` (19개: types·landing·collector·backfill·candles·gaps·query·invariants·index + 4 테스트 + package.json/tsconfig), `src/invariant-validate.ts`, `docs/STORAGE_DECISION.md`.
- 수정: `package.json`(`invariant:validate`→composition entry), `tsconfig.json`(data-layer 프로젝트 참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts`(Event/Snapshot/Manifest/DecisionRecord)는 불변. MarketData 페이로드 타입은 data-layer 내부에 정의(제네릭 `EventEnvelope` 위). → **TODO(S3)**: 이벤트 taxonomy 확정 시 `@genesis/contracts`로 승격 검토.

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수 구현: **INV-T1**(as-of 무 look-ahead), **INV-T2**(마감 캔들만), **INV-T4**(L1에서 결정론 재생성), **INV-E1**(append-only). 러너에 4개 체크 등록 → `invariant:validate`에서 실행.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 4파일(reconstruct·as-of·gaps·ws-collector) 작성.
- 오프라인 환경(네트워크 차단, npm 미설치)이라 vitest 전체 실행 불가 → **핵심 알고리즘 독립 검증(Node)**: 7/7 통과(OHLCV, no-repaint T2, 결정론 T4, as-of T1, bitemporal, seq gap).
- 사용자 환경: `npm install && npm run ci` (build→lint→format→contract:validate→invariant:validate→test)로 최종 검증.

## 6. 남은 TODO
- 업비트 WS/REST 바인딩을 네트워크 환경에서 실연결·확정(현재 주입형 인터페이스+바인딩만).
- 실 저장 어댑터(ClickHouse/Timescale/Parquet)를 `RawStore` 등 인터페이스로 구현.
- OrderbookSnapshot/Ticker 재구성·품질검사 확장, 저유동성 호가 그룹핑.
- (S3) MarketData 이벤트 타입 `@genesis/contracts` 승격 검토.

## 7. 다음 Playbook Stage 권장
- **S2 — Feature Store**: L1(data-layer)을 입력으로 버전 피처 정의·offline=online 파리티·point-in-time 서빙. 입력 문서: Feature Store 설계, data-layer(S1 출력), Contracts, INV(T). GAP 문서(Market Health·Memory) 추출은 S2~S6 중 진입 시.
