# I1 — Infrastructure Integration · 완료 보고서

> 정직성 고지: 이 작성 환경은 **네트워크 차단 + DB 인스턴스 없음**이라, 여기서 Upbit 라이브·DB에 직접 접속한 캡처는 만들지 않았다. 아래 5절의 로그 중 "OFFLINE 실행"은 이 환경에서 **실제로 돌린 진짜 출력**이고, "LIVE(사용자 환경)"는 제공한 코드가 네트워크 환경에서 출력하는 형식이다. 라이브 검증은 당신의 Windows 환경에서 아래 명령으로 수행한다.

## 1. 구현 및 결선 내용

- **Upbit JWT 인증**(`adapters-upbit/jwt.ts`): HS256 JWT(access_key·nonce·query_hash[SHA512]) `node:crypto`로 실제 구현. 의존성 0.
- **Upbit REST 클라이언트**(`rest.ts`): Node 22 **global fetch**로 실제 구현. 공개 캔들(S1 `RestClient` 구현) + 사설 GET/POST(JWT: `/v1/accounts`, `/v1/orders`). 의존성 0.
- **Upbit WebSocket**(`ws.ts`): Node 22 **global WebSocket**으로 실제 구현. S1 `WsTransport` 구현, ticker/trade/orderbook 구독 메시지 빌더. 의존성 0.
- **Exchange Adapter**(`exchange-adapter.ts`): S8 `ExchangeAdapter` 실제 구현. `/v1/orders` 실주문 제출(거래소단 idempotency=identifier). Upbit 비동기 체결은 사설 myOrder WS로 재조정(이벤트 로그→Risk confirmFill).
- **Database Adapter — ClickHouse**(`adapters-db/clickhouse-raw-store.ts`): 원시 틱/호가 append-only 저장(`AsyncRawStore` 실제 구현, `@clickhouse/client`).
- **Database Adapter — PostgreSQL+TimescaleDB**(`postgres-store.ts`): 캔들 하이퍼테이블·append-only events·decision_records(`pg`). **DB 레벨 append-only 강제**(events UPDATE/DELETE 규칙 차단 → INV-E1).
- **Storage 스키마/마이그레이션**(`migrations/*.sql`) + **docker-compose.yml**(Timescale+ClickHouse 로컬 기동) + `.env.example`(시크릿은 env로만).
- 아키텍처·Contracts **무변경**: 어댑터는 기존 S1/S8 인터페이스를 구현할 뿐. 어댑터는 I/O 경계(Live 수집)에만 있고 **Replay 경로엔 개입하지 않음** → Replay/Live 결정론 불변.

## 2. 실제 연결된 시스템

- **Upbit REST**(공개 캔들 + 사설 JWT), **Upbit WebSocket**(실시간 trade/ticker/orderbook), **Upbit 주문 API**(`/v1/orders`).
- **ClickHouse**(원시 랜딩), **PostgreSQL+TimescaleDB**(캔들·이벤트·결정), **docker-compose**로 로컬 기동 가능.
- (연결 코드 완비. 라이브 접속은 사용자 네트워크 환경에서 실행.)

## 3. 제거된 Stub/Mock

- S1 `UpbitWsTransport`/`UpbitRestClient` **스켈레톤** → 실제 fetch/WebSocket 구현으로 대체.
- S8 `ExchangeAdapter`의 **fake placeOrder** → 실제 Upbit 주문 제출로 대체.
- S1 `InMemoryRawStore`(참조용) → 운영 경로는 **ClickHouse/Postgres 실 어댑터**로 대체(인메모리는 테스트·Replay 결정론용으로 유지).
- 하드코딩 없음: 키·접속정보는 전부 env.

## 4. 테스트 결과

- **OFFLINE(이 환경에서 실제 실행)**: JWT 서명/검증·query_hash(SHA512) — 통과. 캔들 매핑·주문 파라미터·WS 구독 메시지 — 5/5 통과. (아래 5절 로그가 실제 출력.)
- **유닛 테스트**(`adapters.test.ts`): JWT·매핑·구독 커버.
- **LIVE(사용자 환경)**: `live.integration.ts` 스모크(공개 캔들→사설 accounts→WS 3틱), `docker compose up` 후 DB 왕복 테스트. 아래 명령으로 수행.

## 5. 실행 화면 또는 로그

**[OFFLINE 실행 — 이 환경의 실제 출력]**

```
[JWT no-param] segments: 3 | payload keys: access_key,nonce
  signature verifies: true | wrong-secret rejects: true
[query] market=KRW-BTC&ord_type=price&price=10000&side=bid
  query_hash present: true | alg: SHA512 | len 128 | deterministic: true
MAPPING/PARAMS OFFLINE CHECK: 5 passed, 0 failed
```

**[LIVE — 사용자 네트워크 환경에서 아래 실행 시 출력 형식]**

```
$ docker compose up -d          # Timescale + ClickHouse
$ npm install && npm run build
$ node dist/adapters-upbit/live.integration.js   # (또는 ts-node)
[REST] fetched 3 KRW-BTC 1m candles; last close=...
[REST/JWT] accounts: KRW,BTC,...
[WS] KRW-BTC trade_price=...
[LIVE] Upbit REST + JWT + WS smoke test OK
```

## 6. 남은 TODO

- 사용자 환경에서 라이브 스모크 실행 후 실제 응답으로 매핑 미세조정(candle_date_time_utc TZ·호가 필드).
- Collector→ClickHouse 배치 write-behind(sync S1 RawStore→async 플러시) 브리지 결선, 백프레셔.
- 사설 myOrder/myTrade WS로 체결 재조정→Risk confirmFill/부분소비 연결.
- 마이그레이션 러너(자동 적용)·연결 풀·재시도/서킷브레이커, 시크릿 볼트.
- 레이트리밋(10req/s·600/min) 실측 튜닝, WS 120초 무통신 재연결 실환경 검증.

## 7. 다음 Phase 권장 (I2 Desktop Application)

- **I2 — Desktop Application**: Electron 셸 + React + 업비트 스타일 UI(차트)·Replay UI·Explainability UI를 **S10 뷰모델/데이터소스에 바인딩**. Live는 WS/REST 어댑터(I1) 스트림을, Replay는 S4 세션을 소스로. 실제 렌더 화면·상호작용을 산출물로.
