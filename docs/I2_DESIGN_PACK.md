# I2 — Runtime Integration Design Pack (설계 전용) · v2

**기준 커밋:** `51d8b35` · **상태:** 설계 v2(실시간 거래 UI 요구 반영), 구현 미착수(승인 대기).
**원칙:** 기존 Contracts/ADR/Constitution/Invariant **불변**. 모든 변경 **Additive**. Thin Core · Replay == Live(동일 코드 경로) · Event Sourcing · Point-in-Time · **Browser는 Domain 미참조**.

> 최종 목표: Genesis Trading은 단순 자동매매가 아니라 **업비트처럼 살아 움직이는 실시간 거래 운영 화면**을 갖춘 운영 가능한 거래 플랫폼이다. I2부터 이 방향을 아키텍처 기준으로 반영한다. 단, **I2는 관측(read) 파이프라인까지** — 실주문/실행은 범위 밖(Execution Gateway 이후).

---

## 0. Realtime Trading UI Invariant (신규 불변 원칙, additive)

Presentation Layer는 단순 Dashboard가 아니라 **Production Runtime의 실시간 Market Event Stream을 반영하는 운영 거래 화면**이어야 한다.

- Runtime 상태를 **실시간 반영**한다.
- **Market Event Stream** 기반으로 동작한다.
- **Snapshot + Incremental Update** 를 모두 지원한다.
- **Replay와 Live가 동일한 UI 데이터 경로**(같은 Runtime·같은 DTO·같은 Presentation Pipeline)를 사용한다.
- **Fixture 기반 데이터는 최종 운영 구조에서 제거**한다.

이 원칙은 기존 원칙(Thin Core·Replay==Live·Event Sourcing·Point-in-Time·Browser No-Domain)에 **추가**되며 어느 것도 대체/약화하지 않는다.

---

## 1. Scope / Objectives / Deliverables / Out of Scope

### Scope (재정의)
**Runtime Event Stream → Realtime Trading Presentation Pipeline** 구축.
```
Market Data Stream → Data Layer → Feature Store → Signal → Strategy → Risk → Portfolio → Decision
     → Runtime Event Loop ─┬─ Recording Sink
                           └─ Presentation Stream → Browser Trading UI
```

### Objectives
1. LiveRuntime 기존 주입점에 **risk/portfolio 어댑터** 결선(엔진 소스 무변경, as-of).
2. **Recording Sink**(경계 버퍼)로 tick마다 `RecordedFrame` 축적.
3. **Runtime Event Stream Bridge**: Full Snapshot + Incremental Event(patch) 생산.
4. **Browser Realtime Transport**: 기존 `BrowserAdapter`로 snapshot push + incremental patch.
5. Dashboard가 fixture 대신 **Runtime 생성 DTO** 소비(Read-Only).
6. **Realtime Trading UI Base Layer**: Market/Account/AI Decision View DTO 파이프라인.
7. Replay·Live가 **동일 Runtime·DTO·Pipeline** 사용.

### Deliverables (구현 시 산출, 본 Pack은 설계만)
- `packages/runtime`: risk/portfolio providers, recording sink, **event-stream bridge(snapshot/patch)**, runtime→browser push — 전부 신규 파일/메서드(기존 API 유지).
- `packages/presentation`: MarketView/AccountView/AIDecisionView DTO + 순수 매퍼, **patch codec**(신규, view-codec와 별개).
- 신규 문서: `RFC-I2-runtime-integration`, `ADR-I2A-risk-portfolio-providers`, `ADR-I2B-live-recording-sink`, `ADR-I2C-snapshot-incremental-ui`.
- 신규 테스트: provider point-in-time, recording 결정론, snapshot+patch 일관성, Live==Replay DTO, browser push 격리, view 매퍼.

### Out of Scope
- **실매수/실매도 주문, API Key 주문 실행** — Execution Gateway 이후.
- Upbit 사설 주문, KIS adapter, AI advisory 실행 결선, Production Runtime 실행 통합, 자금 이동.
- Contract/ADR/Constitution/기존 Invariant **수정**. Domain 엔진 소스 변경.
- **가능(O):** 실시간 현재가·호가·체결·차트 데이터·포트폴리오 상태·AI 판단 표시. **불가(X):** 실주문 실행.

---

## 2. Runtime Integration 설계 (계층별, additive)

