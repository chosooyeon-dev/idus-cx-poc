# KPI 시트

> 7개 KPI + Klarna 반면교재. **자동해결률만 잡으면 망함 — Safety Rate를 쌍으로.**

## 7개 KPI

| # | KPI | 정의 | 공식 | 베이스라인 | 목표 (3개월) | 근거 |
|---|---|---|---|---|---|---|
| 1 | **자동해결률** | 인간 개입 없이 종결된 상담 비율 | 자동 종결 건수 / 전체 상담 | ALF 산업 48-70% | **55%** | Klarna 반면교재 — 70% 욕심 X |
| 2 | **CSAT** | 상담 종료 후 만족도 | 5점 척도 평균 | 채널톡 도입 직후 평균 4.1-4.5 | **4.4** | 자동해결률과 쌍으로 모니터링 |
| 3 | **First Response Time** | 첫 응답까지 걸린 시간 | p50, p90 | 채널톡 평균 3s ~ 2h | **5s 이내 (p50)** | ALF 수준, 콜드스타트 회피 |
| 4 | **Safety Rate** ⭐ | 민감 케이스 중 적절히 사람으로 이관된 비율 | 적절 이관 / 민감 케이스 | 표준 없음 | **95%** | Klarna가 놓친 핵심 |
| 5 | **Escalation Precision** ⭐ | 사람 이관의 적절성 | 진짜 인간 필요 / 이관 건 | 없음 | **80%** | 과민/둔감 균형 |
| 6 | **Meta-loop Conversion** ⭐ | 실패 케이스 → 룰·프롬프트 보강 PR 전환율 | 보강 PR / 실패 케이스 | 없음 | **30%** (6개월) | 사용자 노하우 #5 |
| 7 | **멀티모달 Resolution** ⭐ | 이미지 첨부 건의 1차 해결률 | 자동 종결 / 이미지 첨부 건 | 없음 | **60%** | 시나리오 C(VLM) 활성 후 |

⭐ = 채널톡 ALF 표준에 없거나 본 PoC가 새로 제안하는 지표.

## Klarna 반면교재

| 시점 | 사건 |
|---|---|
| 2024 | "AI Assistant가 상담의 2/3 처리, 700명 분량" 발표 |
| 2025 Q1 | CSAT **22% 하락** |
| 2025 Q2 | CEO "AI 너무 밀어붙였다" 공식 인정 |
| 2025 Q3 | 인간 상담사 재고용 시작 |

**교훈**: 자동해결률만 KPI로 잡으면 같은 함정.
**대응**: KPI #1(자동해결률) + #4(Safety Rate) + #5(Escalation Precision)를 **반드시 쌍으로** 모니터링. 자동해결률이 +5%여도 Safety Rate가 -3%면 후퇴.

> 출처: https://fortune.com/2025/05/09/klarna-ai-humans-return-on-investment/

## 측정 방법 (PoC 한계 + 운영 시 보강)

### Eval (LLM judge + GT 20개)
- 합성 `data/conversations.json` 30건 중 **20건을 GT(정답) 라벨링** — 환불·리드타임·추천·하자 분포 유지.
- 매주 LLM judge(같은 모델 또는 더 큰 모델)로 새 응답을 GT와 대조 채점.
- 시작 점수: 사람이 100점이라면 LLM judge는 75-85점 수준 예상.

### Daily failure review (사용자 노하우 #5)
- 매일 **30분** 시간 잡고 **5개 실패 케이스** 리뷰.
- 분류:
  - 룰엔진 잘못 → `refund_policy.ts` 수정 + 단위 테스트 추가
  - LLM 응답 톤 잘못 → 시스템 프롬프트 수정
  - 도구 호출 누락 → 도구 description 보강
- 완료 케이스는 conversations.json에 추가 → eval set 자동 성장.

### A/B (모델·프롬프트 교체 시)
- 50:50 split, 최소 200건/arm.
- **항상 함께 측정**: 자동해결률 + Safety Rate + CSAT.
- 단일 지표 +가 다른 지표 -면 회귀 — 출시 보류.

## PoC가 검증한 부분

| KPI | PoC 검증 상태 |
|---|---|
| #1 자동해결률 | 합성 시나리오 2개 e2e 통과 (시나리오 A·B) |
| #4 Safety Rate | 룰엔진 단위 테스트 18/18 — `human_review` 분기 정확 동작 (case_by_case + escalation ≥3회) |
| #5 Escalation Precision | 동일 주문 N회 카운터 in-process Map으로 검증 |
| #6 Meta-loop | 본 PoC 빌드 자체가 사용자 노하우 #5 적용 사례 (`docs/transcript_highlights.md` 참조) |
| #2/#3/#7 | 운영 단계 측정 — PoC 범위 외 |
