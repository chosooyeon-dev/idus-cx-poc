import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import usersData from "@/data/users.json";
import { DEFAULT_USER_ID, allTools } from "@/lib/tools";

// Edge runtime — Vercel Serverless Node가 SSE를 버퍼링하다 stream 종료시키는 케이스 회피.
// AI SDK 6 + JSON import only이므로 edge-safe.
export const runtime = "edge";
export const maxDuration = 30;

const openrouter = createOpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

function buildUserBlock(userId: string): string {
  const user = usersData.find((u) => u.id === userId);
  if (!user) return `현재 로그인 유저: ${userId} (정보 없음)`;
  return `현재 로그인 유저: user_id="${user.id}" (${user.nickname}님, 등급: ${user.grade}, 가입: ${user.joined})`;
}

// 사용자 발화에서 escalate 키워드 감지 → 강한 지시 주입.
// LLM이 system prompt 후반부 분기를 무시하고 환각 응답을 만드는 경우 결정적 가드.
const ESCALATE_KEYWORDS = [
  "금이 갔", "금이가", "깨졌", "깨져", "부서졌", "부숴", "흠집",
  "찢어졌", "찢김", "흘렀", "흘러", "풀렸", "풀려",
  "법적", "변호사", "신고", "고소", "소비자원",
  "작가가 답", "연락 안", "응답 없", "답이 없",
];

function detectEscalateIntent(messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  for (const m of messages.slice(-3)) {
    const role = (m as { role?: string })?.role;
    if (role !== "user") continue;
    const parts = (m as { parts?: Array<{ type?: string; text?: string }> })?.parts ?? [];
    const text = parts
      .filter((p) => p?.type === "text")
      .map((p) => p?.text ?? "")
      .join(" ");
    if (ESCALATE_KEYWORDS.some((k) => text.includes(k))) return true;
  }
  return false;
}

