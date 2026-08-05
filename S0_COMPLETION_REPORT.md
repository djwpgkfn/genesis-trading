# S0 — Repository Foundation · 완료 보고서

**단계**: Playbook S0 (Repository Foundation)
**언어/런타임 결정**: TypeScript 모노레포 (Node ≥20, npm workspaces). _Python 선호 시 전환 가능._
**참조 문서**: Constitution, System Contracts, Invariant Registry, Playbook S0 (그 외 설계 문서 미로드).

## 1. Repository Tree

```
genesis-trading/
├─ package.json / tsconfig.base.json / tsconfig.json      # workspaces, strict TS, project refs
├─ .eslintrc.cjs / .prettierrc.json / .gitignore          # lint/format + 결정론 가드(Math.random/Date.now 경고)
├─ vitest.config.ts
├─ README.md / S0_COMPLETION_REPORT.md
├─ docs/            README.md, DEVELOPMENT_RULES.md        # 규칙만(설계는 Design Pack)
├─ contracts/       @genesis/contracts (타입 전용)
│   └─ src/ common.ts event.ts snapshot.ts manifest.ts decision.ts index.ts
├─ packages/
│   └─ invariant-runner/  @genesis/invariant-runner
│       └─ src/ registry.ts(33 INV) runner.ts cli.ts index.ts
├─ tools/
│   └─ contract-validate/  계약 타입 존재·정합 검사(빌드 실패 = CI 실패)
├─ src/            README.md (composition root, S8까지 placeholder)
├─ tests/          contracts.base.test.ts, invariant-runner.test.ts
├─ scripts/        ci-local.sh / ci-local.ps1
├─ configs/        default.config.json (시크릿 없음, timezone=Asia/Seoul)
└─ .github/workflows/ci.yml
```

문서(docs/·Design Pack)와 코드(contracts/·packages/·src/)가 분리됨.

## 2. 공통 타입 정의 (contracts/, 타입 전용 — 세부 구현 없음)

- `common.ts`: 브랜드 타입 UUID/Hash/ISOTimestamp/Version/SnapshotId/CorrelationId + 생성자, `CONTRACTS_SCHEMA_VERSION`.
- `event.ts`: **EventEnvelope** (event_id·event_type·event_time·ingest_time·seq·source_engine·schema_version·snapshot_id?·correlation_id·causation_id?·payload·prev_hash?·hash).
- `snapshot.ts`: **ProductionSnapshot** — 결정 영향 모든 요소 pin(전략·피처셋·리스크·포트폴리오·엔진·MTF·health·score·memory_method·correlation·수수료·마켓규칙·timezone·rng seed|none).
- `manifest.ts`: **DeploymentManifest** + Approval(서명).
- `decision.ts`: **DecisionRecord** (projection; source_event_ids 역추적, memory_snapshot_ref 포함).

## 3. Event Base

공통 envelope 확정. 구체 이벤트 타입(MarketData/RiskDecided/…)은 S3에서.

## 4. Snapshot Base

전체 pin 필드를 가진 기본 타입 확정. 생성기/검증기는 이후 단계.

## 5. CI 구조 (.github/workflows/ci.yml + `npm run ci`)

Build → Lint → Format check → **Contract validation** → **Invariant validation** → Unit test. 6개 자동 검사.

## 6. Invariant Runner 구조

- `registry.ts`: Invariant Registry v1의 **33개 규칙(D/T/R/V/S/E/A)** ID·statement 등록(체크 함수는 미구현).
- `runner.ts`: 단계별로 `registerCheck(id, fn)`로 실제 검사 연결. 미구현 규칙은 `not-implemented`로 보고(실패 아님). `fail` 발생 시 CI 실패.
- `cli.ts`: CI 엔트리포인트.

## 7. Development Rules (docs/DEVELOPMENT_RULES.md)

결정론 유지 · Event First · Contract First · Test First · Replay 가능 · Snapshot 기반 · Constitution 위반 금지 + 사전 5점 게이트.

## 8. Definition of Done — 점검

- [x] Repository 구조 확정
- [x] Contracts 기본 타입 확정 (Event/Snapshot/Manifest/DecisionRecord)
- [x] Event 기본 구조 확정
- [x] Snapshot 기본 구조 확정
- [x] CI 동작 구조 (6검사, `npm run ci`)
- [x] Invariant Runner 준비 (33 규칙 등록, 실행 골격)
- [x] S1 즉시 착수 가능 상태

## 이번 단계에서 하지 않은 것 (범위 준수)

Data Layer / WebSocket / REST / Feature Store / AI / UI / Risk Engine — 미구현.

## 실행 방법 (사용자 환경, Windows)

```
npm install
npm run ci
```

> 작성 환경은 네트워크가 차단되어 있어 install/build를 실행하지 않았습니다. 로컬에서 `npm install` 후 `npm run ci`로 검증하세요.

## 다음 단계

**Playbook S1 (Data Layer)** — WebSocket Collector · REST Backfill · Raw Landing · Event 저장. 입력 문서: Data Layer 설계, Contracts(Event 표준), INV(T,E). S1 진입 시 저장 기술을 요구사항 매트릭스로 확정.
