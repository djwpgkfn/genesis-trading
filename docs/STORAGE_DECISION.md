# Storage Decision (S1) — 요구사항 매트릭스 & 권고

> Constitution: "설계가 기술을 선택한다." 데이터 모델(S1)이 확정된 뒤 객관적으로 선택.
> 코드는 `RawStore`(+ 향후 CandleStore/DecisionStore) **인터페이스에만** 의존한다. 아래는 어댑터 선택 권고이며, 인터페이스 덕분에 교체 가능하다.

## 요구사항

| 요구                                          | 근거               |
| --------------------------------------------- | ------------------ |
| 초고빈도 append (전 KRW 종목 틱·호가), 무손실 | INV-E1, DoD 무손실 |
| 불변 append-only + bitemporal as-of 질의      | INV-T1, T3         |
| 대용량 분석 스캔(백테스트) + 강한 압축(cold)  | 로드맵 백테스트    |
| 캔들·결정·메타는 트랜잭션 정합                | INV-V, E           |
| 파생 재생성 용이(L1→캔들/피처)                | INV-T4             |

## 평가 (요약)

| 후보                     | 강점                                | 약점                  | 적합 영역      |
| ------------------------ | ----------------------------------- | --------------------- | -------------- |
| ClickHouse               | 초고빈도 append·컬럼 압축·분석 스캔 | 트랜잭션 약함         | 원시 틱/호가   |
| PostgreSQL + TimescaleDB | as-of·트랜잭션·하이퍼테이블         | 초고빈도 원시엔 비용↑ | 캔들·결정·메타 |
| Parquet + object storage | 저비용 cold 아카이브·압축           | 실시간 질의 부적합    | 장기 보존      |

## 권고 (하이브리드)

- **원시 틱/호가(hot)** → ClickHouse (또는 Parquet 랜딩) : 무손실 고빈도.
- **캔들·DecisionRecord·메타** → PostgreSQL + TimescaleDB : as-of·트랜잭션.
- **장기 보존(cold)** → Parquet on object storage, 심볼/일자 파티션 + 압축.
- 전 KRW 종목 폭 확보 + 저유동성 종목 호가 그룹핑으로 비용 조절.

## 상태

권고안 확정. 실제 어댑터(위 인터페이스 구현)는 인프라 provisioning 시 바인딩. S1 코드는 `InMemoryRawStore` 참조 구현으로 결정론 테스트 가능.
