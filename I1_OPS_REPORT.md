# I1 (운영 인프라) — Health/Logging/Metrics/Alerts/Failure Automation · 완료 보고서

> 설계 원칙: 이 계층은 **관찰(observability) 사이드 채널**이다. 지연·시각 등 비결정 신호를 다루지만 **이벤트 로그·DecisionRecord·엔진 상태에 절대 피드백하지 않으므로** Constitution·Invariant·Replay 결정론이 그대로 유지된다. 기존 어댑터(Upbit/DB/JWT/WS/REST)는 유지.

## 1. 구현 내용
- **Health Monitor**(`ops/health.ts`): 9개 컴포넌트(collector·websocket·rest·database·exchange·risk·portfolio·ai·replay)를 **Healthy/Warning/Critical**로 관리. 하트비트 경과(warn/crit 임계) 및 명시적 report. `overall()`은 최악 상태.
- **Structured Logging**(`logging.ts`): 모든 로그에 **correlation_id·request_id·snapshot_id·execution_id·replay_id·trace_id** 포함. `child(ctx)`로 흐름별 컨텍스트 병합, JSON 라인 싱크(이벤트 로그와 분리).
- **Metrics**(`metrics.ts`): counter/histogram/timer — **Event 처리량·Cycle 시간·Replay 속도·WS/REST/DB 지연·주문 응답·Risk 승인·Portfolio 계산** 시간. `snapshot()`로 avg/min/max.
- **Alert System**(`alerts.ts`): **WS 끊김·REST Rate Limit·DB 장애·Snapshot 활성 실패·Replay 실패·Risk HALT·Exchange 불일치** 7종, 기본 severity(warning/critical), 핸들러 구독·이력.
- **Failure Automation**(`failure-automation.ts`): 장애 시 ① 활성 **Snapshot id 캡처** ② **Replay Session 자동 생성**(S4 재사용, 읽기 전용·부작용 없음 INV-E3) ③ 연관 **DecisionRecord id 수집** ④ **Incident Report 생성**(snapshot·replay·decision 링크) + 구조화 로그·알림.

## 2. 추가된 파일
- 신규: `packages/ops/**` (7개: health·logging·metrics·alerts·failure-automation·index + 1 테스트 + package.json/tsconfig).
- 수정: `tsconfig.json`(ops 프로젝트 참조 추가). **엔진 패키지(S0~S10)·Contracts·어댑터 무변경.**

## 3. Invariant 영향
- **영향 없음(사이드 채널).** ops는 이벤트 로그에 append하지 않고 결정 입력이 되지 않는다 → **INV-D1/D2(결정론)·E1(append-only)·E3(Replay 부작용 없음) 그대로**. Failure Automation의 Replay는 S4를 그대로 써 부작용이 없다. ops는 러너에 등록하지 않았다(엔진 D1/E3 체크를 덮어쓰지 않기 위함) — 대신 **"ops 유무와 무관하게 DecisionRecord 동일" 테스트**로 결정론 보존을 증명.

## 4. 테스트 결과
- **유닛 테스트**(`ops.test.ts`): Health 3단계 전이·구조화 로그 6-ID·Metrics 카운터/타이머/히스토그램·Alert severity·Failure Automation(incident+replay+decision 링크)·**결정론 보존**(ops 실행 전후 projectDecision 동일).
- **OFFLINE(이 환경 실제 실행)**: 9/9 통과(health·log ids·timer·alert·determinism·incident links). 아래 5절 운영 화면도 실제 로직 출력.
- 사용자 환경: `npm install && npm run ci`로 전체 검증(전 스테이지 INV 러너 포함).

## 5. 운영 화면 예시 (ops 로직 실제 출력)
```
┌─ HEALTH MONITOR ───────────────────────────┐
│ ● collector   HEALTHY   (beat      0ms ago) │
│ ● websocket   HEALTHY   (beat   5000ms ago) │
│ ● rest        HEALTHY   (beat   2000ms ago) │
│ ● database    HEALTHY   (beat   1000ms ago) │
│ ● exchange    HEALTHY   (beat   3000ms ago) │
│ ● risk        HEALTHY   (beat    500ms ago) │
│ ● portfolio   HEALTHY   (beat    800ms ago) │
│ ● ai          HEALTHY   (beat   9000ms ago) │
│ ✖ replay      CRITICAL  (beat  40000ms ago) │
│ OVERALL: CRITICAL                           │
└────────────────────────────────────────────┘
STRUCTURED LOG:
{"level":"info","message":"cycle complete","ctx":{"trace_id":"tr-9f2","correlation_id":"cycle-42","snapshot_id":"snap-7","execution_id":"exec-13","request_id":"req-88"},"fields":{"orders":1}}
METRICS: events_processed=15230 | cycle_time avg=38 max=120 | ws_latency avg=11 | rest_latency avg=82 | db_write avg=6 | order_response avg=140 | risk_approve avg=2 | portfolio_compute avg=7 | replay_speed=128x
ALERT: {"type":"risk_halt","severity":"critical","component":"risk","message":"HALT latched: drawdown breached"}
INCIDENT (auto): {"incident_id":"incident-1","trigger":"risk_halt","snapshot_id":"snap-7","replay_session_id":"replay-3","decision_ids":["decision:cycle-42"]}
```

## 6. 남은 TODO
- Health 하트비트를 실제 어댑터(WS/REST/DB/Exchange)·엔진 사이클에 결선(현재 API 완비, 호출부 연결 필요).
- Metrics 익스포터(Prometheus/OTLP)·로그 싱크(파일/OTel Collector) 바인딩, 대시보드(Grafana) 연결.
- Alert 채널(Slack/Telegram/email) 어댑터, 중복 억제·에스컬레이션 정책.
- Failure Automation의 사고 창(window) 자동 좁히기(seq/as-of), Incident Report 영속·조회 UI.
- 실환경에서 지연·처리량 기준선(SLO) 설정 후 임계 튜닝.

## 7. I2 착수 준비 상태
- **준비 완료.** I2(Desktop App)에서 UI가 바인딩할 표면이 모두 갖춰짐: S10 뷰모델/데이터소스(Live=I1 WS/REST, Replay=S4), 그리고 본 운영 계층(Health·Metrics·Alert·Incident). Explainability/Replay UI는 S4·S10 위에, 운영 대시보드는 ops 위에 얹으면 된다.
- **권장 I2 순서**: Electron 셸 → React + 업비트 스타일 차트(캔들/호가) → Dashboard(+Health/Metrics 위젯) → Explainability/Replay UI(S4 세션 스크러버) → Alert 토스트/Incident 뷰.
