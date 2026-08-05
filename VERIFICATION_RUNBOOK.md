# I1 Verification Runbook (사용자 네트워크 환경에서 실행)

전제: Windows(또는 Linux) + Node 22 + Docker Desktop + Upbit API 키(읽기 전용 우선, 주문 검증 시 최소금액 키).
> 이 문서는 **검증 절차**이며 새 기능/패키지가 아니다. 각 항목의 "PASS 기준"을 실제 출력으로 확인.

## 0) 준비
```bash
cp .env.example .env      # UPBIT_ACCESS_KEY/SECRET_KEY, PG_URL, CLICKHOUSE_URL 채우기 (키는 커밋 금지)
npm install
npm run build
```
PASS: install/build 에러 0.

## 1) npm run ci
```bash
npm run ci   # build · lint · format:check · contract:validate · invariant:validate · test
```
PASS: 6개 단계 모두 통과, `[invariant-runner] N/N ... 0 failing`.

## 2) docker-compose 전체 기동
```bash
docker compose up -d
docker compose ps           # timescaledb, clickhouse = running/healthy
```
PASS: 두 컨테이너 Up. 마이그레이션 자동 적용(initdb).

## 3) PostgreSQL / TimescaleDB 저장·조회
```bash
psql "$PG_URL" -c "\dx"                                   # timescaledb 확장 확인
psql "$PG_URL" -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"  # candles
psql "$PG_URL" -c "INSERT INTO candles VALUES('KRW-BTC','1m',1,1,1,1,1,0,0,'test');"
psql "$PG_URL" -c "SELECT * FROM candles LIMIT 1;"
psql "$PG_URL" -c "UPDATE events SET seq=seq;"            # append-only 규칙: 0 rows affected
```
PASS: candles 하이퍼테이블 존재, INSERT/SELECT 동작, events UPDATE/DELETE가 무효(INV-E1).

## 4) ClickHouse 저장·조회
```bash
curl "$CLICKHOUSE_URL/?query=SHOW+TABLES+FROM+genesis"    # raw_records
curl "$CLICKHOUSE_URL/" --data-binary "INSERT INTO genesis.raw_records(kind,symbol,event_time_ms,ingest_time_ms,seq,payload) VALUES('trade','KRW-BTC',1,1,1,'{}')"
curl "$CLICKHOUSE_URL/?query=SELECT+count()+FROM+genesis.raw_records"
```
PASS: 테이블 존재, INSERT 후 count ≥ 1.

## 5) Upbit REST + JWT + WebSocket (라이브 스모크)
```bash
node dist/adapters-upbit/live.integration.js
```
PASS 출력 예:
```
[REST] fetched 3 KRW-BTC 1m candles; last close=...
[REST/JWT] accounts: KRW,...        # JWT 서버 수락 확인
[WS] KRW-BTC trade_price=...         # 실시간 3틱
[LIVE] Upbit REST + JWT + WS smoke test OK
```
- REST 200 → **Upbit REST 연결** PASS
- accounts 200 → **JWT 인증(서버 수락)** PASS
- WS trade 수신 → **WebSocket 연결** PASS

## 6) Collector → DB 저장
간단 결선 스크립트(예): UpbitWsTransport → WsCollector(parse) → ClickHouseRawStore.appendBatch.
```bash
# 30초 수집 후 count 증가 확인
curl "$CLICKHOUSE_URL/?query=SELECT+count()+FROM+genesis.raw_records"  # 수집 전
# (collector 30s 실행)
curl "$CLICKHOUSE_URL/?query=SELECT+count()+FROM+genesis.raw_records"  # 수집 후 증가
```
PASS: count 증가, 재구성 캔들 = REST 캔들 대조 일치.

## 7) Exchange Adapter 주문 흐름 (최소금액/취소 방식)
안전 검증: 체결되지 않는 **지정가 미체결 주문** 제출 → 주문 uuid 확인 → 즉시 취소. (또는 최소금액 시장가.)
```bash
# UpbitExchangeAdapter.submit()로 지정가(현재가 대비 크게 벗어난) 주문 → uuid 수신 → DELETE /v1/orders 취소
```
PASS: 주문 uuid 수신(주문 경로·JWT·identifier 멱등 확인), 취소 완료. **반드시 Execution Gateway(토큰) 경유** 확인.

## 8) 장애 → Alert → Incident → Replay 자동
```bash
# Risk HALT를 유발(정합성 불일치 주입) 또는 WS 강제 종료 → FailureAutomation.onFailure 트리거
```
PASS: Alert 발생 → IncidentReport 생성(snapshot_id·replay_session_id·decision_ids 링크) → Replay Session 자동 생성·완주, DecisionRecord 연결.

## DoD 판정
위 1~8이 **모두 실제 PASS**일 때 I1 완료. 하나라도 실패 시 원인 분석·수정 후 재검증. I2는 그 전까지 착수하지 않음.