```
Market Data Stream (Upbit WS: ticker/trade/orderbook)   ── 기존 collector → RawStore
   │  buildMarketSnapshot(records, asOf)  ── past-only(event_time_ms ≤ asOf) = Point-in-Time
   ▼ Feature Store(indicator SSOT) → Signal → Strategy    ── 순수 엔진(기존)
   ▼ Risk → Portfolio   ── [I2] runtime 어댑터가 as-of로 RiskSnapshot/PortfolioSnapshot 생성
   ▼ Decision(SSOT)     ── TradingCore.run(snapshot, risk, portfolio) (기존)
   ▼ Runtime Event Loop ─┬─ Recording Sink(경계 버퍼, RecordedFrame)
                         └─ Presentation Stream(presentSession → DTO + patch)
   ▼ Browser Trading UI  ── BrowserAdapter(snapshot + incremental), DTO 전용, Read-Only
```
- Risk/Portfolio 어댑터는 **runtime 계층**에서 엔진을 감싸 스냅샷 계약으로 변환(엔진·계약 무변경, asOf만).
- `RecordedFrame`은 이미 risk/portfolio/signals/strategy/decision 보유 → **sink는 축적만**, 신규 계약 불필요.
- Live·Replay 모두 **동일 `presentSession`** 호출.

---

## 3. Event Flow 설계 (Snapshot + Incremental)

- **Event 정의(기존, 불변):** `Signal.created`·`Strategy.selected`·`Decision.created`. **신규 도메인 이벤트 추가 없음**(계약 불변). 실시간 UI 패치는 **파생 뷰(RecordedFrame/DTO patch)** 로만 표현.
- **Runtime Tick:** asOf 1사이클 → snapshot(past-only) → risk/portfolio(asOf) → `TradingCore.run` → 이벤트 append + `RecordedFrame` sink 축적.
- **두 전달 모델:**
  1. **Full Snapshot** — 초기 연결·**Replay 복구**·장애 복구. `presentSession(frames,report)` → DashboardSessionView(deeply-frozen DTO).
  2. **Incremental Event(patch)** — 실시간 업데이트. `Trade Event → Market State 변경 → Runtime Event → Presentation DTO patch → Browser Patch Update`. patch는 **DTO diff**(순수 데이터), `BrowserAdapter.pushUpdate`로 전달.
- **Snapshot+Patch 일관성:** 임의 시점 Full Snapshot == (직전 Full Snapshot + 이후 patch 누적 적용). → 신규 invariant 후보(§5).
- **Restore:** replay-engine restore(ADR-012 준수 — **재계산 금지, snapshot restore만**). I2 미변경.
- **Live Loop:** `start(intervalMs)` 주기 tick(결정론·격리, unref).

---

## 4. 실시간 거래 UI 요구 (신규 View, presentation DTO — additive)

모든 View는 **순수 매퍼**(Runtime 파생 데이터 → DTO), **엔진/Domain 미참조**, deeply-frozen·serializable.

### Market View
실시간 현재가 · 체결 스트림 · 호가창 · 거래량 · 캔들 업데이트.
→ RawStore(ticker/trade/orderbook)에서 runtime이 파생한 `MarketView` DTO. (기존 `FeatureView`/`MarketHealthView`는 무변경, 확장 계열로 흡수.)

### Account View
보유 자산 · 평가 금액 · 손익 · **Risk Budget 상태** · **Portfolio 상태**.
→ runtime의 RiskSnapshot/PortfolioSnapshot + positions에서 파생한 `AccountView` DTO. **I2는 paper/시뮬레이션 상태**(실지갑·사설 인증은 범위 밖).

### AI Decision View
현재 Signal · Strategy 상태 · Decision 결과 · Explainability · **Risk 제한(reject) 이유**.
→ 기존 `ExplainabilityDetail`/`DashboardView` DTO 재사용/확장.

---

## 5. Replay == Live 강화 & Invariant 영향

**Replay** `Historical Event → Runtime → Presentation DTO → Browser`
**Live** `Live Event → Runtime → Presentation DTO → Browser`
→ **같은 Runtime · 같은 DTO · 같은 Presentation Pipeline**.