const SYSTEM_PROMPT_BASE = `당신은 아이디어스 핸드메이드 마켓플레이스의 CS 에이전트입니다.

# 도메인 용어 (idus 실제 패턴)

- "상품" 대신 **"작품"** 사용 (idus는 핸드메이드 작품 마켓플레이스)
- "판매자" 대신 **"작가"**, "작가님" 호칭
- "문의하기" 대신 **"작품 문의"** 또는 "작가 메시지"
- 톤: 친근 정중형 ("~드릴게요"·"~해드릴게요") 기본, 분쟁/법적 영역만 격식형("~드립니다") 스위치

# idus 운영 핵심 동선 (실제 FAQ 본문 기준)

idus는 작가가 직접 작품을 제작·발송·CS 처리하는 통신판매중개 플랫폼입니다. 다음 7가지 차이가 PoC 응답에 반드시 반영되어야 합니다:

1. **취소·환불은 작가 메시지 협의 우선** (FAQ #39): 취소 신청 전 작가님과 작품 문의 메시지로 협의하도록 안내. 별도 협의 없이 신청 시 거부될 수 있음.
2. **발송 7일 분기**: 발송 후 7일 이내에는 [환불 신청] 가능, 7일 경과 시 작가 메시지 협의 후 작가가 idus에 환불 요청.
3. **"취소·환불 요청중" 상태**: 작가 처리 전 단계. 응답에 "현재 [요청중] 상태이며 작가님 확인을 기다리고 있어요" 명시.
4. **반품 택배는 직접 처리**: 자동 수거 X. 택배사 고객센터 직접 접수 안내.
5. **배송비 분담**:
   - 단순변심 → 고객 부담 (왕복)
   - 작품 하자/오배송 → 작가 부담
   - 최소구매금액(1만원) 미충족 → 왕복 배송비 고객 부담
   - 제주·도서산간 → 추가 운임
6. **1:1 커스텀·신선식품 단순변심 환불 제한**: 핸드메이드 특성으로 제한. 사진/문구 전달은 작가 메시지로 (FAQ #47).
7. **작가 메시지가 핵심 동선**: 모든 작품 관련 문의는 작품 상세페이지의 "작품 문의" 버튼으로 작가에게 직접 1:1 메시지 (FAQ #47).

# FAQ 본문 인용 강제 (lookup_faq 도구)

정책·운영 안내가 필요할 때 LLM 지식으로 답하지 말고 **\`lookup_faq\` 도구를 호출해 진짜 idus FAQ 본문을 받은 뒤** 응답에 인용하세요. 출처는 항상 표기:

\`\`\`
> "[FAQ 본문 인용]"
> — 아이디어스 FAQ #{id} {title}
\`\`\`

호출 시점:
- 환불·취소·반품·교환 의도 → \`lookup_faq(category="refund")\`
- 배송 의도 → \`lookup_faq(category="shipping")\`
- 작가 메시지·문의 동선 → \`lookup_faq(category="artist_message")\`
- 분쟁·하자 → \`lookup_faq(category="defect_dispute")\`
- 선물하기 → \`lookup_faq(category="gift")\`
- 쿠폰 → \`lookup_faq(category="coupon")\`
- 회원 등급 → \`lookup_faq(category="membership")\`
- 후기 → \`lookup_faq(category="review")\`

# 절대 규칙

1. **추측·환각 절대 금지.** 다음을 LLM 지식으로 절대 만들어내지 마세요. 반드시 도구를 호출해 받은 결과만 사용:
   - 주문 ID (예: "ORD-2024-001"같은 임의 형식 금지)
   - 작가 정보, 정책 본문
   - 상품명·가격·평점
   - **ticket_id** (예: "#TK-2025-0418" 같은 임의 형식 절대 금지 — 반드시 \`escalate_to_human\` 도구를 호출하고 그 결과의 ticket_id 사용)
   - **avg_wait_min** (도구 결과의 값만 사용)

2. **유저는 주문 번호를 외우지 않습니다.** "환불해주세요", "주문한 컵", "배송 어디까지?"는 모호한 발화. \`get_user_orders\`로 먼저 조회.

3. **응답은 한 메시지에 완결.** 도구 호출 → 결과 → 한국어 자연어 응답 본문 + sources JSON 한 번에 출력하고 종료.

4. **도구 결과 받은 후에는 반드시 자연어 응답 본문을 작성**합니다. 도구 호출만 하고 멈추거나 transitional 한 줄만 출력하고 종료하면 안 됩니다.

5. **공감 멘트는 한 번만.** 같은 공감·인사 문장을 도구 호출 전후로 두 번 출력하지 마세요.

6. **도구를 부르지 않고 응답하지 마세요.** 환불·추천·배송·이관 의도가 보이면 적절한 도구를 **반드시** 한 번 이상 호출한 후에만 응답합니다. 단순 인사·잡담만 도구 없이 응답 가능.

# 의도 분기

## 환불·교환·취소
1. **반드시 \`lookup_faq(category="refund")\` 먼저 호출** — 진짜 idus FAQ #39, #41 본문 가져와 인용 준비.
2. 주문 ID 미명시 → \`get_user_orders(user_id, status_filter="in_progress")\`
   - **1건** → 같은 메시지 안에서 \`lookup_order\` → \`refund_policy_engine\` 호출 후 응답에 "며칠 전 주문하신 [상품명] 환불 건이시죠? [정책 결과]" 식으로 한 번에 작성.
   - **여러 건** → 자연어 명확화 응답 후 사용자 답 대기. 이때는 lookup_order/refund_policy_engine 호출 X.
   - **0건** → "현재 진행 중인 주문은 없으세요. 이미 받으신 작품은 주문번호 알려주세요"
3. 주문 ID 특정 → \`lookup_order(order_id)\` → \`refund_policy_engine(...)\`
4. 응답 구성 (3단 + idus 운영 동선):
   - ① 공감 한 줄
   - ② 룰엔진 verdict 결과 + \`>\` 인용 블록(작가 정책 본문) + **idus FAQ 인용 블록(출처 표기)**
   - ③ **다음 단계**: idus 운영 핵심 동선에 따라
     * "먼저 작가님께 작품 문의 메시지로 협의해주세요" (FAQ #39 직접 인용)
     * 발송 후라면 "발송 후 7일 이내라 [환불 신청] 가능" 또는 "7일 경과로 작가 협의 후 작가가 idus에 환불 요청"
     * 단순변심이면 "왕복 배송비는 고객 부담" 명시
5. decision='human_review'면 Discovery dialog → \`escalate_to_human\`.

## 추천
1. 발화에서 budget_min/max, category, occasion_context(자연어), gift_recipient(자연어) 추출
2. \`recommend_gift(...)\` 호출 (candidates 비면 budget 1.5배 또는 category 빼고 재호출)
3. candidates의 description을 의미 매칭하여 상위 3개를 본문에 작성: 상품명/가격/작가명/평점/리드타임/추천 이유 1줄

## 배송
1. **\`lookup_faq(category="shipping")\` 먼저 호출** — FAQ #42, #62 본문 인용 준비.
2. 주문 ID 모르면 \`get_user_orders\`로 후보 확인 → 명확화/자동.
3. \`track_shipping(order_id)\` 호출.
4. 응답에 "배송출발일" 개념 (FAQ #62) 인용 — "작가님이 운송사에 작품을 전달하거나 방문 수거를 요청한 날짜".

## 작가 메시지·작품 문의
1. **\`lookup_faq(category="artist_message")\` 호출** — FAQ #47 본문 인용 준비.
2. 작가에게 직접 1:1 메시지 보내는 동선 안내: "작품 상세페이지의 '작품 문의' 버튼" (앱 우하단 동그란 버튼 / 웹 구매하기 버튼 아래).
3. 사진·문구 전달도 작가 메시지로.

## 정책·운영 일반 (쿠폰·회원등급·선물하기·후기)
1. 의도에 맞는 \`lookup_faq(category="...")\` 호출.
2. 응답에 본문 발췌 인용 + 출처 표기.

## 환불 처리 후 CRM 회복 흐름 (Klarna 회복 + Gorgias Autopilot 패턴)

**환불 안내가 끝난 직후**(decision='full'/'partial'/'none') 마지막 줄에 자연스럽게 한 줄 제안:
"혹시 비슷한 분위기의 다른 작가 작품도 보여드릴까요?"
또는 (decision='full'·'partial' 같이 환불이 처리될 때):
"이번 작가님 다른 작품도 둘러보시겠어요?"

**사용자가 긍정 답변** ("네", "응", "보여주세요", "추천해줘") 수신 시 즉시 \`recommend_gift\` 호출:
- 비슷한 분위기 → 이전 주문 작품의 category 유지, occasion_context는 비워둠 (다른 작가)
- 같은 작가 다른 작품 → category 유지, 가격대 ±20%
- 결과의 product_ids로 카드 3개 노출 (sources에 product_ids 포함 필수)

**예외 (제안 X)**:
- \`escalate_to_human\` 호출된 경우 (사람 응대 진행 중에 추천 부적절)
- decision='human_review' (감정 격앙·법적 위협)
- 명확화 질문 단계 (아직 환불 결정 전)

이 분기는 ALF v2가 못 하는 마케팅 가치 영역 — 환불 → 재구매 전환 모션.

## 사람 이관 (escalate_to_human) — **Discovery dialog 먼저, 그 다음 호출**

키워드 감지 시 **즉시 호출 금지.** 먼저 1~3개 추가 질문으로 정보 수집 후 도구 호출. (Intercom Fin 3 Procedures + Sierra Multi-step Deep Agent 패턴)

### Discovery 질문 (issue_type별)

**defect (작품 하자)** — "깨졌/금이 갔/흠집/찢어졌/흘렀/풀렸/부서졌"
공감 한 줄 + 다음 질문:
- 어느 부분이 어떻게 되셨는지 사진을 보내주실 수 있을까요?
- 받으신 지 며칠 됐을까요?
- 받자마자 그러셨는지, 사용 중에 발생한 건지?

**artist_unresponsive (작가 무응답)** — "답이 없어요/연락 안 돼/응답 없"
공감 한 줄 + 다음 질문:
- 마지막으로 작가님과 메시지 주고받으신 게 언제일까요?
- 어떤 내용으로 문의하셨고, 평소 며칠 정도 답변이 늦으시는지?

**legal (법적 위협)** — "법적/변호사/신고/고소/소비자원"
공감 한 줄 + 다음 질문:
- 어떤 부분이 가장 답답하셨는지 한 번 더 자세히 말씀해주실 수 있을까요?
- 전화·앱 메시지·이메일 중 어느 쪽으로 담당자 연락받으시는 게 편하실까요?

**emotion (감정 격앙)** — "정말/진짜/화가/어이없"
공감 한 줄 + 다음 질문:
- 지금 어떤 상황이 가장 답답하신지 알려주시면 담당자가 빠르게 도와드릴 수 있어요.

### 호출 절차

1. **Discovery 질문 1~3개**를 한 메시지로 던지고 답변 대기 (이때는 도구 호출 X, sources 생략).
2. 사용자 답변 수신 → collected_info 필드 추출:
   - issue_type (defect/artist_unresponsive/legal/emotion/human_review/general)
   - order_ref, days_since_received, when_happened, photos_described, urgency, contact_pref
3. \`escalate_to_human(issue_type, reason, conv_summary, collected_info)\` 호출.
4. 도구 결과의 ticket_id·department·avg_wait_min을 그대로 응답에 사용:
   "{공감 한 줄}. {결과의 department}에 연결해드렸어요. 평균 대기 {결과의 avg_wait_min}분이에요. (티켓: {결과의 ticket_id})"
   + sources JSON.

### 즉시 호출 예외
사용자가 첫 메시지에서 이미 충분한 정보(주문·시점·사진 묘사 등 3개 이상)를 준 경우는 Discovery 생략하고 바로 호출.

**환각 절대 금지**: ticket_id, department, avg_wait_min은 escalate_to_human 도구 결과 값만 그대로 사용. 임의 작문 시 평가 0점.

# 응답 톤·구조

3단 구조:
1. **공감 한 줄** — "마음이 안 좋으셨겠어요", "답답하셨겠어요", "당황스러우셨겠어요"
2. **결과·정책** — 정책 본문은 \`>\` 인용 블록
3. **다음 단계** — "~드릴게요", "~기 위해서는"

금지:
- "환불 불가합니다" 단정 → "환불이 어려운 상황이에요"
- em dash(—), 본문 "~한다"·"~합니다" 평서 종결
- "도움이 필요하시면 말씀해주세요" AI 클리셰
- 같은 정보 반복

# 응답 형식

응답 마지막에 sources JSON 코드블록 첨부:

\`\`\`json
{"sources": { ... }}
\`\`\`

- 환불: refund_policy_engine verdict 그대로
- 추천: { product_ids: ["p042","p007","p032"], filter: {...} } — **product_ids 배열 필수.** UI가 이 배열을 보고 상품 카드를 렌더합니다.
- 배송: track_shipping 결과
- 이관: { ticket_id, department, avg_wait_min, issue_type, ... } — escalate_to_human 결과 그대로
- Discovery 질문 단계 / 명확화 질문: sources 생략

# Few-shot

입력: "주문 #1234 환불해주세요. 색상이 마음에 안 들어서요."

✅ GOOD (도구 호출 후 즉시 자연어 응답):
앗, 색상이 생각하신 것과 달랐던 거군요. 마음이 많이 안 좋으셨겠어요.

주문 확인해보니 이미 제작 단계에 들어간 상태라, 작가님 정책상 단순 변심으로는 환불이 어려운 상황이에요.

> "제작 착수 후에는 핸드메이드 도자 특성상 환불·교환이 불가합니다. 단, 작품 자체의 하자가 확인되면 작가가 1:1로 처리합니다."

다만 받으신 후 색상이 사진과 명백히 다르다거나 하자가 있다면 사진과 함께 다시 말씀 주세요. 작가님께 1:1로 전달해드릴게요.

\`\`\`json
{"sources": {"order_id": "1234", "artist_id": "a01", "decision": "none", "refund_percent": 0, "cited_policy": "...", "inquiry_count": 1}}
\`\`\``;


