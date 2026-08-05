# S9 — AI Layer · 완료 보고서

## 1. 구현한 내용
- **AI Coordinator + 4 서브 AI**(`agents.ts`,`platform.ts`): Market/Strategy/Parameter/Report AI — 각자 자기 Proposal만 생성, 서로 수정 안 함(불간섭). `AILayer`가 Proposal Repository·조율. 산출은 **Proposal뿐**.
- **Proposal Lifecycle**(`proposal-lifecycle.ts`): Draft→Candidate→Validated→Approved→Rejected→Archived. **모든 전이 Event Sourcing**(AI.proposalCreated/Transitioned/Validated).
- **AI Memory**(`ai-memory.ts`): Proposal History·Success/Failure·**Confidence Calibration(오차)**·Drift 분석. **시장 Memory와 분리된 자기 성능 기록**, 재현 가능.
- **Frozen Artifact**(`frozen-artifact.ts`): Validated Proposal → frozen config, **content hash**·**Provenance(model/prompt/artifact_version + input_refs)**. **재현성은 frozen 아티팩트+결정론 런타임에서 나옴**(LLM 재실행 아님). approval_signature는 **서명 Manifest(거버넌스)로만** 설정 — AI 자가승인 불가.
- **Research 연동**(`platform.ts`): `submitToResearch`가 **유일한 아웃바운드 경로**(S5로만). **Production 직접 연결 없음**(submitToProduction/deploy 메서드 부재).
- **구조적 차단**(`isolation.ts`): `AI_CAPABILITIES` 전부 false — 계좌·주문 API·Risk·Execution·Exchange 접근 없음, **Data Plane LLM 호출 0**, **AI→Production 인터페이스 0**.
- **Explainability**: Proposal rationale·provenance 서명·`generateReport`(human-readable, DecisionRecord id 연결).
- **Event Sourcing**: AIProposalCreated/Validated·ArtifactFrozen·AIReportGenerated append-only(해시체인).
- **Invariant 체크**(`invariants.ts`): D3·S3·V3·V5 → 러너 연결.

## 2. 변경된 파일
- 신규: `packages/ai-layer/**` (10개: types·isolation·proposal-lifecycle·ai-events·agents·ai-memory·frozen-artifact·platform·invariants·index + 1 테스트 + package.json/tsconfig).
- 수정: `src/invariant-validate.ts`(ai 체크 등록), `tsconfig.json`(참조 추가).

## 3. Contracts 변경 여부
- **없음.** `@genesis/contracts` 불변. AIProposal/FrozenArtifact/AI 이벤트는 **내부 타입**(RFC-001/002가 정식 편입 대상). research-platform(S5)로만 의존, production-engine(S8) 의존 없음(구조적 분리).

## 4. Invariant 영향 여부
- **위반 없음.** 신규 준수: **INV-D3**(실행 루프 LLM 0·capabilities 전부 false)·**INV-S3**(계좌/주문/Risk/Execution/Exchange 접근 없음)·**INV-V3**(승인 서명 없는 아티팩트는 Production 부적격)·**INV-V5**(provenance·버전·해시 기록). 러너에 4개 체크 등록.

## 5. 테스트 결과
- **Test First**: 유닛 테스트 1파일 6케이스(격리·서브AI 산출·라이프사이클 이벤트소싱·freeze 검증·Research 전용 경로·AI Memory 캘리브레이션).
- 오프라인(네트워크 차단·npm 미설치)이라 vitest 전체 실행 불가 → **핵심 로직 독립 검증(Node) 13/13 통과**(격리 D3/S3·라이프사이클·V3 적격성·V5 provenance·freeze 결정론·calibration).
- 사용자 환경: `npm install && npm run ci`로 최종 검증(전 스테이지 INV 러너 포함).

## 6. 남은 TODO
- 실 LLM 연결(오프라인 스텁 → 실제 model/prompt 바인딩), 실제 결정론 컴파일러(proposal→정적 스키마 정규화).
- AI 제안이 Research(S5) WFV/Shadow 게이트를 통과한 뒤에만 Manifest 서명 대상이 되는 승격 파이프라인 실제 결선.
- Calibration 지표 기반 신뢰도 가중(거버넌스 판단), Drift 경보 임계·조치.
- RFC-001/002/D 정식 채택 시 AI 이벤트·Snapshot provenance를 `@genesis/contracts`로 승격.
- Explainability 서사가 DecisionRecord 사실과 일치하는지 자동 검증(Fact Accuracy).

## 7. 다음 Playbook Stage 권장 (S10 Presentation Layer)
- **S10 — Presentation(UI)**: 읽기 전용 projection UI, 쓰기 표면은 ControlCommand(실행/정지/긴급청산)뿐, Dashboard/Market/Portfolio/Strategy/Diary/**Explainability View**(결정→전체 타임라인)/**Replay Mode**(S4 재사용). 입력 문서: Presentation UI 설계, S4(Replay), Contracts(Event→Decision), INV(E). 모든 표시는 Event/DecisionRecord/Snapshot 출처로 드릴다운.
