# KPI 시트

> 8개 KPI + Klarna 반면교재. **자동해결률만 잡으면 망함 — Safety Rate를 쌍으로.**
> 측정 인프라는 Shopify Sidekick 패턴(LLM Judge + Cohen's Kappa) + 내 운영 패턴 #5(daily failure review).

## 8개 KPI

| # | KPI | 정의 | 공식 | 베이스라인 (출처) | 목표 (3개월) | 근거 |
|---|---|---|---|---|---|---|
| 1 | **자동해결률** | 인간 개입 없이 종결된 상담 비율 | 자동 종결 건수 / 전체 상담 | 브랜든 80.1%, 콜로소 80.8% (channel.io 공개 사례) · ALF 평균 44.9% (2025-10) | **55%** | Klarna 반면교재 — 70% 욕심 X |
| 2 | **CSAT** | 상담 종료 후 만족도 | 응답 후 thumb up/down 또는 5점 척도 | 채널톡 도입 직후 평균 4.1-4.5 · 아임웹 4.2/5 | **4.4** | 자동해결률과 쌍 모니터링 |
| 3 | **First Response Time (p50)** | 첫 응답까지 걸린 시간 | streamText 첫 토큰까지의 시간 | ALF 평균 3초 이내 | **3초 (p50)** | 콜드스타트 회피 |
| 4 | **Time to First Value (TTFV)** ⭐ | 사용자가 가치 있는 답을 받기까지의 시간 | 첫 응답 X, 의미 있는 도구 결과·정책·추천이 전달된 시점까지 | Sierra·Ada 핵심 KPI, 표준 없음 | **15초 이내** | "답이 도착했다"는 FRT vs "쓸 수 있는 답이 도착했다"는 TTFV. 사용자 체감 직결 |
| 5 | **Safety Rate** ⭐ | 민감 케이스 중 적절히 사람으로 이관된 비율 | 적절 이관 / 민감 케이스 (분쟁·VIP·법적·강한 감정) | 표준 없음 | **95%** | Klarna가 놓친 핵심 |
| 6 | **Escalation Precision** ⭐ | 사람 이관의 적절성 | 진짜 인간 필요 / 이관 건 | 없음 | **80%** | 과민/둔감 균형 |
| 7 | **Meta-loop Conversion** ⭐ | 실패 케이스 → 룰·프롬프트 보강 PR 전환율 | 보강 PR / 실패 케이스 | 없음 | **30%** (6개월) | 내 운영 패턴 #5 |
| 8 | **멀티모달 Resolution** ⭐ | 이미지 첨부 건의 1차 해결률 | 자동 종결 / 이미지 첨부 건 | 없음 | **60%** | 시나리오 C(VLM) 활성 후 |

⭐ = 채널톡 ALF 표준에 없거나 본 PoC가 새로 제안하는 지표.

## Klarna 반면교재

| 시점 | 사건 |
|---|---|
| 2024-02 | "AI Assistant가 상담의 2/3 처리, 700명 분량" 발표. CSAT 인간 수준 유지 자랑 |
| 2025-Q1 | CSAT **22% 하락** |
| 2025-Q2 | CEO "AI 너무 밀어붙였다" 공식 인정 |
| 2025-Q3 | 인간 상담사 재고용 시작 (원격·유연 근무 대상으로 학생·부모·농촌 채용) |

**교훈**: 자동해결률만 KPI로 잡으면 같은 함정.

**대응**: KPI #1(자동해결률) + #5(Safety Rate) + #6(Escalation Precision)를 **반드시 쌍으로** 모니터링. 자동해결률이 +5%여도 Safety Rate가 -3%면 후퇴 = 출시 보류.

> 출처: https://fortune.com/2025/05/09/klarna-ai-humans-return-on-investment/
> https://www.reworked.co/employee-experience/klarna-claimed-ai-was-doing-the-work-of-700-people-now-its-rehiring/

## 측정 인프라

### 1. Eval (LLM Judge + GT 20개 + Cohen's Kappa)

해외 FDE 패턴 (Shopify Sidekick) 정직 차용:

```
[GT 라벨링 — 1회]
  data/conversations.json 30건 중 20건을 사람이 정답 라벨링
  분포: 환불 7 / 리드타임 4 / 추천 4 / 하자 3 / 기타 2

[LLM Judge — 매주]
  같은 모델(GLM-4.6) 또는 큰 모델(Sonnet 4.5)이 새 응답을 GT와 대조 채점 (5점)
  채점 항목: 정책 인용 정확도 / decision 적절성 / 톤 자연스러움 / escalate 적절성

[일치도 측정 — 매월]
  Cohen's Kappa: LLM Judge ↔ 인간 라벨러 일치도
  목표: 0.6+ (Shopify Sidekick 공개 0.61 vs 인간 0.69 기준)
  0.6 미만 → LLM Judge 재학습 또는 큰 모델로 교체

[루프]
  점수 떨어진 케이스 → 내 운영 패턴 #5 daily review로 룰·프롬프트 보강
```

> Shopify Sidekick 출처: https://shopify.engineering/building-production-ready-agentic-systems

### 1-1. KB Recall / Precision (RAG 그라운딩 측정)

LLM Judge 외에 KB(`idus_real_kb_clean.json`) 그라운딩 자체의 정확도를 별도 측정:

| 지표 | 정의 | 공식 | 목표 |
|---|---|---|---|
| **KB Recall** | 정답 FAQ가 응답에 인용된 비율 | 인용된 정답 FAQ 수 / GT의 정답 FAQ 수 | **0.85+** |
| **KB Precision** | 인용된 FAQ 중 진짜 관련 비율 | 관련 FAQ 인용 / 전체 FAQ 인용 | **0.90+** |
| **KB Faithfulness** | 응답 본문이 인용 FAQ 본문과 일치하는 비율 | 본문 일치 응답 / 전체 KB 인용 응답 | **0.95+** |

> Precision이 떨어지면 *"엉뚱한 FAQ 끌어옴"*, Recall이 떨어지면 *"있는 KB를 못 찾음"*, Faithfulness가 떨어지면 *"인용은 했는데 본문은 환각"*. 셋 다 따로 본다.

GT 라벨링 시 *"이 질문에 대한 정답 FAQ ID"* 컬럼 추가 → 자동 계산 가능.

### 1-2. 매출 chain — Cohen's Kappa → 매출

Eval 점수가 매출에 어떻게 연결되는지 직관적 chain:

```
Cohen's Kappa 0.7 (Judge ↔ 사람 일치)
   ↓ Judge가 신뢰 가능 → 매주 자동 채점·PR 가능
   ↓ 룰·프롬프트 보강 속도 ↑
정책 인용 정확도 ↑ → CSAT +0.3 (4.1 → 4.4)
   ↓ 만족 응답 비율 ↑
재방문율 +5% (월 1회 → 월 1.05회)
   ↓ 거래 빈도 ↑
인당 연 매출 +10% (idus 평균 객단가 30K 기준 +3K/년)
   ↓ × 활성 사용자 수 (idus 추정 100만)
연 매출 영향 ~30억원 (단일 클라이언트 단순 추정)
```

> 추정치. 실 운영은 retention cohort 분석 + CSAT 회귀로 검증 필요. Klarna 사례에서 보듯 CSAT 22% 하락은 매출 직격, 역도 성립.

### 2. Daily failure review (내 운영 패턴 #5)

매일 **30분**, **5개 실패 케이스** 리뷰:

| 분류 | 처리 |
|---|---|
| 룰엔진 잘못 | `refund_policy.ts` 수정 + 단위 테스트 추가 |
| LLM 응답 톤 잘못 | system prompt 수정 (3단 구조 강화) |
| 도구 호출 누락 | 도구 description 보강 + few-shot 추가 |
| KB 인용 부정확 | `idus_real_kb_clean.json` 보강 또는 `lookup_faq` 도구 retrieval 개선 |

완료 케이스는 `conversations.json`에 추가 → eval set 자동 성장.

### 3. A/B (모델·프롬프트 교체 시)

50:50 split, 최소 200건/arm. **항상 함께 측정**: 자동해결률 + Safety Rate + CSAT + TTFV.

| 결과 | 결정 |
|---|---|
| 모든 지표 + 또는 동등 | 새 버전 채택 |
| 자동해결률 + / Safety Rate - | **회귀 — 출시 보류** |
| CSAT - / 다른 지표 + | 회귀 — 출시 보류 |
| TTFV - / 다른 지표 + | 사용자 체감 후퇴 — 출시 보류 |

## PoC가 검증한 부분 (솔직 표기)

| KPI | PoC 검증 상태 | 비고 |
|---|---|---|
| #1 자동해결률 | **시나리오 8종 prod e2e 8/8 통과** (`data/eval_scenarios.json`) — 응답 끝까지·도구 호출 정확·출처 본문 X·sources JSON 4축 자동 검증 통과 | 평균 응답 12.5초, 합성 트래픽 |
| #1.5 LLM Judge 베이스라인 (n=5) | **평균 2.45/5** — `data/eval_baseline.json`. 축별 citation 2.2 / decision 2.4 / tone 3.4 / escalate 1.8. 한 시나리오(쿠폰)만 4.75. | 측정 자체가 PoC 한계 점검 — §아래 분석 |
| #2 CSAT proxy | thumb up/down 위젯 + 헤더 카운터 ('👍 N · 👎 M · CSAT N%') 운영 — localStorage 누적. PoC에서 1차 측정 인프라 작동 | 운영 단계 운영 트래픽 + 익명 통계 백엔드 필요 |
| #3 FRT | 시나리오 A·B는 도구 호출 후 ~12초 내 의미 있는 응답 (Sonnet 4.5 multi-step) | 콜드스타트 + Edge runtime |
| #5 Safety Rate | 룰엔진 단위 테스트 **18/18 통과** — `human_review` 분기 정확 동작 (case_by_case + escalation ≥3회 + 감정·법적·하자 키워드 escalate_to_human 자동) | 합성 escalate 패턴 검증 |
| #6 Escalation Precision | 동일 주문 N회 카운터 in-process Map으로 검증 (한계 §10 — 운영은 Redis 필요) | |
| #7 Meta-loop | 본 PoC 빌드 자체가 사례. `transcript_highlights.md`의 10개 막힘 → 룰·프롬프트 보강 PR | 메타 loop 작동 증거 |
| #4 TTFV / #8 멀티모달 | **운영 단계 측정 — PoC 범위 외**. VLM 도구 미구현 (시나리오 C v0.5) | |

### LLM Judge 베이스라인 점수 분석 (2026-04-30, n=5)

`scripts/eval/baseline.ts`로 5건 — Sonnet 4.5에 'idus CS 시니어 매니저' 페르소나로 GT 응답 작성 → GT vs PoC 응답을 같은 모델에 4축 5점 척도 평가.

| 시나리오 | citation | decision | tone | escalate | avg | Judge reasoning 요약 |
|---|---|---|---|---|---|---|
| A 선물 추천 | 1 | 1 | 3 | 1 | 1.50 | GT는 '검색 안내'·PoC는 '특정 작품 추천' — 응답 방향 충돌 |
| B 환불 안내 | 2 | 2 | 3 | 1 | 2.00 | 작가 직접 소통 동선·정책 안내 누락 |
| C 작품 하자 Discovery | 1 | 2 | 3 | 1 | 1.75 | 정책 인용 없이 역질문만 (Discovery 단계라 의도적이지만 Judge가 -점) |
| E 부분 환불 | 2 | 2 | 4 | 1 | 2.25 | 정책 인용 없이 주문 확인만 |
| **H 쿠폰** | **5** | **5** | **4** | **5** | **4.75** | KB 인용 정확, decision 적절, 거의 만점 |

**솔직한 한계**:
1. **GT 페르소나의 보수적 idus CS 매니저** vs **PoC의 ALF 차별화 패턴** 충돌 — 특히 선물 추천(A)에서 idus는 "특정 작품 추천 안 함" 원칙이라 PoC의 `recommend_gift` 흐름이 -점. 이는 PoC의 "ALF 미답 영역 정조준" 가설(README §보강 5축 #4 CRM 회복)과 정합 — 진짜 idus 운영 측정과 다른 베이스라인.
2. **Discovery 단계 응답(C)** 에 정책 인용 강제하면 -점 — system prompt는 의도적으로 Discovery 단계 sources 생략 허용. Judge가 GT와 직접 비교하니 1점 차이 발생.
3. **KB 인용·decision·escalate가 한 응답에 모두 들어간 케이스(H)** 만 4.75 — KB 그라운딩 강도가 강할 때는 Judge도 인정.

**개선 방향** (사용자 노하우 #5 daily review):
- 환불 응답에 작가 메시지 동선("작품 문의" 버튼)을 더 명시적으로 (B·E score 개선)
- Discovery 단계와 정책 응답 단계를 Judge prompt에서 구분 (C score 개선)
- A는 PoC 의도(추천 차별화) 그대로 유지 — KPI 평가 시 시나리오 가중치 분리

## 운영 시 대시보드 구조 제안

```
[일일]                    [주간]                [월간]
└─ 자동해결률             └─ Cohen's Kappa     └─ Safety Rate vs Klarna
└─ Safety Rate            └─ failure review #   └─ 모델 교체 A/B 결과
└─ FRT (p50/p90)          └─ Meta-loop PR #     └─ 누적 내 운영 패턴 #5
└─ TTFV (p50)             └─ KB 보강 #          └─ TTFV 분포
└─ Escalation Precision
└─ 신규 시나리오 카테고리 분포
```

본 PoC는 **8축 KPI + LLM Judge 측정 인프라 + Daily failure review 루프**를 적용. 자동해결률 단일 지표가 아닌 다축 모니터링으로 안전한 자동화를 지향.