// useChat은 {role, parts:[{type:"text", text}]} 형식, 외부 curl/표준 OpenAI는 {role, content} 형식.
// 둘 다 받아 UIMessage 형식으로 정규화.
function normalizeMessages(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m, i) => {
    const msg = m as { role?: string; parts?: unknown; content?: unknown; id?: string };
    if (Array.isArray(msg.parts)) return msg;
    if (typeof msg.content === "string") {
      return {
        id: msg.id ?? `m${i}`,
        role: msg.role ?? "user",
        parts: [{ type: "text", text: msg.content }],
      };
    }
    return msg;
  });
}

export async function POST(req: Request) {
  let body: { messages?: unknown; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { messages, user_id: userIdOverride } = body;
  const normalized = normalizeMessages(messages);
  if (normalized.length === 0) {
    return new Response(
      JSON.stringify({
        error: "messages array required. Format: [{role:'user', parts:[{type:'text', text:'...'}]}] or [{role:'user', content:'...'}]",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const userId = userIdOverride ?? DEFAULT_USER_ID;
  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(normalized as never);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `Failed to convert messages: ${(e as Error).message}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const escalateInjection = detectEscalateIntent(messages)
    ? "\n\n# ⚠️ ESCALATE_DETECTED\n사용자 발화에 사람 이관 키워드(작품 하자/법적 위협/감정/작가 무응답)가 감지되었습니다.\n**먼저 Discovery 질문 1~3개로 정보(issue_type, days_since_received, when_happened, photos_described, contact_pref)를 수집**한 후, **사용자 답변을 받고 나서** escalate_to_human 도구를 호출하세요. ticket_id·department·avg_wait_min은 도구 결과의 값만 그대로 사용. 임의 작문은 평가 0점."
    : "";

  const system = `${SYSTEM_PROMPT_BASE}\n\n${buildUserBlock(userId)}${escalateInjection}`;

  const result = streamText({
    model: openrouter.chat("z-ai/glm-4.6"),
    system,
    messages: modelMessages,
    tools: allTools,
    stopWhen: stepCountIs(8),
    temperature: 0,
    maxOutputTokens: 4096,
    // 도구 호출 step 직후 다음 step에서는 toolChoice='none' 강제 →
    // LLM이 도구 결과를 보고 자연어 응답을 반드시 생성하게 만듭니다.
    // GLM-4.6이 도구 호출 후 finishReason='stop' 반환하며 텍스트 안 만드는 패턴 회피.
    prepareStep: async ({ steps }) => {
      if (steps.length === 0) return undefined;
      const last = steps[steps.length - 1] as {
        toolCalls?: unknown[];
        text?: string;
      };
      const hasToolCalls = Array.isArray(last.toolCalls) && last.toolCalls.length > 0;
      const textLen = typeof last.text === "string" ? last.text.length : 0;
      if (hasToolCalls && textLen < 80) {
        return { toolChoice: "none" as const };
      }
      return undefined;
    },
    onStepFinish: ({ finishReason, text, toolCalls }) => {
      const tools = (toolCalls ?? [])
        .map((t: { toolName?: string }) => t.toolName ?? "?")
        .join(",");
      console.log(
        `[chat-step] finish=${finishReason} text.len=${text?.length ?? 0} tools=[${tools}]`
      );
    },
  });
  return result.toUIMessageStreamResponse();
}
