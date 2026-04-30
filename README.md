# 아이디어스 CS 에이전트 — 라이브 시연

> 핸드메이드 마켓플레이스에서 *"환불해주세요"* 한 마디부터 작가 무응답·작품 하자까지,
> CS 시나리오 8종을 **룰엔진이 정책 판정 / LLM이 한국어 응답** 구조로 처리합니다.
> Klarna가 CSAT 22% 잃은 함정(자동해결률만 보기)을 **Safety Rate 쌍 측정**으로 회피.

## 🔗 라이브 URL

**https://idus-cx-poc.vercel.app/** · 시크릿 모드·iPhone Safari 외부 접근 검증 완료

## 한눈에 보는 차별점 3개

- **룰엔진(`refund_policy.ts`)이 정책 판정** — LLM은 응답 작성만. Vitest **18/18 통과**. 환불 가/불·케이스별·부분 4종 분기를 코드로 박아 환각 차단.
- **진짜 idus FAQ 19건 본문 KB** — Playwright + Tesseract Korean OCR + Claude Vision 파이프라인으로 직접 추출 (합성 X). 정책 인용에 진짜 출처 표기.
- **Safety Rate + 자동해결률 쌍 모니터링** — KPI 8축 (Klarna 반면교재). 자동해결률만 자랑하는 PoC가 아닌, *"위험 케이스를 사람한테 제대로 넘기는 비율"* 을 동시에 측정.

## 핵심 가치 (3축 + 차별화 5)

### 3축 — 신뢰 가능한 자동화의 최소 조건
1. **정책 판정은 룰엔진** — 4종 정책(`full_refund / no_refund_after_start / case_by_case / partial_only`) 분기 TS pure function. **단위 테스트 18/18 통과**. LLM은 응답 작성만.
2. **검증 가능성** — 응답 끝에 `sources` JSON 강제 (cited_policy + decision + inquiry_count + faq_id). 평가자가 정책·근거를 그대로 검증 가능.
3. **사람 라우팅** — 동일 주문 환불 ≥3회 + 감정 격앙·법적·VIP 키워드 자동 escalate, ticket_id 진짜 발급(`TKT-XXXXXX`).

### 보강한 5축 — 일반 챗봇 위에 올린 패턴

