# I1-ops — 종료 승인서 (Release Sign-off)

읽기 전용 AI Decision Viewer 기준선. 실거래·주문·Execution·Paper Trading·Portfolio·Risk Budget·Wallet·Auto-Trading는 구현 범위에서 제외. Constitution·I1/I2(Thin Core·Deterministic Runtime·Event Sourcing·Decision SSOT) 및 ADR-012·ADR-S12A·RFC-I3 계승.

## 1. 승인 대상

- **Baseline Commit:** `49749f5`
- **범위:** I1-ops 기준선 봉인 + Presentation Browser Boundary(S12A) 완료
- **판정:** ✅ **승인(APPROVED)** — 아래 CI Gate 전 항목 PASS

## 2. CI Gate 검증 결과 (최종)

| Gate | 결과 |
|---|---|
| Build (`tsc -b`) | ✅ PASS |
| Lint (ESLint) | ✅ PASS |
| Format Check (Prettier) | ✅ PASS |
| Contract Validate | ✅ PASS |
| Invariant Validate | ✅ PASS — **48/48** invariants checked, 0 failing, 0 not-implemented (**64 checks / 13 packages**) |
| Test (Vitest) | ✅ PASS — **170 tests / 38 files** |

## 3. 완료 확인 항목

1. **아키텍처 불변식 유지** — 순수 엔진(IO·시계·난수 없음), 단일 시계 경계(`systemNowMs`), Decision SSOT 불변, Event Sourcing 유지.
2. **Replay == Live** — 결정론 재현(ADR-012: restore-only, projection 재계산 금지) 유지.
3. **Presentation Browser Boundary(S12A) 완료** — presentation 의존 그래프 `{contracts, invariant-runner, replay-engine}`로 정리(엔진/도메인 참조 0), DTO는 deeply-frozen·JSON 직렬화(INV-E8/E10), 읽기 전용(INV-E9), 순수 매핑(INV-E6/E7). Browser transport adapter는 DTO 전용·장애 격리.
4. **Contracts 동결** — 계약 변경 없음.
5. **읽기 전용 엣지** — Console/Browser 경로에 실행·주문·지갑 없음.

## 4. Invariant 커버리지 (48)

Base D/T/R/V/S/E/A + TC1–TC6(Trading Core) + R9/R10/R11(결정론 재현·부작용 없음·transport 직교) + E6–E10(순수 매핑·비즈니스 로직 없음·browser boundary/직렬화 DTO·읽기 전용·DTO immutable/No Runtime Leak).

## 5. 문서 정합성

- `I1_COMPLETION_REPORT.md` — 최종 검증 결과(49749f5, 48/48, 170 tests) 반영 완료.
- `docs/adr/ADR-012-replay-reproject-vs-recompute.md` — restore-only 원칙 유효.
- `docs/adr/ADR-S12A-presentation-browser-boundary.md` — browser boundary 결정 유효, 본 종료 시점 기준 구현과 일치.
- `docs/rfc/RFC-I3-operator-console.md`, `docs/S12_PLAN.md`, `docs/S12_PRESENTATION_DESIGN_PACK.md` — 후속(라이브 통합) 계획 참조.

## 6. 잔여/후속 (본 승인 범위 밖, additive)

Risk/Portfolio 실연결 → Paper Execution → Upbit 사설 인증 → KIS Adapter → AI advisory 결선 → Production Runtime 통합. 실주문·실거래는 I4/I5까지 범위 밖.

## 7. 서명

- 검증 기준: commit `49749f5`, CI Gate 전 항목 PASS
- 판정: **APPROVED — I1-ops 기준선 봉인 및 S12A 완료 승인**
- 후속 작업은 신규 브랜치에서 진행하며 본 기준선을 파괴적으로 변경하지 않는다.
EOF
echo done