- **기존 48 invariant: 변경 없음.**
- **신규 additive 후보(승인 시, 전부 E 카테고리 · Stub 금지):**
  - `INV-E11` *Provider Point-in-Time* — risk/portfolio provider는 asOf만 사용.
  - `INV-E12` *Live == Replay DTO* — 동일 frames ⇒ 동일 DashboardSessionView.
  - `INV-E13` *Recording Determinism* — 동일 입력·클럭 ⇒ 동일 RecordedFrame 시퀀스.
  - `INV-E14` *Snapshot+Patch Consistency* — Full Snapshot == 이전 Snapshot + patch 누적 적용.
  - `INV-E15` *Realtime Pipeline Isolation* — 실시간 View DTO는 순수·serializable·Domain 미참조.

## 6. ADR / RFC 영향 분석

- **기존 유지(불변):** ADR-012, ADR-S12A, RFC-I3.
- **신규(additive, 기존 미수정):**
  - `RFC-I2-runtime-integration` — 본 Pack v2 확정본(실시간 파이프라인 포함).
  - `ADR-I2A-risk-portfolio-providers` — 엔진→스냅샷 계약 변환 어댑터 경계.
  - `ADR-I2B-live-recording-sink` — 경계 버퍼 기반 Live 기록, replay 스키마 재사용.
  - `ADR-I2C-snapshot-incremental-ui` — Full Snapshot + Incremental patch 모델·일관성 규칙.

---

## 7. 작업 순서 (WBS, v2)

| ID | 작업 | 산출물 | Green Gate |
|---|---|---|---|
| **I2-0** | Design Update(본 v2: Realtime UI Invariant·Event Stream 설계·ADR/RFC 영향) | 본 문서 + 신규 ADR/RFC 초안 | 문서 검토 |
| I2-1 | Risk/Portfolio Provider Adapter | `runtime/providers.ts` + 테스트, ADR-I2A | ci PASS |
| I2-2 | Recording Sink(경계 버퍼) | `frames()`/ring + 테스트, ADR-I2B | ci PASS |
| I2-3 | Runtime Event Stream Bridge(snapshot + patch) | bridge + patch codec + 일관성 테스트, ADR-I2C | ci PASS |
| I2-4 | Browser Realtime Transport | 기존 BrowserAdapter 결선(snapshot/patch) + 격리 테스트 | ci PASS |
| I2-5 | Dashboard DTO Fixture 제거 | dashboard가 Runtime DTO 소비 + render 테스트 | ci + dashboard build |
| I2-6 | Realtime Trading UI Base Layer | Market/Account/AIDecision View DTO + 매퍼 + 테스트 | ci PASS |
| (I2-inv) | 승인 시 additive invariant E11–E15 | registry+checks+테스트 | ci PASS(48→최대 53) |

각 단계: 구현 → 사용자 `npm run build/lint/invariant/test`(및 필요 시 dashboard build) PASS → 다음. 설계 중간 변경 없음.

## 8. 예상 리스크 & 완화

- 결정론 훼손(provider/patch가 wall-clock) → asOf만, `Date.now`/rng 금지, INV-E11/E13.
- Snapshot/patch 불일치 → patch는 DTO diff로만, INV-E14로 강제.
- 메모리 증가(recording) → 경계 ring 버퍼(최근 N), 오래된 것 요약/폐기.
- Browser 장애/backpressure → 기존 `safeSend`+heartbeat+reconnect, Runtime 무영향(INV-E15).
- Dashboard fixture 제거의 브라우저 생성 한계 → DTO는 node(runtime) 생성·주입, 정적 데모는 generate 스크립트.
- 병렬 서피스 desync → 단계별 zip + 사용자 CI 출력으로만 완료 판정.

## 9. 승인 체크리스트

- [ ] 기존 ADR/Constitution/Invariant 무수정
- [ ] 전 변경 additive(신규 파일/메서드/문서), 기존 API·Contract 무변경
- [ ] Thin Core(엔진 순수, 계산은 feature-store)
- [ ] Replay == Live 동일 `presentSession` 파이프라인
- [ ] Event Sourcing·신규 도메인 이벤트 미추가, 파생 뷰/patch만
- [ ] Point-in-Time(past-only snapshot + asOf provider/patch)
- [ ] Browser는 DTO만·Read-Only·Domain 미참조
- [ ] Snapshot + Incremental 둘 다 지원, 일관성 보장
- [ ] 실주문/실행/실거래 범위 밖 유지
- [ ] 단계별 Green Gate로만 진행

---

**요청:** 본 v2 검토 후 **구현 승인**. 승인 시 **I2-1(Risk/Portfolio Provider Adapter)** 부터 additive로 착수한다. 승인 전 구현 미착수.