| # | 보강 | 참고 |
|---|---|---|
| 1 | **Multi-step Discovery dialog** — escalate 전 사진·구매일·증상 자율 수집. 한 턴 1~2개 질문 제한 | Intercom Fin 3 Procedures |
| 2 | **구조화 collected_info + ticket 자동발급** — 담당자 핑퐁 차단 | Sierra 스타일 멀티-스텝 |
| 3 | **부서 자동 라우팅** — 환불·배송·작가·기술 4종 분기 | 자체 (내 운영 패턴 #3) |
| 4 | **환불 → CRM 회복** — 환불 안내 후 같은 작가·비슷한 분위기 작품 카드 자동 추천 | Klarna 후속 회복 사례 + Gorgias Autopilot |
| 5 | **진짜 idus FAQ 본문 그라운딩** — 합성 데이터 X, 19건 진짜 KB 기반 (출처는 sources JSON에만, 본문 노출 X) | Shopify Sidekick RAG 그라운딩 |

## 시연 시나리오 8종

각 시나리오 통과 기준 4축: ① 응답 끝까지 출력 ② 도구 호출 정확 ③ 정책 인용 정확 (KB 본문 일치) ④ 톤 자연 (공감 → 정책 → 가이드 3단).

| 시나리오 | 입력 예시 | 도구 호출 흐름 | 통과 기준 |
|---|---|---|---|
| **A. 선물 추천** | "엄마 환갑 선물 30만원대 도자기 추천" | `lookup_user` → `recommend_gift` | 의미 매칭 추천 3개 + ProductCard 카드 표시 |
| **B. 환불 안내** | "주문한 컵 환불해주세요" | `lookup_user` → `get_user_orders` → `refund_policy_engine` → `lookup_faq` | 룰엔진 결과 + 자연어 정책 풀이 + sources JSON |
| **C. 작품 하자** | "받은 작품에 금이 갔어요" | Discovery (사진·구매일·증상 1~2개) → `escalate_to_human(collected_info)` | ticket_id 진짜 발급 + 담당자 부서 자동 라우팅 |
| **D. 작가 무응답** | "작가가 답이 없어요" | get_user_orders 자동 → 1~2개 명확화 → escalate | FAQ #47 작가 메시지 동선 안내 |
| **E. 부분 환불** | "절반만 환불받을 수 있을까요?" | get_user_orders → refund_policy_engine (partial_only) | 작가 정책별 case_by_case 분기 |
| **F. 교환 요청** | "다른 색으로 바꿀 수 있나요?" | lookup_artist → 작가별 정책 + 메시지 동선 | FAQ #39 교환 정책 자연어 풀이 |
| **G. 배송 조회** | "주문한 거 언제 와요?" | get_user_orders → `track_shipping` | 작가별 평균 리드타임 + 현재 단계 |
| **H. 환불 거부 후 회복** | (시나리오 B/E 후 자동) | recommend_gift (같은 작가·비슷한 분위기) | CRM 회복 흐름 + "장바구니 담기 (시연)" CTA |

각 시나리오 prod e2e 자동 검증 스크립트는 [`scripts/test/scenarios_e2e.ts`](scripts/test/scenarios_e2e.ts). 최근 결과 [`data/eval_scenarios.json`](data/eval_scenarios.json) — **8/8 통과 (100%)**, 평균 응답 12.5초.

LLM Judge 베이스라인: [`scripts/eval/baseline.ts`](scripts/eval/baseline.ts) → [`data/eval_baseline.json`](data/eval_baseline.json). n=5, 평균 2.45/5 (`docs/kpi.md` §"LLM Judge 베이스라인 점수 분석" 참조).

## 스택

- **Frontend / API**: Next.js 15 + Vercel AI SDK 6 + shadcn/ui · Pretendard
- **모델**: OpenRouter `z-ai/glm-4.6` (Chat Completions API). `app/ui/app/api/chat/route.ts` 한 줄로 Sonnet 4.6 / Opus 4.7 / 클라이언트 fine-tune 모델 교체 가능
- **룰엔진**: `app/ui/lib/refund_policy.ts` (TS pure function + Vitest 18/18 통과)
- **데이터·KB**:
  - 합성: 상품 50 / 작가 10 (정책 4종 분포) / 주문 14 / 대화 30 (모두 가명·`010-0000-XXXX` 패턴)
  - **진짜 idus FAQ 19건 OCR 본문**: `data/idus_real_kb_clean.json` (Playwright 헤드리스 → Tesseract 한국어 OCR → Claude Vision 정정)
  - **진짜 idus 채널톡 매크로 응답 트리**: `data/idus_chat_macros.md` (사용자 직접 수집·구조화)
- **배포**: Vercel 단일 프로젝트, rootDirectory `app/ui`

## 데이터 출처와 컴플라이언스

| 영역 | 출처 | 처리 |
|---|---|---|
| 상품·작가·주문·대화 | 합성 (Claude 생성) | 실명·실 전화번호 패턴 회피 |
| 정책 텍스트 | idus.com FAQ #23·#39·#41·#42·#47·#55·#62 (공개) | 저작권법 28조 인용 (출처·범위·목적 충족) |
| 채널톡 매크로 응답 | idus 채널톡 직접 수집 | 운영 톤·동선 학습 목적, 외부 공개 시 출처 표기 |
| 결제·환불 실 처리 | **시연 범위 외** | PoC는 정책 분기·안내까지. 실 도입 시 PG(토스·포트원 등) 연결 + 사람 컨펌 워크플로우 추가 (architecture §8 참조) |
| robots.txt | idus.com `Disallow: /` | 자동 크롤링 X. 사람 브라우저 1회 방문 수준만 |

## 문서

- [`docs/architecture.md`](docs/architecture.md) — Mermaid 흐름 + 비용 4단계 + 한계 + 한국 PG 컴플라이언스 + 일본 확장 + Eval 프레임워크
- [`docs/kpi.md`](docs/kpi.md) — KPI 8개 + Klarna 반면교재 + Cohen's Kappa 측정
- [`docs/transcript_highlights.md`](docs/transcript_highlights.md) — 24h 빌드 막힌 순간 Top 10

## 로컬 실행

```bash
cd app/ui
npm install
cat > .env.local <<EOF
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
EOF
npx next dev   # http://localhost:3000

# 룰엔진 단위 테스트
npx vitest run lib/refund_policy.test.ts   # 18/18 통과
```

## 폴더 구조

```
~/dev/idus-cx-poc/
├── app/
│   └── ui/                    # ← 라이브 URL 본체 (Next.js 15)
│       ├── app/api/chat/      # streamText + tools
│       ├── lib/               # refund_policy.ts(룰엔진) + tools.ts + display.ts + kb.ts
│       ├── components/        # ChatPanel, AgentPanel, ProductCard, OrderCard
│       └── data/              # synthetic JSON + idus FAQ KB
├── data/
│   ├── idus_real_kb_clean.json  # OCR 정정된 idus FAQ 본문 19건
│   ├── idus_chat_macros.md      # idus 채널톡 매크로 트리
│   └── idus_kb/                 # 원본 OCR·정정 마크다운 (참조용)
├── docs/                      # 평가용 문서 3종
└── research/                  # 사전 리서치 자료 (gitignore, push X)
```

## 라이선스

베이스 레포: [openai/openai-cs-agents-demo](https://github.com/openai/openai-cs-agents-demo) (MIT). UI 부분만 차용 + 단일 에이전트로 재작성.

---

## 시연 범위 안내

> ⚠️ 본 시연은 지원자 개인 포트폴리오이며, ㈜아이디어스의 공식 프로젝트가 아닙니다.
> 사용된 정책 텍스트는 아이디어스 공개 FAQ를 학습 목적으로 인용했고, 상품·작가·주문 데이터는 모두 합성입니다.
> 시연 콘솔의 트레이스 패널은 평가자용이며 일반 사용자 노출 X.
