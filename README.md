# 아이디어스 CS 에이전트 PoC

> 채널톡 AX Consultant 과제 — 핸드메이드 마켓플레이스용 CS 에이전트 (단일 에이전트 + 룰엔진).
>
> **본 시연은 지원자 개인 포트폴리오이며, ㈜아이디어스의 공식 프로젝트가 아닙니다.**

## 라이브 URL
[배포 URL — Vercel 배포 후 채워넣음]

## 핵심 가치 3개

1. **정책 판정은 룰엔진** — 환불 가능 여부는 4종 정책(`full_refund / no_refund_after_start / case_by_case / partial_only`) 분기 룰엔진이 결정. LLM은 응답 작성만.
2. **검증 가능성** — 응답 끝에 `sources` JSON 코드블록 강제 (cited_policy + decision + inquiry_count). 평가자가 정책·근거를 그대로 검증 가능.
3. **사람 라우팅** — 동일 주문 환불 문의 ≥3회 시 자동 매니저 이관.

## 시연 시나리오

| 시나리오 | 입력 예시 | 도구 호출 흐름 |
|---|---|---|
| **A. 선물 추천** | "엄마 환갑 선물로 30만원대 도자기 추천해주세요" | `recommend_gift` → 추천 3개 + 작가·평점·리드타임 |
| **B. 환불 안내** ⭐ | "주문 #1234 환불해주세요. 색상이 마음에 안 들어서요" | `lookup_order` → `refund_policy_engine`(룰엔진) → 한국어 응답 + sources |

## 스택

- **Frontend / API**: Next.js 15 + Vercel AI SDK 6 + shadcn/ui
- **모델**: OpenRouter `z-ai/glm-4.6` (Chat Completions API). `lib/.../route.ts` 한 줄로 Sonnet 4.6 / 클라이언트 fine-tune 모델 교체 가능.
- **룰엔진**: TS pure function (`app/ui/lib/refund_policy.ts`). 단위 테스트 **18/18** 통과 (4종 정책 × 단계 매트릭스 + escalation 3건 + sources schema).
- **데이터**: 합성 JSON — 상품 50 / 작가 10(정책 4종 분포) / 대화 30.
- **배포**: Vercel 단일 프로젝트, rootDirectory `app/ui`.

## 문서

- [`docs/architecture.md`](docs/architecture.md) — 아키텍처 메모 (Mermaid 데이터 흐름 + 비용 4단계 + 한계 + 다음 단계)
- [`docs/kpi.md`](docs/kpi.md) — KPI 7개 + Klarna 반면교재
- [`docs/transcript_highlights.md`](docs/transcript_highlights.md) — 빌드 중 막힌 순간 Top 5

## 로컬 실행

```bash
cd app/ui
npm install
echo "OPENROUTER_API_KEY=sk-or-v1-..." > .env.local
echo "OPENROUTER_BASE_URL=https://openrouter.ai/api/v1" >> .env.local
npx next dev   # http://localhost:3000

# 룰엔진 단위 테스트
npx vitest run lib/refund_policy.test.ts
```

## 라이선스

베이스 레포: [openai/openai-cs-agents-demo](https://github.com/openai/openai-cs-agents-demo) (MIT).
- `app/ui/` — v0 라이브 URL이 사용하는 부분. 도메인 교체 + 단일 에이전트로 재작성.
- `app/python-backend/` — Phase 2 검증 자산 (룰엔진 17/17 + OpenAI Agents SDK 핸드오프 e2e). v0 라이브 URL은 이걸 호출하지 않음. 단일 에이전트 결정의 **검증된 출발점**으로 보존.
