# I1 실환경 검증 · 보고서 (정직 보고)

> 이 작성 환경(샌드박스)은 **아웃바운드 네트워크 egress 차단 + Docker 없음 + DB/Upbit 키 없음**임이 실제 시도로 확인됨. 따라서 라이브·DB·CI 검증은 여기서 물리적으로 불가하며, **가상 출력을 만들지 않았다.** 아래는 실제 실행 결과만 담는다.

## 1. 실제 검증 완료 항목 (이 환경에서 진짜 실행됨)

- **JWT 인증 — 암호학적 정확성**: HS256 서명 생성·검증(올바른 키 verify=true, 잘못된 키 거부), query_hash=SHA512(128자, 결정론). `node:crypto`로 실제 실행 통과. (단, *서버 수락*은 라이브 필요 → 5절.)
- **정적 산출물 일관성**: 어댑터(jwt/rest/ws/exchange/live.integration)·DB 스토어·마이그레이션·docker-compose·.env.example 모두 존재. ClickHouse `raw_records` DDL, Timescale `create_hypertable('candles')`, **events append-only 규칙(INV-E1)**, compose에 두 DB 포함 — 실제 grep 확인.

## 2. 실패한 항목 (실제 시도 결과)

- **npm install / npm run ci**: `npm error code E403 — 403 Forbidden GET registry.npmjs.org`. 레지스트리 접근 차단.
- **Upbit REST/WS 연결**: `fetch(api.upbit.com) → HTTP 403`(egress 프록시 차단). 실제 접속 불가.
- **docker-compose 기동 / PG / Timescale / ClickHouse / Collector→DB / Exchange 주문 / 장애 자동화(라이브)**: **Docker 미설치**(확인됨) + 네트워크 차단으로 시도 불가.

## 3. 수정한 내용

- **코드 결함으로 인한 실패 아님.** 위 실패는 전적으로 **샌드박스 환경 제약**(egress 차단·Docker 부재·키 없음)이 원인이다. 따라서 지어낸 코드 수정은 없다(원칙 4·5 준수). 코드 레벨에서 고칠 대상이 발견되지 않았고, 검증은 네트워크 환경으로 이동해야 한다.
- 유일한 조치: 당신 환경에서 항목별로 그대로 실행할 **VERIFICATION_RUNBOOK.md**(1~8 + PASS 기준)를 제공.

## 4. 실제 실행 로그 (이 환경)

```
$ npm install --no-audit --no-fund
npm error code E403
npm error 403 Forbidden - GET https://registry.npmjs.org/@types%2fnode

$ node -e "fetch('https://api.upbit.com/v1/market/all')..."
upbit reachable HTTP 403            # egress 차단(실접속 아님)

$ which docker
docker NOT available

$ node jwt_check.mjs
signature verifies: true | wrong-secret rejects: true
query_hash (sha512) len: 128 === 128: true | deterministic: true
RESULT: Upbit JWT + query_hash verified OFFLINE (node:crypto)

$ (static) grep migrations/compose
OK clickhouse raw_records DDL | OK timescale hypertable | OK append-only events rule (INV-E1) | OK compose has both DBs
```

## 5. 아직 검증하지 못한 항목 (전부 사용자 네트워크 환경 필요)

1. Upbit REST 실제 연결(200) · 2. Upbit WebSocket 실시간 수신 · 3. JWT 서버 수락(사설 accounts 200) · 4. PostgreSQL 연결 · 5. TimescaleDB 저장/조회 · 6. ClickHouse 저장/조회 · 7. Collector→DB 저장 · 8. Exchange Adapter 주문 흐름(최소금액/취소) · 9. 장애→Alert→Incident→Replay 자동 · 10. docker-compose 전체 기동 · 11. `npm run ci` 통과.
   → 모두 **VERIFICATION_RUNBOOK.md**의 1~8 단계로 실행·판정.

## 6. I1 Definition of Done 충족 여부

- **미충족(NOT MET).** DoD는 위 11개 항목의 **실제 환경 PASS**를 요구하는데, 이 샌드박스에서는 암호(JWT)·정적 일관성만 실증 가능했고 라이브/DB/CI는 실행 자체가 불가능했다.
- **판정 경로**: 당신 Windows 환경에서 러너북 1~8을 실행 → 전부 PASS면 I1 DoD 충족. 실패 항목은 실제 로그와 함께 알려주면 원인 분석·코드 수정 후 재검증한다.
- **I2는 착수하지 않는다** — 모든 항목이 실환경에서 PASS로 확인될 때까지 보류.
